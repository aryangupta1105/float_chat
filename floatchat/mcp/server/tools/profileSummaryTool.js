// mcp/server/tools/profileSummaryTool.js
export default {
  name: "profile_summary",
  title: "Profile Summary Tool",
  description: "Return summary rows for a float_id or profile_key (aggregates).",
  inputSchema: { float_id: "string (optional)", profile_key: "string (optional)", limit: "number (opt)" },
  sanitize: (a)=>({ float_id:a.float_id, profile_key:a.profile_key }),
  run: async (input, { runQuery }) => {
    const fid = input.float_id;
    const pk = input.profile_key;
    if (!fid && !pk) return { error: "float_id or profile_key required" };

    let sql = `SELECT profile_key, float_id, time, latitude, longitude, n_levels, min_depth, max_depth, mean_temperature, mean_salinity, temp_surface, sal_surface, variables, raw_metadata
               FROM profile_summaries WHERE `;
    let params = [];
    if (pk) { sql += `profile_key = $1`; params = [pk]; }
    else { sql += `(CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1`; params = [fid]; }
    sql += ` ORDER BY time DESC LIMIT $2;`;
    params.push(Number(input.limit || 200));

    const r = await runQuery(sql, params);
    return { summaries: r.rows || [] };
  }
};
