import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db/pool";
import { config } from "../config";
import { currentUser, requireAuth, requireCashier } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { emitEvent } from "../lib/realtime";
import { isScaleUnit, roundToScaleStep } from "../lib/rounding";
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

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

function formatRupiah(value: number): string {
  return rupiahFormatter.format(value);
}

async function getTransactionDetailById(id: string): Promise<TransactionDetailDto | null> {
  const result = await pool.query<TransactionDetailRow>(
    `SELECT t.id, t.invoice_number, t.cashier_id, u.name AS cashier_name,
            t.subtotal, t.discount_total, t.discount_reason, t.rounding_total, t.total,
            t.payment_method, t.amount_paid, t.change_due, t.notes, t.created_at,
            (SELECT COUNT(*)::int FROM transaction_items ti WHERE ti.transaction_id = t.id) AS item_count
     FROM transactions t
     JOIN users u ON u.id = t.cashier_id
     WHERE t.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;

  const itemsResult = await pool.query<TransactionItemRow>(
    `SELECT id, product_id, product_name, unit, quantity, list_unit_price,
            unit_price, discount_amount, rounding_amount, line_total
     FROM transaction_items
     WHERE transaction_id = $1
     ORDER BY created_at ASC, id ASC`,
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

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const summaryResult = await pool.query<{ count: number; total_sales: number }>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(t.total), 0)::numeric AS total_sales
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
              (SELECT COUNT(*)::int FROM transaction_items ti WHERE ti.transaction_id = t.id) AS item_count
       FROM transactions t
       JOIN users u ON u.id = t.cashier_id
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

    const requestedItems = new Map<string, { quantity: number; unitPrice: number | null }>();
    for (const item of body.items) {
      if (requestedItems.has(item.productId)) {
        throw new AppError(400, "Produk yang sama tidak boleh muncul lebih dari sekali dalam keranjang.", {
          code: "DUPLICATE_PRODUCT",
        });
      }
      const quantity = roundQuantity(item.quantity);
      if (quantity <= 0) {
        throw new AppError(400, "Jumlah produk tidak valid.");
      }
      requestedItems.set(item.productId, {
        quantity,
        unitPrice: item.unitPrice === undefined ? null : roundMoney(item.unitPrice),
      });
    }
    const productIds = Array.from(requestedItems.keys()).sort();

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
          lineTotal: number;
        }> = [];

        let subtotal = 0;
        let discountTotal = 0;
        let roundingTotal = 0;
        for (const productId of productIds) {
          const product = productsById.get(productId)!;
          const requested = requestedItems.get(productId)!;
          const quantity = requested.quantity;

          if (!product.is_active) {
            throw new AppError(409, `Produk "${product.name}" sudah tidak dijual.`);
          }
          if (Number(product.stock) < quantity) {
            throw new AppError(
              409,
              `Stok "${product.name}" tidak mencukupi. Tersedia ${Number(product.stock)} ${product.unit}.`,
              { code: "INSUFFICIENT_STOCK" },
            );
          }

          const listUnitPrice = roundMoney(Number(product.selling_price));
          let unitPrice = listUnitPrice;

          if (requested.unitPrice !== null) {
            if (requested.unitPrice > listUnitPrice) {
              throw new AppError(
                400,
                `Harga nego "${product.name}" tidak boleh melebihi harga normal (${formatRupiah(listUnitPrice)}).`,
                { code: "PRICE_ABOVE_LIST" },
              );
            }

            const costPrice = roundMoney(Number(product.cost_price));
            if (costPrice > 0 && requested.unitPrice < costPrice) {
              throw new AppError(
                400,
                `Harga nego "${product.name}" di bawah harga modal (${formatRupiah(costPrice)}).`,
                { code: "PRICE_BELOW_COST" },
              );
            }

            unitPrice = requested.unitPrice;
          }

          const listLineTotal = roundMoney(listUnitPrice * quantity);
          const exactLineTotal = roundMoney(unitPrice * quantity);
          const discountAmount = roundMoney(listLineTotal - exactLineTotal);
          const roundingAmount =
            requested.unitPrice === null && scaleRounding > 0 && isScaleUnit(product.unit)
              ? roundMoney(roundToScaleStep(exactLineTotal, scaleRounding) - exactLineTotal)
              : 0;
          const lineTotal = roundMoney(exactLineTotal + roundingAmount);

          if (listLineTotal > 999_999_999_999.99 || lineTotal > 999_999_999_999.99) {
            throw new AppError(400, "Total item melebihi batas maksimum transaksi.");
          }

          subtotal = roundMoney(subtotal + listLineTotal);
          discountTotal = roundMoney(discountTotal + discountAmount);
          roundingTotal = roundMoney(roundingTotal + roundingAmount);
          saleItems.push({
            product,
            quantity,
            listUnitPrice,
            unitPrice,
            listLineTotal,
            discountAmount,
            roundingAmount,
            lineTotal,
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

        for (const item of saleItems) {
          const previousStock = roundQuantity(Number(item.product.stock));
          const currentStock = roundQuantity(previousStock - item.quantity);

          await client.query("UPDATE products SET stock = $1 WHERE id = $2", [
            currentStock.toFixed(3),
            item.product.id,
          ]);

          await client.query(
            `INSERT INTO transaction_items
               (transaction_id, product_id, product_name, unit, quantity, list_unit_price,
                unit_price, unit_cost, discount_amount, rounding_amount, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
              item.lineTotal.toFixed(2),
            ],
          );

          await client.query(
            `INSERT INTO stock_movements
               (product_id, user_id, transaction_id, movement_type, quantity,
                previous_stock, current_stock, notes)
             VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7)`,
            [
              item.product.id,
              user.id,
              transactionId,
              item.quantity.toFixed(3),
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

export type { TransactionSummaryDto };
