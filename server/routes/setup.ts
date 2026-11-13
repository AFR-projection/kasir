import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config";
import { pool, withTransaction } from "../db/pool";
import { setSessionCookie } from "../lib/auth";
import { AppError, asyncHandler } from "../lib/http";
import { emailSchema, passwordSchema, trimmedString } from "../lib/validation";
import { getStore } from "../lib/store";
import { mapUser, toSessionUser, type UserRow } from "../lib/serializers";

export const setupRouter = Router();

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Terlalu banyak percobaan setup. Coba lagi nanti." },
});

setupRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const result = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'owner'",
    );
    const store = await getStore();
    res.json({
      needsSetup: result.rows[0].count === 0,
      storeName: store.storeName,
    });
  }),
);

setupRouter.post(
  "/",
  setupLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        ownerName: trimmedString(2, 100, "Nama owner"),
        email: emailSchema,
        password: passwordSchema,
        storeName: trimmedString(2, 120, "Nama toko"),
      })
      .parse(req.body);

    const created = await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1)", [912411]);
      const existing = await client.query<{ id: string }>("SELECT id FROM users WHERE role = 'owner' LIMIT 1");
      if (existing.rows.length > 0) {
        throw new AppError(409, "Owner sudah terdaftar. Silakan masuk.", { code: "ALREADY_SETUP" });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const userResult = await client.query<UserRow>(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'owner')
         RETURNING id, name, email, role, is_active, auth_version, last_login_at, created_at, updated_at`,
        [body.ownerName, body.email, passwordHash],
      );

      await client.query(
        `INSERT INTO store_settings (id, store_name)
         VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET store_name = EXCLUDED.store_name`,
        [body.storeName],
      );

      return userResult.rows[0];
    });

    setSessionCookie(res, created);
    res.status(201).json({
      message: "Akun owner berhasil dibuat.",
      user: toSessionUser(created),
      account: mapUser(created),
      store: await getStore(),
      setup: true,
      environment: config.env,
    });
  }),
);
