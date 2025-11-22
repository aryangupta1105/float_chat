// mcp/server/dbClient.js
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

let pool;

function createPool() {
  console.log("🔄 Creating new PostgreSQL pool...");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    max: 6,
    keepAlive: true
  });

  pool.on("error", (err) => {
    console.error("⚠️ PG Pool Error:", err.message || err);
    // recreate pool if fatal
    if (err.code === "ECONNRESET" || err.message?.includes("terminating connection")) {
      console.log("🔁 Recreating pool due to fatal error");
      try { pool.end(); } catch(e) {}
      createPool();
    }
  });

  return pool;
}

createPool();

export async function runQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(query, params);
    return res;
  } catch (err) {
    console.error("❌ SQL Query Failed:", err.message || err);
    // recreate pool for severe network issues
    if (String(err.message).includes("ECONNRESET") || String(err.message).includes("terminating connection")) {
      console.log("🔁 Recreating pool after query error");
      try { pool.end(); } catch(e) {}
      createPool();
    }
    throw err;
  } finally {
    client.release();
  }
}
