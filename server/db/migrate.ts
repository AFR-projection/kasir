import { pool } from "./pool";
import { migrations } from "./migrations";

const MIGRATION_LOCK_ID = 824766231;

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Semua migrasi dijalankan dalam satu transaksi dengan advisory lock
    // transaction-scoped. Ini aman untuk Neon/PgBouncer dan beberapa instance
    // serverless yang melakukan cold start bersamaan.
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.name));

    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;

      console.log(`[db] Menjalankan migrasi ${migration.name}...`);
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
      console.log(`[db] Migrasi ${migration.name} selesai.`);
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Abaikan kegagalan rollback.
    }
    throw error;
  } finally {
    client.release();
  }
}
