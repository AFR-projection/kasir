import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db/pool";
import { config } from "../config";
import { currentUser, requireAuth, requireCashier, requireOwner } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { formatRupiah, priceCartLine } from "../lib/pricing";
import { emitEvent } from "../lib/realtime";
import { getStore } from "../lib/store";
import {
  mapTransactionSummary,
  type TransactionSummaryRow,
  type TransactionDetailDto,
  type TransactionItemDto,
  type TransactionSummaryDto,
} from "../lib/serializers";
import {
  dateInputSchema,
  parseId,
  roundMoney,
  roundQuantity,
  transactionInputSchema,
  uuidSchema,
  voidTransactionInputSchema,
} from "../lib/validation";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

interface TransactionDetailRow extends TransactionSummaryRow {
  subtotal: number;
  amount_paid: number;
  change_due: number;
  notes: string | null;
  discount_reason: string | null;
}

interface TransactionItemRow {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  list_unit_price: number;
  unit_price: number;
  discount_amount: number;
  rounding_amount: number;
  negotiation_mode: "unit" | "total" | null;
  line_total: number;
}

interface LockedProductRow {
  id: string;
  name: string;
  cost_price: number;
  selling_price: number;
  stock: number;
  unit: string;
  is_active: boolean;
}

async function getTransactionDetailById(id: string): Promise<TransactionDetailDto | null> {
  const result = await pool.query<TransactionDetailRow>(
    `SELECT t.id, t.invoice_number, t.cashier_id, u.name AS cashier_name,
            t.subtotal, t.discount_total, t.discount_reason, t.rounding_total, t.total,
            t.payment_method, t.amount_paid, t.change_due, t.notes, t.created_at,
            t.status, t.void_type, t.void_reason, t.voided_at,
            vu.id AS voided_by_id, vu.name AS voided_by_name,
            (t.status = 'completed' AND cs.status = 'open') AS can_void,
            (SELECT COUNT(*)::int FROM transaction_items ti WHERE ti.transaction_id = t.id) AS item_count
     FROM transactions t
     JOIN users u ON u.id = t.cashier_id
     LEFT JOIN users vu ON vu.id = t.voided_by
     LEFT JOIN cash_sessions cs ON cs.id = t.cash_session_id
     WHERE t.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;

  const itemsResult = await pool.query<TransactionItemRow>(
    `SELECT id, product_id, product_name, unit, quantity, list_unit_price,
            unit_price, discount_amount, rounding_amount, negotiation_mode, line_total
     FROM transaction_items
     WHERE transaction_id = $1
     ORDER BY line_number ASC`,
    [id],
  );

  const items: TransactionItemDto[] = itemsResult.rows.map((item) => {
    const lineTotal = Number(item.line_total);
    const discountAmount = Number(item.discount_amount);
    const roundingAmount = Number(item.rounding_amount);
    return {
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      unit: item.unit,
      quantity: Number(item.quantity),
      listUnitPrice: Number(item.list_unit_price),
      unitPrice: Number(item.unit_price),
      listLineTotal: roundMoney(lineTotal - roundingAmount + discountAmount),
      discountAmount,
      roundingAmount,
      negotiationMode: item.negotiation_mode ?? null,
      lineTotal,
    };
  });

  const summary = mapTransactionSummary(row);
  return {
    ...summary,
    subtotal: Number(row.subtotal),
    amountPaid: Number(row.amount_paid),
    changeDue: Number(row.change_due),
    notes: row.notes,
    discountReason: row.discount_reason,
    items,
    store: await getStore(),
  };
}

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  dateFrom: dateInputSchema.optional(),
  dateTo: dateInputSchema.optional(),
  status: z.enum(["all", "completed", "voided"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = listQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let timezoneParam: number | null = null;

    const timezoneRef = () => {
      if (!timezoneParam) {
        values.push(config.storeTimezone);
        timezoneParam = values.length;
      }
      return `$${timezoneParam}`;
    };

    if (user.role === "cashier") {
      values.push(user.id);
      conditions.push(`t.cashier_id = $${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
      conditions.push(
        `(t.invoice_number ILIKE $${values.length} ESCAPE '\\' OR u.name ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    if (query.dateFrom) {
      const timezone = timezoneRef();
      values.push(query.dateFrom);
      conditions.push(`(t.created_at AT TIME ZONE ${timezone})::date >= $${values.length}::date`);
    }
    if (query.dateTo) {
      const timezone = timezoneRef();
      values.push(query.dateTo);
      conditions.push(`(t.created_at AT TIME ZONE ${timezone})::date <= $${values.length}::date`);
    }
    if (query.status !== "all") {
      values.push(query.status);
      conditions.push(`t.status = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const summaryResult = await pool.query<{
      count: number;
      completed_count: number;
      voided_count: number;
      total_sales: number;
    }>(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_count,
              COUNT(*) FILTER (WHERE t.status = 'voided')::int AS voided_count,
              COALESCE(SUM(t.total) FILTER (WHERE t.status = 'completed'), 0)::numeric AS total_sales
       FROM transactions t
       JOIN users u ON u.id = t.cashier_id
       ${where}`,
      values,
    );

    const offset = (query.page - 1) * query.limit;
    const listValues = [...values, query.limit, offset];
    const result = await pool.query<TransactionSummaryRow>(
      `SELECT t.id, t.invoice_number, t.cashier_id, u.name AS cashier_name,
              t.total, t.discount_total, t.rounding_total, t.payment_method, t.created_at,
              t.status, t.void_type, t.void_reason, t.voided_at,
              vu.id AS voided_by_id, vu.name AS voided_by_name,
              (t.status = 'completed' AND cs.status = 'open') AS can_void,
              (SELECT COUNT(*)::int FROM transaction_items ti WHERE ti.transaction_id = t.id) AS item_count
       FROM transactions t
       JOIN users u ON u.id = t.cashier_id
       LEFT JOIN users vu ON vu.id = t.voided_by
       LEFT JOIN cash_sessions cs ON cs.id = t.cash_session_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );

    res.json({
      items: result.rows.map(mapTransactionSummary),
      total: summaryResult.rows[0].count,
      page: query.page,
      limit: query.limit,
      summary: {
        count: summaryResult.rows[0].count,
        completedCount: summaryResult.rows[0].completed_count,
        voidedCount: summaryResult.rows[0].voided_count,
        totalSales: Number(summaryResult.rows[0].total_sales),
      },
    });
  }),
);

transactionsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = parseId(req.params.id);
    const transaction = await getTransactionDetailById(id);

    if (!transaction) throw new AppError(404, "Transaksi tidak ditemukan.");
    if (user.role === "cashier" && transaction.cashierId !== user.id) {
      throw new AppError(404, "Transaksi tidak ditemukan.");
    }

    res.json({ transaction });
  }),
);

transactionsRouter.post(
  "/",
  requireCashier,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = transactionInputSchema.parse(req.body);
    const paymentAmount = roundMoney(body.amountPaid);

    const requestedLines = body.items.map((item) => {
      const quantity = roundQuantity(item.quantity);
      if (quantity <= 0) {
        throw new AppError(400, "Jumlah produk tidak valid.");
      }
      if (item.unitPrice !== undefined && item.negotiatedTotal !== undefined) {
        throw new AppError(400, "Pilih nego harga satuan atau total item, bukan keduanya.", {
          code: "INVALID_NEGOTIATION",
        });
      }
      return {
        productId: item.productId,
        quantity,
        unitPrice: item.unitPrice === undefined ? null : roundMoney(item.unitPrice),
        negotiatedTotal:
          item.negotiatedTotal === undefined ? null : roundMoney(item.negotiatedTotal),
      };
    });

    // Baris dengan produk yang sama tetap dihitung terpisah untuk harga dan
    // nego, tetapi stok divalidasi serta dikurangi sekali per produk.
    const requestedQuantityByProduct = new Map<string, number>();
    for (const line of requestedLines) {
      requestedQuantityByProduct.set(
        line.productId,
        roundQuantity((requestedQuantityByProduct.get(line.productId) ?? 0) + line.quantity),
      );
    }
    const productIds = Array.from(requestedQuantityByProduct.keys()).sort();

    try {
      const outcome = await withTransaction(async (client) => {
        // Serialisasi request dengan referensi yang sama. Ini mencegah double submission
        // membuat transaksi kedua saat request pertama masih diproses.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [body.clientReference]);

        const existing = await client.query<{ id: string; cashier_id: string }>(
          "SELECT id, cashier_id FROM transactions WHERE client_reference = $1",
          [body.clientReference],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].cashier_id !== user.id) {
            throw new AppError(409, "Referensi transaksi sudah digunakan.");
          }
          return { id: existing.rows[0].id, alreadyProcessed: true as const };
        }

        // FOR SHARE memungkinkan beberapa checkout berjalan bersamaan, tetapi
        // akan menunggu proses tutup kas yang memakai FOR UPDATE. Setelah kas
        // ditutup, checkout baru tidak lagi menemukan sesi berstatus open.
        const sessionResult = await client.query<{ id: string }>(
          "SELECT id FROM cash_sessions WHERE status = 'open' FOR SHARE LIMIT 1",
        );
        const cashSessionId = sessionResult.rows[0]?.id;
        if (!cashSessionId) {
          throw new AppError(409, "Kas belum dibuka. Minta kasir membuka kas terlebih dahulu.", {
            code: "CASH_SESSION_CLOSED",
          });
        }

        // Kunci baris pengaturan agar nominal pembulatan tidak berubah di tengah transaksi.
        const settingsResult = await client.query<{ scale_rounding: number }>(
          "SELECT scale_rounding FROM store_settings WHERE id = 1 FOR SHARE",
        );
        const scaleRounding = Number(settingsResult.rows[0]?.scale_rounding ?? 0);

        const productsResult = await client.query<LockedProductRow>(
          `SELECT id, name, cost_price, selling_price, stock, unit, is_active
           FROM products
           WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
           ORDER BY id
           FOR UPDATE`,
          [productIds],
        );

        if (productsResult.rows.length !== productIds.length) {
          throw new AppError(409, "Beberapa produk tidak tersedia lagi. Muat ulang keranjang Anda.");
        }

        const productsById = new Map(productsResult.rows.map((product) => [product.id, product]));
        const saleItems: Array<{
          product: LockedProductRow;
          quantity: number;
          listUnitPrice: number;
          unitPrice: number;
          listLineTotal: number;
          discountAmount: number;
          roundingAmount: number;
          negotiationMode: "unit" | "total" | null;
          lineTotal: number;
        }> = [];

        let subtotal = 0;
        let discountTotal = 0;
        let roundingTotal = 0;

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

        for (const requested of requestedLines) {
          const product = productsById.get(requested.productId)!;
          const priced = priceCartLine(
            {
              name: product.name,
              costPrice: Number(product.cost_price),
              sellingPrice: Number(product.selling_price),
              unit: product.unit,
            },
            requested,
            scaleRounding,
          );

          subtotal = roundMoney(subtotal + priced.listLineTotal);
          discountTotal = roundMoney(discountTotal + priced.discountAmount);
          roundingTotal = roundMoney(roundingTotal + priced.roundingAmount);
          saleItems.push({
            product,
            quantity: requested.quantity,
            ...priced,
          });
        }

        const total = roundMoney(subtotal - discountTotal + roundingTotal);
        if (subtotal > 999_999_999_999.99 || total > 999_999_999_999.99) {
          throw new AppError(400, "Total transaksi melebihi batas maksimum.");
        }
        if (paymentAmount < total) {
          throw new AppError(
            400,
            `Jumlah pembayaran kurang dari total transaksi (${formatRupiah(total)}).`,
            { code: "INSUFFICIENT_PAYMENT" },
          );
        }
        const changeDue = roundMoney(paymentAmount - total);
        const discountReason = discountTotal > 0 ? body.discountReason : null;

        const invoiceResult = await client.query<{ seq: string; date: string }>(
          `SELECT nextval('invoice_number_seq')::text AS seq,
                  to_char(NOW() AT TIME ZONE $1, 'YYYYMMDD') AS date`,
          [config.storeTimezone],
        );
        const invoiceNumber = `TRX-${invoiceResult.rows[0].date}-${invoiceResult.rows[0].seq.padStart(5, "0")}`;

        const transactionResult = await client.query<{ id: string }>(
          `INSERT INTO transactions
             (invoice_number, cashier_id, subtotal, total, discount_total, discount_reason,
              rounding_total, payment_method, amount_paid, change_due, notes, client_reference,
              cash_session_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            invoiceNumber,
            user.id,
            subtotal.toFixed(2),
            total.toFixed(2),
            discountTotal.toFixed(2),
            discountReason,
            roundingTotal.toFixed(2),
            body.paymentMethod,
            paymentAmount.toFixed(2),
            changeDue.toFixed(2),
            body.notes,
            body.clientReference,
            cashSessionId,
          ],
        );
        const transactionId = transactionResult.rows[0].id;

        for (const [index, item] of saleItems.entries()) {
          await client.query(
            `INSERT INTO transaction_items
               (transaction_id, product_id, product_name, unit, quantity, list_unit_price,
                unit_price, unit_cost, discount_amount, rounding_amount, negotiation_mode,
                line_total, line_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              transactionId,
              item.product.id,
              item.product.name,
              item.product.unit,
              item.quantity.toFixed(3),
              item.listUnitPrice.toFixed(2),
              item.unitPrice.toFixed(2),
              Number(item.product.cost_price).toFixed(2),
              item.discountAmount.toFixed(2),
              item.roundingAmount.toFixed(2),
              item.negotiationMode,
              item.lineTotal.toFixed(2),
              index + 1,
            ],
          );
        }

        // Stok dan movement dicatat sekali per produk meskipun produk muncul
        // di beberapa baris dengan jumlah atau nego yang berbeda.
        const soldQuantityByProduct = new Map<string, number>();
        for (const item of saleItems) {
          soldQuantityByProduct.set(
            item.product.id,
            roundQuantity((soldQuantityByProduct.get(item.product.id) ?? 0) + item.quantity),
          );
        }

        for (const productId of productIds) {
          const product = productsById.get(productId)!;
          const soldQuantity = soldQuantityByProduct.get(productId)!;
          const previousStock = roundQuantity(Number(product.stock));
          const currentStock = roundQuantity(previousStock - soldQuantity);

          await client.query("UPDATE products SET stock = $1 WHERE id = $2", [
            currentStock.toFixed(3),
            productId,
          ]);

          await client.query(
            `INSERT INTO stock_movements
               (product_id, user_id, transaction_id, movement_type, quantity,
                previous_stock, current_stock, notes)
             VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7)`,
            [
              productId,
              user.id,
              transactionId,
              soldQuantity.toFixed(3),
              previousStock.toFixed(3),
              currentStock.toFixed(3),
              `Penjualan ${invoiceNumber}`,
            ],
          );
        }

        return { id: transactionId, alreadyProcessed: false as const };
      });

      const transaction = await getTransactionDetailById(outcome.id);
      if (!transaction) throw new AppError(500, "Transaksi tersimpan tetapi gagal dimuat.");

      if (!outcome.alreadyProcessed) {
        emitEvent("transaction.created", { id: transaction.id });
        emitEvent("stock.adjusted", { transactionId: transaction.id, source: "sale" });
      }

      res.status(outcome.alreadyProcessed ? 200 : 201).json({
        transaction,
        alreadyProcessed: outcome.alreadyProcessed,
        message: outcome.alreadyProcessed ? "Transaksi ini sudah diproses sebelumnya." : "Transaksi berhasil.",
      });
    } catch (error) {
      const pgError = error as { code?: string; constraint?: string };
      if (pgError.code === "23505" && pgError.constraint === "transactions_client_reference_key") {
        const existing = await pool.query<{ id: string; cashier_id: string }>(
          "SELECT id, cashier_id FROM transactions WHERE client_reference = $1",
          [body.clientReference],
        );
        if (existing.rows[0]?.cashier_id === user.id) {
          const transaction = await getTransactionDetailById(existing.rows[0].id);
          if (transaction) {
            res.status(200).json({ transaction, alreadyProcessed: true });
            return;
          }
        }
      }
      throw error;
    }
  }),
);

transactionsRouter.post(
  "/:id/void",
  requireOwner,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = parseId(req.params.id);
    const body = voidTransactionInputSchema.parse(req.body);

    const outcome = await withTransaction(async (client) => {
      const lookup = await client.query<{ cash_session_id: string | null }>(
        "SELECT cash_session_id FROM transactions WHERE id = $1",
        [id],
      );
      if (!lookup.rows[0]) {
        throw new AppError(404, "Transaksi tidak ditemukan.");
      }
      const cashSessionId = lookup.rows[0].cash_session_id;
      if (!cashSessionId) {
        throw new AppError(409, "Transaksi ini tidak terhubung ke sesi kas.", {
          code: "CASH_SESSION_MISSING",
        });
      }

      // FOR SHARE menahan proses tutup kas sampai pembatalan selesai. Dengan
      // begitu koreksi stok dan status transaksi selalu masuk ke sesi terbuka.
      const sessionResult = await client.query<{ status: "open" | "closed" }>(
        "SELECT status FROM cash_sessions WHERE id = $1 FOR SHARE",
        [cashSessionId],
      );
      if (sessionResult.rows[0]?.status !== "open") {
        throw new AppError(
          409,
          "Transaksi hanya bisa dibatalkan atau diretur selama sesi kas masih terbuka.",
          { code: "CASH_SESSION_CLOSED" },
        );
      }

      const transactionResult = await client.query<{
        id: string;
        invoice_number: string;
        status: "completed" | "voided";
      }>(
        `SELECT id, invoice_number, status
         FROM transactions
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      const transaction = transactionResult.rows[0];
      if (!transaction) {
        throw new AppError(404, "Transaksi tidak ditemukan.");
      }
      if (transaction.status === "voided") {
        throw new AppError(409, "Transaksi ini sudah dibatalkan atau diretur.", {
          code: "TRANSACTION_ALREADY_VOIDED",
        });
      }

      const itemsResult = await client.query<{ product_id: string; quantity: number }>(
        `SELECT product_id, quantity
         FROM transaction_items
         WHERE transaction_id = $1
         ORDER BY line_number ASC`,
        [id],
      );

      const quantityByProduct = new Map<string, number>();
      for (const item of itemsResult.rows) {
        quantityByProduct.set(
          item.product_id,
          roundQuantity((quantityByProduct.get(item.product_id) ?? 0) + Number(item.quantity)),
        );
      }
      const productIds = Array.from(quantityByProduct.keys()).sort();

      const productsResult = await client.query<{ id: string; name: string; stock: number }>(
        `SELECT id, name, stock
         FROM products
         WHERE id = ANY($1::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [productIds],
      );
      if (productsResult.rows.length !== productIds.length) {
        throw new AppError(409, "Beberapa produk pada transaksi ini sudah tidak tersedia.", {
          code: "PRODUCT_MISSING",
        });
      }
      const productsById = new Map(productsResult.rows.map((product) => [product.id, product]));
      const movementLabel = body.type === "return" ? "Retur" : "Pembatalan";

      for (const productId of productIds) {
        const product = productsById.get(productId)!;
        const restoreQuantity = quantityByProduct.get(productId)!;
        const previousStock = roundQuantity(Number(product.stock));
        const currentStock = roundQuantity(previousStock + restoreQuantity);

        await client.query("UPDATE products SET stock = $1 WHERE id = $2", [
          currentStock.toFixed(3),
          productId,
        ]);

        await client.query(
          `INSERT INTO stock_movements
             (product_id, user_id, transaction_id, movement_type, quantity,
              previous_stock, current_stock, notes)
           VALUES ($1, $2, $3, 'void', $4, $5, $6, $7)`,
          [
            productId,
            user.id,
            id,
            restoreQuantity.toFixed(3),
            previousStock.toFixed(3),
            currentStock.toFixed(3),
            `${movementLabel} ${transaction.invoice_number}`,
          ],
        );
      }

      await client.query(
        `UPDATE transactions
         SET status = 'voided',
             void_type = $1,
             void_reason = $2,
             voided_by = $3,
             voided_at = NOW()
         WHERE id = $4`,
        [body.type, body.reason, user.id, id],
      );

      return {
        id,
        invoiceNumber: transaction.invoice_number,
        type: body.type,
      };
    });

    const transaction = await getTransactionDetailById(outcome.id);
    if (!transaction) {
      throw new AppError(500, "Pembatalan tersimpan tetapi data gagal dimuat.");
    }

    emitEvent("transaction.voided", {
      id: transaction.id,
      voidType: outcome.type,
    });
    emitEvent("stock.adjusted", { transactionId: transaction.id, source: outcome.type });

    res.json({
      transaction,
      message:
        outcome.type === "return"
          ? `Retur ${outcome.invoiceNumber} dicatat dan stok sudah dikembalikan.`
          : `Transaksi ${outcome.invoiceNumber} dibatalkan dan stok sudah dikembalikan.`,
    });
  }),
);

export type { TransactionSummaryDto };
