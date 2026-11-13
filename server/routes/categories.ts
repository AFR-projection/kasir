import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { currentUser, requireOwner } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { emitEvent } from "../lib/realtime";
import { mapCategory, type CategoryRow } from "../lib/serializers";
import { parseId, trimmedString } from "../lib/validation";

export const categoriesRouter = Router();

const categorySelect = `
  SELECT c.id, c.name, c.created_at, c.updated_at,
         COUNT(p.id)::int AS product_count,
         COUNT(p.id) FILTER (WHERE p.is_active = TRUE)::int AS active_product_count
  FROM categories c
  LEFT JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
`;

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const isOwner = req.user?.role === "owner";
    const result = await pool.query<CategoryRow>(
      `${categorySelect}
       GROUP BY c.id
       ${isOwner ? "" : "HAVING COUNT(p.id) FILTER (WHERE p.is_active = TRUE) > 0"}
       ORDER BY lower(c.name) ASC`,
    );
    res.json({ categories: result.rows.map(mapCategory) });
  }),
);

categoriesRouter.post(
  "/",
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = z.object({ name: trimmedString(1, 80, "Nama kategori") }).parse(req.body);
    const result = await pool.query<CategoryRow>(
      `WITH inserted AS (
         INSERT INTO categories (name) VALUES ($1)
         RETURNING id, name, created_at, updated_at
       )
       SELECT i.id, i.name, i.created_at, i.updated_at,
              0::int AS product_count, 0::int AS active_product_count
       FROM inserted i`,
      [body.name],
    );

    const category = mapCategory(result.rows[0]);
    emitEvent("category.created", { id: category.id });
    res.status(201).json({ category });
  }),
);

categoriesRouter.patch(
  "/:id",
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = z.object({ name: trimmedString(1, 80, "Nama kategori") }).parse(req.body);

    const result = await pool.query<CategoryRow>(
      `WITH updated AS (
         UPDATE categories SET name = $1 WHERE id = $2
         RETURNING id, name, created_at, updated_at
       )
       SELECT u.id, u.name, u.created_at, u.updated_at,
              (SELECT COUNT(*)::int FROM products p WHERE p.category_id = u.id AND p.deleted_at IS NULL) AS product_count,
              (SELECT COUNT(*)::int FROM products p WHERE p.category_id = u.id AND p.deleted_at IS NULL AND p.is_active = TRUE) AS active_product_count
       FROM updated u`,
      [body.name, id],
    );

    if (!result.rows[0]) throw new AppError(404, "Kategori tidak ditemukan.");

    const category = mapCategory(result.rows[0]);
    emitEvent("category.updated", { id: category.id });
    res.json({ category });
  }),
);

categoriesRouter.delete(
  "/:id",
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const used = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1",
      [id],
    );

    if (used.rows[0].count > 0) {
      throw new AppError(409, "Kategori masih digunakan oleh produk. Pindahkan atau hapus produk terlebih dahulu.");
    }

    const result = await pool.query("DELETE FROM categories WHERE id = $1 RETURNING id", [id]);
    if (!result.rows[0]) throw new AppError(404, "Kategori tidak ditemukan.");

    emitEvent("category.deleted", { id });
    res.json({ message: "Kategori berhasil dihapus." });
  }),
);
