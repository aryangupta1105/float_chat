// mcp/server/tools/sqlQueryTool.js
import { safeSqlCheck } from "../utils.js";

export default {
  name: "sql_query",
  title: "SQL Query Tool",
  description: "Run a single SELECT query against profiles/profile_summaries (read-only).",
  inputSchema: { query: "string" },
  safeSql: "query", // used by server wrapper
  sanitize: (args) => ({ query: args.query?.slice(0,200) }),
  run: async (input, { runQuery }) => {
    const q = (input.query || "").trim();
    if (!q) return { error: "query required" };
    if (!safeSqlCheck(q)) return { error: "Only single SELECT queries allowed, no DML/DDL." };
    const res = await runQuery(q);
    return { rows: res.rows || [], rowCount: res.rowCount || 0 };
  }
};
