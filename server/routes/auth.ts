import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool, withTransaction } from "../db/pool";
import { asyncHandler, AppError } from "../lib/http";
import {
  clearSessionCookie,
  currentUser,
  requireAuth,
  resolveSessionUser,
  setSessionCookie,
} from "../lib/auth";
import { emailSchema, passwordSchema, trimmedString } from "../lib/validation";
import { mapUser, toSessionUser, type UserRow } from "../lib/serializers";
import { getStore } from "../lib/store";

export const publicAuthRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit." },
});

publicAuthRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await resolveSessionUser(req);
    if (!user) {
      res.json({ user: null, store: await getStore() });
      return;
    }
    res.json({ user, store: await getStore() });
  }),
);

publicAuthRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: emailSchema,
        password: z.string().min(1, "Password wajib diisi.").max(72),
      })
      .parse(req.body);

    const result = await pool.query<UserRow>(
      `SELECT id, name, email, role, password_hash, is_active, auth_version,
              last_login_at, created_at, updated_at
       FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [body.email],
    );
    const row = result.rows[0] as (UserRow & { password_hash: string }) | undefined;

    const valid = row ? await bcrypt.compare(body.password, row.password_hash) : false;
    if (!row || !valid) {
      throw new AppError(401, "Email atau password salah.", { code: "INVALID_CREDENTIALS" });
    }
    if (!row.is_active) {
      throw new AppError(403, "Akun Anda tidak aktif. Hubungi pemilik toko.", { code: "ACCOUNT_INACTIVE" });
    }

    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [row.id]);
    setSessionCookie(res, row);

    res.json({
      user: toSessionUser(row),
      account: mapUser(row),
      message: "Berhasil masuk.",
    });
  }),
);

publicAuthRouter.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ message: "Berhasil keluar." });
});

export const authRouter = Router();
authRouter.use(requireAuth);

authRouter.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = z
      .object({
        name: trimmedString(2, 100, "Nama"),
        email: emailSchema,
      })
      .parse(req.body);

    const result = await pool.query<UserRow>(
      `UPDATE users SET name = $1, email = $2
       WHERE id = $3
       RETURNING id, name, email, role, is_active, auth_version, last_login_at, created_at, updated_at`,
      [body.name, body.email, user.id],
    );

    res.json({ user: toSessionUser(result.rows[0]), account: mapUser(result.rows[0]) });
  }),
);

authRouter.post(
  "/change-password",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = z
      .object({
        currentPassword: z.string().min(1, "Password saat ini wajib diisi.").max(72),
        newPassword: passwordSchema,
      })
      .parse(req.body);

    if (body.currentPassword === body.newPassword) {
      throw new AppError(400, "Password baru harus berbeda dari password saat ini.");
    }

    const result = await pool.query<UserRow & { password_hash: string }>(
      "SELECT id, role, password_hash, auth_version, name, email, is_active, last_login_at, created_at, updated_at FROM users WHERE id = $1",
      [user.id],
    );
    const row = result.rows[0];
    if (!row) throw new AppError(404, "Akun tidak ditemukan.");

    const valid = await bcrypt.compare(body.currentPassword, row.password_hash);
    if (!valid) throw new AppError(400, "Password saat ini tidak sesuai.");

    const hash = await bcrypt.hash(body.newPassword, 12);
    const updated = await withTransaction(async (client) => {
      const updateResult = await client.query<UserRow>(
        `UPDATE users
         SET password_hash = $1, auth_version = auth_version + 1
         WHERE id = $2
         RETURNING id, name, email, role, is_active, auth_version, last_login_at, created_at, updated_at`,
        [hash, user.id],
      );
      return updateResult.rows[0];
    });

    setSessionCookie(res, updated);
    res.json({ message: "Password berhasil diperbarui.", user: toSessionUser(updated) });
  }),
);
