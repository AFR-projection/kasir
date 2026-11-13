import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../db/pool";
import { currentUser, requireOwner } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { emitEvent } from "../lib/realtime";
import { mapProduct, type ProductRow } from "../lib/serializers";
import {
  getPagination,
  moneySchema,
  parseId,
  quantitySchema,
  roundMoney,
  roundQuantity,
  trimmedString,
  uuidSchema,
} from "../lib/validation";

export const productsRouter = Router();

const productSelect = `
  SELECT p.id, p.name, p.category_id, c.name AS category_name,
         p.cost_price, p.selling_price, p.stock, p.min_stock, p.unit,
         p.image_url, p.is_active, p.created_at, p.updated_at
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

async function fetchProductRow(id: string, client?: PoolClient): Promise<ProductRow> {
  const executor = client ?? pool;
  const result = await executor.query<ProductRow>(
    `${productSelect} WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id],
  );
  if (!result.rows[0]) throw new AppError(404, "Produk tidak ditemukan.");
  return result.rows[0];
}

const imageUrlSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z
    .string()
    .trim()
    .max(2000, "URL gambar terlalu panjang.")
    .refine(
      (value) => /^\/uploads\/[A-Za-z0-9._-]+$/.test(value) || /^https?:\/\/[^\s]+$/i.test(value),
      "URL gambar tidak valid.",
    )
    .nullable()
    .optional(),
);

const productBaseSchema = z.object({
  name: trimmedString(1, 150, "Nama produk"),
  categoryId: uuidSchema,
  costPrice: moneySchema.transform(roundMoney),
  sellingPrice: moneySchema.transform(roundMoney),
  minStock: quantitySchema.transform(roundQuantity),
  unit: trimmedString(1, 30, "Satuan"),
  imageUrl: imageUrlSchema,
  isActive: z.boolean().default(true),
});

const createProductSchema = productBaseSchema.extend({
  stock: quantitySchema.transform(roundQuantity),
});

const updateProductSchema = productBaseSchema;

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: uuidSchema.optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  lowStock: z.enum(["true", "false"]).default("false"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

async function assertCategoryExists(categoryId: string, client?: PoolClient): Promise<void> {
  const executor = client ?? pool;
  const result = await executor.query("SELECT id FROM categories WHERE id = $1", [categoryId]);
  if (!result.rows[0]) throw new AppError(400, "Kategori tidak ditemukan.");
}

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const isOwner = req.user?.role === "owner";
    const query = listQuerySchema.parse(req.query);
    const conditions: string[] = ["p.deleted_at IS NULL"];
    const values: unknown[] = [];

    if (!isOwner || query.status === "active") {
      conditions.push("p.is_active = TRUE");
    } else if (query.status === "inactive") {
      conditions.push("p.is_active = FALSE");
    }

    if (query.categoryId) {
      values.push(query.categoryId);
      conditions.push(`p.category_id = $${values.length}`);
    }

    if (query.search) {
      values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
      conditions.push(`p.name ILIKE $${values.length} ESCAPE '\\'`);
    }

    if (query.lowStock === "true") {
      conditions.push("p.stock <= p.min_stock");
    }

    const where = conditions.join(" AND ");
    const countResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM products p WHERE ${where}`,
      values,
    );

    const limit = isOwner ? query.limit : Math.min(query.limit, 500);
    const offset = (query.page - 1) * limit;
    const listValues = [...values, limit, offset];
    const result = await pool.query<ProductRow>(
      `${productSelect}
       WHERE ${where}
       ORDER BY lower(p.name) ASC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );

    res.json({
      items: result.rows.map(mapProduct),
      total: countResult.rows[0].total,
      page: query.page,
      limit,
    });
  }),
);

productsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const row = await fetchProductRow(id);
    const isOwner = req.user?.role === "owner";
    if (!isOwner && !row.is_active) throw new AppError(404, "Produk tidak ditemukan.");
    res.json({ product: mapProduct(row) });
  }),
);

productsRouter.post(
  "/",
  requireOwner,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = createProductSchema.parse(req.body);

    const product = await withTransaction(async (client) => {
      await assertCategoryExists(body.categoryId, client);
      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO products
           (name, category_id, cost_price, selling_price, stock, min_stock, unit, image_url, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          body.name,
          body.categoryId,
          body.costPrice.toFixed(2),
          body.sellingPrice.toFixed(2),
          body.stock.toFixed(3),
          body.minStock.toFixed(3),
          body.unit,
          body.imageUrl ?? null,
          body.isActive,
        ],
      );
      const productId = insertResult.rows[0].id;

      if (body.stock > 0) {
        await client.query(
          `INSERT INTO stock_movements
             (product_id, user_id, movement_type, quantity, previous_stock, current_stock, notes)
           VALUES ($1, $2, 'in', $3, 0, $3, 'Stok awal produk')`,
          [productId, user.id, body.stock.toFixed(3)],
        );
      }

      const row = await fetchProductRow(productId, client);
      return mapProduct(row);
    });

    emitEvent("product.created", { id: product.id });
    if (body.stock > 0) emitEvent("stock.adjusted", { productId: product.id });
    res.status(201).json({ product });
  }),
);

productsRouter.put(
  "/:id",
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = updateProductSchema.parse(req.body);

    await assertCategoryExists(body.categoryId);
    const existing = await fetchProductRow(id);

    await pool.query(
      `UPDATE products
       SET name = $1, category_id = $2, cost_price = $3, selling_price = $4,
           min_stock = $5, unit = $6, image_url = $7, is_active = $8
       WHERE id = $9 AND deleted_at IS NULL`,
      [
        body.name,
        body.categoryId,
        body.costPrice.toFixed(2),
        body.sellingPrice.toFixed(2),
        body.minStock.toFixed(3),
        body.unit,
        body.imageUrl ?? null,
        body.isActive,
        id,
      ],
    );

    const product = mapProduct(await fetchProductRow(id));
    emitEvent("product.updated", { id });

    if (body.isActive !== existing.is_active) {
      emitEvent("product.updated", { id, statusChanged: true });
    }

    res.json({ product, message: "Produk berhasil diperbarui." });
  }),
);

productsRouter.patch(
  "/:id/status",
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = z.object({ isActive: z.boolean() }).parse(req.body);
    const row = await fetchProductRow(id);

    await pool.query("UPDATE products SET is_active = $1 WHERE id = $2", [body.isActive, id]);
    const product = mapProduct(await fetchProductRow(row.id));

    emitEvent("product.updated", { id });
    res.json({ product, message: product.isActive ? "Produk diaktifkan." : "Produk dinonaktifkan." });
  }),
);

productsRouter.delete(
  "/:id",
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await fetchProductRow(id);

    await pool.query(
      `UPDATE products
       SET deleted_at = NOW(), is_active = FALSE
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    emitEvent("product.deleted", { id });
    res.json({ message: "Produk berhasil dihapus. Riwayat penjualan dan stok tetap tersimpan." });
  }),
);

export { fetchProductRow };
