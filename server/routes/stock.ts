import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db/pool";
import { config } from "../config";
import { currentUser, requireOwner } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { emitEvent } from "../lib/realtime";
import {
  mapProduct,
  mapStockMovement,
  type ProductRow,
  type StockMovementRow,
} from "../lib/serializers";
import {
  dateInputSchema,
  parseId,
  roundQuantity,
  stockInputSchema,
  uuidSchema,
} from "../lib/validation";
import { fetchProductRow } from "./products";

export const productStockRouter = Router();
export const stockMovementsRouter = Router();

productStockRouter.post(
  "/:id/stock",
  requireOwner,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = parseId(req.params.id);
    const body = stockInputSchema.parse(req.body);

    if (body.movementType !== "adjustment" && body.quantity <= 0) {
      throw new AppError(400, "Jumlah stok harus lebih dari 0.");
    }

    const result = await withTransaction(async (client) => {
      const locked = await client.query<{ id: string; stock: number; name: string }>(
        `SELECT id, stock, name FROM products
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [id],
      );
      const product = locked.rows[0];
      if (!product) throw new AppError(404, "Produk tidak ditemukan.");

      const previousStock = roundQuantity(Number(product.stock));
      let currentStock: number;
      let movementQuantity: number;

      if (body.movementType === "in") {
        currentStock = roundQuantity(previousStock + body.quantity);
        movementQuantity = roundQuantity(body.quantity);
      } else if (body.movementType === "out") {
        currentStock = roundQuantity(previousStock - body.quantity);
        movementQuantity = roundQuantity(body.quantity);
        if (currentStock < 0) {
          throw new AppError(409, `Stok tidak mencukupi. Stok saat ini ${previousStock}.`);
        }
      } else {
        currentStock = roundQuantity(body.quantity);
        movementQuantity = roundQuantity(Math.abs(currentStock - previousStock));
        if (movementQuantity === 0) {
          throw new AppError(400, "Stok baru sama dengan stok saat ini. Tidak ada perubahan yang dicatat.");
        }
      }

      await client.query("UPDATE products SET stock = $1 WHERE id = $2", [
        currentStock.toFixed(3),
        id,
      ]);

      const notes =
        body.notes ||
        (body.movementType === "in"
          ? "Stok masuk manual"
          : body.movementType === "out"
            ? "Stok keluar manual"
            : "Penyesuaian stok manual");

      const movementResult = await client.query<{
        id: string;
        created_at: Date;
      }>(
        `INSERT INTO stock_movements
           (product_id, user_id, movement_type, quantity, previous_stock, current_stock, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          id,
          user.id,
          body.movementType,
          movementQuantity.toFixed(3),
          previousStock.toFixed(3),
          currentStock.toFixed(3),
          notes,
        ],
      );

      const updated = await fetchProductRow(id, client);
      return {
        product: mapProduct(updated),
        movement: {
          id: movementResult.rows[0].id,
          movementType: body.movementType,
          quantity: movementQuantity,
          previousStock,
          currentStock,
          notes,
          createdAt: movementResult.rows[0].created_at.toISOString(),
        },
      };
    });

    emitEvent("stock.adjusted", { productId: id, movementType: body.movementType });
    emitEvent("product.updated", { id });
    res.status(201).json({
      ...result,
      message: "Stok berhasil diperbarui.",
    });
  }),
);

const movementsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  movementType: z.enum(["all", "in", "out", "adjustment", "sale", "void"]).default("all"),
  productId: uuidSchema.optional(),
  dateFrom: dateInputSchema.optional(),
  dateTo: dateInputSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

stockMovementsRouter.get(
  "/",
  requireOwner,
  asyncHandler(async (req, res) => {
    const query = movementsQuerySchema.parse(req.query);
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

    if (query.movementType !== "all") {
      values.push(query.movementType);
      conditions.push(`sm.movement_type = $${values.length}`);
    }
    if (query.productId) {
      values.push(query.productId);
      conditions.push(`sm.product_id = $${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
      conditions.push(
        `(p.name ILIKE $${values.length} ESCAPE '\\' OR u.name ILIKE $${values.length} ESCAPE '\\' OR sm.notes ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    if (query.dateFrom) {
      const timezone = timezoneRef();
      values.push(query.dateFrom);
      conditions.push(`(sm.created_at AT TIME ZONE ${timezone})::date >= $${values.length}::date`);
    }
    if (query.dateTo) {
      const timezone = timezoneRef();
      values.push(query.dateTo);
      conditions.push(`(sm.created_at AT TIME ZONE ${timezone})::date <= $${values.length}::date`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       JOIN users u ON u.id = sm.user_id
       ${where}`,
      values,
    );

    const offset = (query.page - 1) * query.limit;
    const listValues = [...values, query.limit, offset];
    const result = await pool.query<StockMovementRow>(
      `SELECT sm.id, sm.product_id, p.name AS product_name,
              sm.user_id, u.name AS user_name,
              sm.transaction_id, t.invoice_number,
              sm.movement_type, sm.quantity, sm.previous_stock, sm.current_stock,
              sm.notes, sm.created_at
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       JOIN users u ON u.id = sm.user_id
       LEFT JOIN transactions t ON t.id = sm.transaction_id
       ${where}
       ORDER BY sm.created_at DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );

    res.json({
      items: result.rows.map(mapStockMovement),
      total: countResult.rows[0].total,
      page: query.page,
      limit: query.limit,
    });
  }),
);
