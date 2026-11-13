import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withTransaction, pool } from "../db/pool";
import { requireOwner } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { emitEvent } from "../lib/realtime";
import { emailSchema, parseId, passwordSchema, trimmedString } from "../lib/validation";
import { mapUser, type UserRow } from "../lib/serializers";

export const usersRouter = Router();
usersRouter.use(requireOwner);

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const result = await pool.query<UserRow>(
      `SELECT id, name, email, role, is_active, auth_version, last_login_at, created_at, updated_at
       FROM users
       ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, lower(name) ASC`,
    );
    res.json({ users: result.rows.map(mapUser) });
  }),
);

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: trimmedString(2, 100, "Nama"),
        email: emailSchema,
        password: passwordSchema,
      })
      .parse(req.body);

    const hash = await bcrypt.hash(body.password, 12);
    const result = await pool.query<UserRow>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'cashier')
       RETURNING id, name, email, role, is_active, auth_version, last_login_at, created_at, updated_at`,
      [body.name, body.email, hash],
    );

    emitEvent("user.changed", { id: result.rows[0].id });
    res.status(201).json({ user: mapUser(result.rows[0]) });
  }),
);

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = z
      .object({
        name: trimmedString(2, 100, "Nama").optional(),
        email: emailSchema.optional(),
        password: passwordSchema.optional(),
        isActive: z.boolean().optional(),
      })
      .refine((value) => Object.values(value).some((item) => item !== undefined), {
        message: "Tidak ada perubahan yang dikirim.",
      })
      .parse(req.body);

    const updated = await withTransaction(async (client) => {
      const targetResult = await client.query<UserRow>(
        `SELECT id, name, email, role, is_active, auth_version, last_login_at, created_at, updated_at
         FROM users WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const target = targetResult.rows[0];
      if (!target) throw new AppError(404, "Karyawan tidak ditemukan.");
      if (target.role !== "cashier") {
        throw new AppError(403, "Akun owner tidak dapat diubah dari halaman ini.");
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      let index = 1;

      if (body.name !== undefined) {
        sets.push(`name = $${index++}`);
        values.push(body.name);
      }
      if (body.email !== undefined) {
        sets.push(`email = $${index++}`);
        values.push(body.email);
      }
      if (body.password !== undefined) {
        const hash = await bcrypt.hash(body.password, 12);
        sets.push(`password_hash = $${index++}`);
        values.push(hash);
      }
      if (body.isActive !== undefined) {
        sets.push(`is_active = $${index++}`);
        values.push(body.isActive);
      }

      if (body.password !== undefined || (body.isActive !== undefined && body.isActive !== target.is_active)) {
        sets.push("auth_version = auth_version + 1");
      }

      values.push(id);
      const result = await client.query<UserRow>(
        `UPDATE users SET ${sets.join(", ")} WHERE id = $${index}
         RETURNING id, name, email, role, is_active, auth_version, last_login_at, created_at, updated_at`,
        values,
      );
      return result.rows[0];
    });

    emitEvent("user.changed", { id });
    res.json({ user: mapUser(updated) });
  }),
);
