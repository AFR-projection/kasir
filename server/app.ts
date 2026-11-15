import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config } from "./config";
import { requireAuth, requireOwner } from "./lib/auth";
import { errorHandler, notFoundHandler } from "./lib/http";
import { uploadsDirectory } from "./routes/uploads";
import { setupRouter } from "./routes/setup";
import { publicAuthRouter, authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { productsRouter } from "./routes/products";
import { productStockRouter, stockMovementsRouter } from "./routes/stock";
import { cashSessionsRouter } from "./routes/cash-sessions";
import { expensesRouter } from "./routes/expenses";
import { transactionsRouter } from "./routes/transactions";
import { heldCartsRouter } from "./routes/held-carts";
import { dashboardRouter } from "./routes/dashboard";
import { usersRouter } from "./routes/users";
import { settingsRouter } from "./routes/settings";
import { uploadRouter } from "./routes/uploads";
import { eventsRouter } from "./routes/events";
import { pool } from "./db/pool";
import { runMigrations } from "./db/migrate";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'", "https://*.blob.vercel-storage.com"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

app.use(
  "/uploads",
  express.static(uploadsDirectory, {
    maxAge: "30d",
    immutable: true,
    index: false,
    dotfiles: "deny",
  }),
);

const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Terlalu banyak permintaan. Coba beberapa saat lagi." },
});

app.use("/api", generalApiLimiter);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      database: "connected",
      realtime: config.realtimeMode,
      storage: config.blobReadWriteToken ? "blob" : config.isVercel ? "unconfigured" : "local",
      time: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

// Di Vercel, fungsi serverless tidak menjalankan server/index.ts. Migrasi
// dijalankan sekali per instance secara lazy. Advisory lock transaksi di
// runMigrations() menjaga agar beberapa cold start tidak saling bertabrakan.
let lazyMigrationPromise: Promise<void> | null = null;
if (config.isVercel && config.runMigrationsOnStart) {
  app.use("/api", async (_req, _res, next) => {
    if (!lazyMigrationPromise) {
      lazyMigrationPromise = runMigrations().catch((error) => {
        lazyMigrationPromise = null;
        throw error;
      });
    }
    try {
      await lazyMigrationPromise;
      next();
    } catch (error) {
      next(error);
    }
  });
}

app.use("/api/setup", setupRouter);
app.use("/api/auth", publicAuthRouter);
app.use("/api/auth", authRouter);

app.use("/api/categories", requireAuth, categoriesRouter);
app.use("/api/products", requireAuth, productsRouter);
app.use("/api/products", requireAuth, productStockRouter);
app.use("/api/stock-movements", requireAuth, stockMovementsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/held-carts", heldCartsRouter);
app.use("/api/cash-sessions", cashSessionsRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/uploads", requireAuth, requireOwner, uploadRouter);
app.use("/api/events", eventsRouter);

app.use("/api", notFoundHandler);
app.use("/uploads", notFoundHandler);

const clientDist = path.resolve(process.cwd(), "client/dist");
const clientIndex = path.join(clientDist, "index.html");

if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      index: false,
      maxAge: "1h",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
}

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
    next();
    return;
  }
  if (!fs.existsSync(clientIndex)) {
    res
      .status(200)
      .type("text")
      .send("API KASIR aktif. Untuk development, buka http://localhost:5173. Jalankan npm run build untuk build produksi.");
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(clientIndex);
});

app.use(errorHandler);

export function getClientDistInfo() {
  return { clientDist, clientIndex, available: fs.existsSync(clientIndex) };
}
