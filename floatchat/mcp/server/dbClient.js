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
        idleTimeoutMillis: 30000,        // 30s idle timeout
        connectionTimeoutMillis: 10000,  // 10s connection wait
        max: 5,                          // limit connections (Railway safe)
        keepAlive: true                  // keep socket alive
    });

    // Catch connection errors
    pool.on("error", (err) => {
        console.error("⚠️ PG Pool Error:", err.message);

        if (err.code === "ECONNRESET" || err.code === "57P01") {
            console.log("🔁 Rebuilding pool after disconnect...");
            createPool();   // recreate pool safely
        }
    });

    return pool;
}

// Initialize pool
createPool();

export async function runQuery(query, params = []) {
    try {
        const client = await pool.connect();

        try {
            const result = await client.query(query, params);
            return result;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error("❌ SQL Query Failed:", err.message);

        if (
            err.message.includes("ECONNRESET") ||
            err.message.includes("Connection terminated unexpectedly")
        ) {
            console.log("🔁 Auto-reconnecting after SQL error...");
            createPool();
        }

        throw err;
    }
}
