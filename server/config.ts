import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET minimal 32 karakter"),
  STORE_TIMEZONE: z.string().default("Asia/Jakarta"),
  RUN_MIGRATIONS_ON_START: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  REALTIME_MODE: z.enum(["auto", "sse", "polling"]).default("auto"),
  UPLOAD_DIR: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  POS_BLOB_READ_WRITE_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`).join("\n");
  console.error(`Konfigurasi environment tidak valid:\n${details}\n\nSalin .env.example ke .env dan lengkapi nilainya.`);
  process.exit(1);
}

if (parsed.data.JWT_SECRET.startsWith("ganti-")) {
  console.error("JWT_SECRET masih memakai nilai contoh. Buat secret acak yang aman terlebih dahulu.");
  process.exit(1);
}

try {
  new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.STORE_TIMEZONE }).format();
} catch {
  console.error(`STORE_TIMEZONE "${parsed.data.STORE_TIMEZONE}" tidak valid.`);
  process.exit(1);
}

const isProduction = parsed.data.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
const realtimeMode =
  parsed.data.REALTIME_MODE === "auto"
    ? isVercel
      ? "polling"
      : "sse"
    : parsed.data.REALTIME_MODE;

export const config = {
  env: parsed.data.NODE_ENV,
  isProduction,
  isVercel,
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  storeTimezone: parsed.data.STORE_TIMEZONE,
  runMigrationsOnStart: parsed.data.RUN_MIGRATIONS_ON_START,
  realtimeMode,
  sseEnabled: realtimeMode === "sse",
  blobReadWriteToken:
    parsed.data.BLOB_READ_WRITE_TOKEN?.trim() || parsed.data.POS_BLOB_READ_WRITE_TOKEN?.trim() || null,
  uploadDir: path.resolve(process.cwd(), parsed.data.UPLOAD_DIR || "uploads"),
  sessionCookieName: "kasir_session",
  sessionDurationMs: 12 * 60 * 60 * 1000,
};
