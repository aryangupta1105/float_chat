// mcp/server/tools/bgcSummaryTool.js
export default {
  name: "bgc_summary",
  title: "BGC Summary",
  description: "Summarize Bio-Geochemical variables (placeholder - depends on variables present).",
  inputSchema: { float_id: "string optional", variable_list: "array optional" },
  run: async (input, { runQuery }) => {
    // Example: compute mean and std for given variables across float_id
    const vars = input.variable_list || ["oxygen", "NO3", "CHLA"];
    const fid = input.float_id;
    const results = {};
    for (const v of vars) {
      try {
        const sql = `SELECT AVG(${v}) as mean, STDDEV_POP(${v}) as std, COUNT(${v}) as count FROM profiles WHERE ${fid ? "(CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1" : "1=1"};`;
        const params = fid ? [fid] : [];
        const r = await runQuery(sql, params);
        results[v] = r.rows[0];
      } catch (e) {
        results[v] = { error: "variable missing or query error" };
      }
    }
    return { float_id: fid || null, summary: results };
  }
};
