import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { config } from "../config";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
  detail?: string;
  type?: string;
}

const friendlyUniqueConstraints: Record<string, string> = {
  users_email_unique_idx: "Email sudah digunakan.",
  categories_name_unique_idx: "Nama kategori sudah digunakan.",
  transactions_client_reference_key: "Transaksi ini sudah diproses.",
  cash_sessions_one_open_idx: "Kas sudah dibuka. Tutup sesi kas berjalan terlebih dahulu.",
};

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
    return;
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    res.status(400).json({
      message: error.issues[0]?.message || "Data yang dikirim tidak valid.",
      code: "VALIDATION_ERROR",
      details: fieldErrors,
    });
    return;
  }

  const pgError = error as PgErrorLike;
  if (pgError?.code === "23505") {
    res.status(409).json({
      message: friendlyUniqueConstraints[pgError.constraint || ""] || "Data sudah ada. Gunakan nilai yang berbeda.",
      code: "DUPLICATE_DATA",
    });
    return;
  }
  if (pgError?.code === "23503") {
    res.status(409).json({
      message: "Data ini masih digunakan oleh data lain sehingga tidak dapat diproses.",
      code: "FOREIGN_KEY_CONFLICT",
    });
    return;
  }
  if (pgError?.type === "entity.parse.failed") {
    res.status(400).json({ message: "Format JSON tidak valid.", code: "INVALID_JSON" });
    return;
  }
  if (pgError?.type === "MulterError") {
    res.status(400).json({ message: "Berkas yang diunggah tidak valid atau terlalu besar.", code: "UPLOAD_ERROR" });
    return;
  }

  console.error("[server] Unhandled error:", error);
  res.status(500).json({
    message: "Terjadi kesalahan pada server. Silakan coba lagi.",
    code: "INTERNAL_SERVER_ERROR",
    ...(config.env === "development" && error instanceof Error ? { debug: error.message } : {}),
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: "Endpoint tidak ditemukan.", code: "NOT_FOUND" });
}
