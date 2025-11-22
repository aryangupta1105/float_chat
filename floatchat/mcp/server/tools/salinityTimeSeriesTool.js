// mcp/server/tools/salinityTimeSeriesTool.js
import { quickChartUrl } from "../utils.js";

export default {
  name: "salinity_time_series",
  title: "Salinity / Variable Time Series",
  description: "Return time series (and QuickChart) for salinity or temperature from profiles or summaries.",
  inputSchema: { float_id: "string", variable: "temperature|salinity (default salinity)", limit: "number" },
  sanitize: (a)=>({ float_id: a.float_id, variable: a.variable }),
  run: async (input, { runQuery }) => {
    const fid = (input.float_id || "").toString();
    const variable = (input.variable || "salinity").toLowerCase();
    const limit = Number(input.limit || 1000);
    if (!fid) return { error: "float_id required" };
    if (!["temperature","salinity"].includes(variable)) return { error: "variable must be temperature or salinity" };

    const sql = `SELECT time::timestamptz as t, ${variable}::double precision as v
                 FROM profiles
                 WHERE (CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1
                   AND ${variable} IS NOT NULL
                 ORDER BY time ASC
                 LIMIT $2;`;
    const r = await runQuery(sql, [fid, limit]);
    const rows = r.rows || [];
    const times = rows.map(r=>r.t ? r.t.toISOString() : null);
    const vals = rows.map(r=>r.v);
    const chart = { type: "line", data: { labels: times, datasets: [{ label: `${fid} ${variable} time series`, data: vals }] }, options: { scales: { x: { type: "time" } } } };
    const url = quickChartUrl(chart, 1000, 400);
    return { float_id: fid, points: rows, chartUrl: url };
  }
};
