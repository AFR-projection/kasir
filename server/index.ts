import { app, getClientDistInfo } from "./app";
import { config } from "./config";
import { pool } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { closeAllEventStreams } from "./lib/realtime";

let server: import("http").Server | null = null;

async function start(): Promise<void> {
  if (config.runMigrationsOnStart) {
    await runMigrations();
  }

  await pool.query("SELECT 1");

  server = app.listen(config.port, () => {
    console.log("");
    console.log("  KASIR — Product & Stock Management");
    console.log(`  API berjalan di http://localhost:${config.port}`);
    if (!config.isProduction) {
      console.log("  Frontend dev  : http://localhost:5173");
    } else {
      const client = getClientDistInfo();
      console.log(`  Frontend      : ${client.available ? "aktif" : "build belum tersedia"}`);
    }
    console.log("");
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] Menerima ${signal}. Menutup server...`);
  closeAllEventStreams();
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
      setTimeout(resolve, 8_000).unref();
    });
  }
  await pool.end().catch(() => undefined);
  process.exit(0);
}

start().catch((error) => {
  console.error("[server] Gagal menjalankan aplikasi:", error);
  process.exit(1);
});

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});
