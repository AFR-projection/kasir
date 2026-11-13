import { Pool, types } from "pg";
import { config } from "../config";

// PostgreSQL NUMERIC dikembalikan sebagai string secara default.
// Nilai pada aplikasi ini berada jauh di bawah batas aman Number JavaScript.
types.setTypeParser(1700, (value: string) => Number(value));

const requiresSsl =
  config.databaseUrl.includes("neon.tech") ||
  config.databaseUrl.includes("sslmode=require") ||
  config.databaseUrl.includes("sslmode=verify");

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.isVercel ? 3 : config.isProduction ? 10 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  application_name: "kasir-sederhana",
  ...(requiresSsl && !config.databaseUrl.includes("sslmode=")
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

pool.on("error", (error) => {
  console.error("[db] Kesalahan koneksi idle:", error.message);
});

export async function withTransaction<T>(callback: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[db] Gagal rollback:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
