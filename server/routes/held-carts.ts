import { Router } from "express";
import { pool, withTransaction } from "../db/pool";
import { currentUser, requireAuth, requireCashier } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { priceCartLine } from "../lib/pricing";
import { emitEvent } from "../lib/realtime";
import type { HeldCartDto, HeldCartItemDto } from "../lib/serializers";
import {
  cartItemsSchema,
  heldCartInputSchema,
  parseId,
  roundMoney,
  roundQuantity,
} from "../lib/validation";

export const heldCartsRouter = Router();
heldCartsRouter.use(requireAuth);
heldCartsRouter.use(requireCashier);

const MAX_HELD_CARTS_PER_SESSION = 20;

interface HeldCartRow {
  id: string;
  cash_session_id: string;
  created_by: string;
  created_by_name: string;
  label: string;
  note: string | null;
  items: unknown;
  created_at: Date | string;
}

interface HeldProductRow {
  id: string;
  name: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  stock: number;
  is_active: boolean;
  deleted_at: Date | string | null;
}

const heldCartSelect = `
  SELECT h.id, h.cash_session_id, h.created_by, u.name AS created_by_name,
         h.label, h.note, h.items, h.created_at
  FROM held_carts h
  JOIN users u ON u.id = h.created_by
`;

async function findOpenSessionId(
  client: Pick<typeof pool, "query"> = pool,
  lock = false,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM cash_sessions WHERE status = 'open' ${lock ? "FOR SHARE" : ""} LIMIT 1`,
  );
  return result.rows[0]?.id ?? null;
}

function fallbackLineTotal(
  item: { quantity: number; unitPrice?: number; negotiatedTotal?: number },
  product: HeldProductRow | undefined,
): number {
  if (item.negotiatedTotal !== undefined) return roundMoney(item.negotiatedTotal);
  if (item.unitPrice !== undefined) return roundMoney(item.unitPrice * item.quantity);
  if (product) return roundMoney(Number(product.selling_price) * item.quantity);
  return 0;
}

async function hydrateHeldCarts(rows: HeldCartRow[]): Promise<HeldCartDto[]> {
  if (rows.length === 0) return [];

  const parsedRows = rows.map((row) => ({
    row,
    items: cartItemsSchema.parse(row.items),
  }));

  const productIds = Array.from(
    new Set(parsedRows.flatMap(({ items }) => items.map((item) => item.productId))),
  ).sort();

  const [productsResult, settingsResult] = await Promise.all([
    pool.query<HeldProductRow>(
      `SELECT id, name, unit, cost_price, selling_price, stock, is_active, deleted_at
       FROM products
       WHERE id = ANY($1::uuid[])`,
      [productIds],
    ),
    pool.query<{ scale_rounding: number }>(
      "SELECT scale_rounding FROM store_settings WHERE id = 1",
    ),
  ]);
  const productsById = new Map(productsResult.rows.map((product) => [product.id, product]));
  const scaleRounding = Number(settingsResult.rows[0]?.scale_rounding ?? 0);

  return parsedRows.map(({ row, items }) => {
    let totalQuantity = 0;
    let estimatedTotal = 0;

    const cartItems: HeldCartItemDto[] = items.map((item) => {
      const product = productsById.get(item.productId);
      let lineTotal = fallbackLineTotal(item, product);

      if (product) {
        try {
          lineTotal = priceCartLine(
            {
              name: product.name,
              costPrice: Number(product.cost_price),
              sellingPrice: Number(product.selling_price),
              unit: product.unit,
            },
            {
              quantity: item.quantity,
              unitPrice: item.unitPrice ?? null,
              negotiatedTotal: item.negotiatedTotal ?? null,
            },
            scaleRounding,
          ).lineTotal;
        } catch {
          // Estimasi tetap ditampilkan walau harga produk berubah sejak
          // keranjang ditahan. Checkout akan memvalidasi ulang secara ketat.
        }
      }

      totalQuantity = roundQuantity(totalQuantity + item.quantity);
      estimatedTotal = roundMoney(estimatedTotal + lineTotal);

      return {
        productId: item.productId,
        productName: product?.name ?? "Produk tidak ditemukan",
        unit: product?.unit ?? "",
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? null,
        negotiatedTotal: item.negotiatedTotal ?? null,
        lineTotal,
        availableStock: product ? Number(product.stock) : 0,
        isActive: Boolean(product && product.is_active && !product.deleted_at),
      };
    });

    return {
      id: row.id,
      cashSessionId: row.cash_session_id,
      label: row.label,
      note: row.note,
      createdBy: { id: row.created_by, name: row.created_by_name },
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
      itemCount: cartItems.length,
      totalQuantity,
      estimatedTotal,
      items: cartItems,
    };
  });
}

async function getHeldCartById(id: string): Promise<HeldCartDto | null> {
  const result = await pool.query<HeldCartRow>(`${heldCartSelect} WHERE h.id = $1`, [id]);
  const [heldCart] = await hydrateHeldCarts(result.rows);
  return heldCart ?? null;
}

heldCartsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const sessionId = await findOpenSessionId();
    if (!sessionId) {
      res.json({ items: [], total: 0 });
      return;
    }

    const result = await pool.query<HeldCartRow>(
      `${heldCartSelect}
       WHERE h.cash_session_id = $1
       ORDER BY h.created_at DESC`,
      [sessionId],
    );
    const items = await hydrateHeldCarts(result.rows);

    res.json({ items, total: items.length });
  }),
);

heldCartsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = heldCartInputSchema.parse(req.body);

    for (const item of body.items) {
      if (item.unitPrice !== undefined && item.negotiatedTotal !== undefined) {
        throw new AppError(400, "Pilih nego harga satuan atau total item, bukan keduanya.", {
          code: "INVALID_NEGOTIATION",
        });
      }
    }

    const heldCartId = await withTransaction(async (client) => {
      const sessionId = await findOpenSessionId(client, true);
      if (!sessionId) {
        throw new AppError(409, "Kas belum dibuka. Keranjang hanya bisa ditahan saat kas terbuka.", {
          code: "CASH_SESSION_CLOSED",
        });
      }

      // Serialisasi pembuatan hold per sesi agar batas jumlah tidak terlewati
      // saat dua kasir menyimpan keranjang hampir bersamaan.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `held-carts:${sessionId}`,
      ]);

      const countResult = await client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM held_carts WHERE cash_session_id = $1",
        [sessionId],
      );
      if (countResult.rows[0].count >= MAX_HELD_CARTS_PER_SESSION) {
        throw new AppError(
          409,
          `Maksimal ${MAX_HELD_CARTS_PER_SESSION} keranjang ditahan per sesi kas. Lanjutkan atau hapus salah satu terlebih dahulu.`,
          { code: "TOO_MANY_HELD_CARTS" },
        );
      }

      const requestedQuantityByProduct = new Map<string, number>();
      for (const item of body.items) {
        requestedQuantityByProduct.set(
          item.productId,
          roundQuantity((requestedQuantityByProduct.get(item.productId) ?? 0) + item.quantity),
        );
      }
      const productIds = Array.from(requestedQuantityByProduct.keys()).sort();

      const productsResult = await client.query<HeldProductRow>(
        `SELECT id, name, unit, cost_price, selling_price, stock, is_active, deleted_at
         FROM products
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
         ORDER BY id
         FOR SHARE`,
        [productIds],
      );
      if (productsResult.rows.length !== productIds.length) {
        throw new AppError(409, "Beberapa produk tidak tersedia lagi. Muat ulang keranjang Anda.");
      }
      const productsById = new Map(productsResult.rows.map((product) => [product.id, product]));

      const settingsResult = await client.query<{ scale_rounding: number }>(
        "SELECT scale_rounding FROM store_settings WHERE id = 1 FOR SHARE",
      );
      const scaleRounding = Number(settingsResult.rows[0]?.scale_rounding ?? 0);

      for (const productId of productIds) {
        const product = productsById.get(productId)!;
        const requestedQuantity = requestedQuantityByProduct.get(productId)!;

        if (!product.is_active) {
          throw new AppError(409, `Produk "${product.name}" sudah tidak dijual.`);
        }
        if (Number(product.stock) < requestedQuantity) {
          throw new AppError(
            409,
            `Stok "${product.name}" tidak mencukupi. Tersedia ${Number(product.stock)} ${product.unit}.`,
            { code: "INSUFFICIENT_STOCK" },
          );
        }
      }

      for (const item of body.items) {
        const product = productsById.get(item.productId)!;
        priceCartLine(
          {
            name: product.name,
            costPrice: Number(product.cost_price),
            sellingPrice: Number(product.selling_price),
            unit: product.unit,
          },
          {
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? null,
            negotiatedTotal: item.negotiatedTotal ?? null,
          },
          scaleRounding,
        );
      }

      const storedItems = body.items.map((item) => {
        const line: Record<string, unknown> = {
          productId: item.productId,
          quantity: roundQuantity(item.quantity),
        };
        if (item.unitPrice !== undefined) line.unitPrice = roundMoney(item.unitPrice);
        if (item.negotiatedTotal !== undefined) {
          line.negotiatedTotal = roundMoney(item.negotiatedTotal);
        }
        return line;
      });

      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO held_carts (cash_session_id, created_by, label, note, items)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id`,
        [sessionId, user.id, body.label, body.note, JSON.stringify(storedItems)],
      );
      return insertResult.rows[0].id;
    });

    const heldCart = await getHeldCartById(heldCartId);
    if (!heldCart) {
      throw new AppError(500, "Keranjang ditahan tetapi data gagal dimuat.");
    }

    emitEvent("held-cart.changed", {
      id: heldCart.id,
      action: "created",
      cashSessionId: heldCart.cashSessionId,
    });
    res.status(201).json({
      heldCart,
      message: `Keranjang "${heldCart.label}" berhasil ditahan.`,
    });
  }),
);

heldCartsRouter.post(
  "/:id/resume",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const result = await withTransaction(async (client) => {
      const sessionId = await findOpenSessionId(client, true);
      if (!sessionId) {
        throw new AppError(409, "Kas belum dibuka. Keranjang tidak bisa dilanjutkan.", {
          code: "CASH_SESSION_CLOSED",
        });
      }

      const holdResult = await client.query<{
        id: string;
        cash_session_id: string;
        label: string;
        note: string | null;
        items: unknown;
      }>(
        `SELECT id, cash_session_id, label, note, items
         FROM held_carts
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      const hold = holdResult.rows[0];
      if (!hold) {
        throw new AppError(404, "Keranjang ditahan tidak ditemukan.");
      }
      if (hold.cash_session_id !== sessionId) {
        throw new AppError(409, "Keranjang ini milik sesi kas yang sudah ditutup.", {
          code: "HELD_CART_SESSION_CLOSED",
        });
      }

      await client.query("DELETE FROM held_carts WHERE id = $1", [id]);

      return {
        heldCart: {
          id: hold.id,
          label: hold.label,
          note: hold.note,
        },
        items: cartItemsSchema.parse(hold.items),
      };
    });

    emitEvent("held-cart.changed", {
      id: result.heldCart.id,
      action: "resumed",
    });
    res.json({
      ...result,
      message: `Keranjang "${result.heldCart.label}" dilanjutkan.`,
    });
  }),
);

heldCartsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const label = await withTransaction(async (client) => {
      const sessionId = await findOpenSessionId(client, true);
      if (!sessionId) {
        throw new AppError(409, "Kas belum dibuka.", { code: "CASH_SESSION_CLOSED" });
      }

      const holdResult = await client.query<{
        id: string;
        cash_session_id: string;
        label: string;
      }>(
        `SELECT id, cash_session_id, label
         FROM held_carts
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      const hold = holdResult.rows[0];
      if (!hold) {
        throw new AppError(404, "Keranjang ditahan tidak ditemukan.");
      }
      if (hold.cash_session_id !== sessionId) {
        throw new AppError(409, "Keranjang ini milik sesi kas yang sudah ditutup.", {
          code: "HELD_CART_SESSION_CLOSED",
        });
      }

      await client.query("DELETE FROM held_carts WHERE id = $1", [id]);
      return hold.label;
    });

    emitEvent("held-cart.changed", { id, action: "deleted" });
    res.json({ message: `Keranjang ditahan "${label}" dihapus.` });
  }),
);
