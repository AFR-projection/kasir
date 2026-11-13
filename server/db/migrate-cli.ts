import { runMigrations } from "./migrate";
import { pool } from "./pool";

async function main() {
  try {
    await runMigrations();
    console.log("[db] Semua migrasi sudah diterapkan.");
  } catch (error) {
    console.error("[db] Migrasi gagal:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
