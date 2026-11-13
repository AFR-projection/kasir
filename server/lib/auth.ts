import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { pool } from "../db/pool";
import { AppError, asyncHandler } from "./http";
import { toSessionUser, type SessionUser, type UserRow } from "./serializers";

interface TokenPayload extends jwt.JwtPayload {
  ver?: number;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: "lax" as const,
  path: "/",
};

export function setSessionCookie(res: Response, user: Pick<UserRow, "id" | "role" | "auth_version">): void {
  const token = jwt.sign(
    {
      ver: user.auth_version,
      role: user.role,
    },
    config.jwtSecret,
    {
      subject: user.id,
      issuer: "kasir-sederhana",
      expiresIn: "12h",
    },
  );

  res.cookie(config.sessionCookieName, token, {
    ...COOKIE_OPTIONS,
    maxAge: config.sessionDurationMs,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.sessionCookieName, COOKIE_OPTIONS);
}

export async function resolveSessionUser(req: Request): Promise<SessionUser | null> {
  const token = req.cookies?.[config.sessionCookieName] as string | undefined;
  if (!token) return null;

  let payload: TokenPayload;
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { issuer: "kasir-sederhana" });
    if (typeof decoded === "string") return null;
    payload = decoded as TokenPayload;
  } catch {
    return null;
  }

  if (!payload.sub || typeof payload.ver !== "number") return null;

  const result = await pool.query<UserRow>(
    `SELECT id, name, email, role, is_active, auth_version, last_login_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [payload.sub],
  );
  const row = result.rows[0];

  if (!row || !row.is_active) return null;
  if (row.auth_version !== payload.ver) return null;

  return toSessionUser(row);
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const user = await resolveSessionUser(req);
  if (!user) {
    throw new AppError(401, "Sesi Anda tidak valid atau sudah berakhir. Silakan masuk kembali.", {
      code: "UNAUTHENTICATED",
    });
  }
  req.user = user;
  next();
});

export function requireRole(...roles: Array<"owner" | "cashier">) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "Silakan masuk terlebih dahulu."));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "Anda tidak memiliki izin untuk mengakses fitur ini.", { code: "FORBIDDEN" }));
      return;
    }
    next();
  };
}

export const requireOwner = requireRole("owner");
export const requireCashier = requireRole("cashier");

export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new AppError(401, "Silakan masuk terlebih dahulu.");
  return req.user;
}
