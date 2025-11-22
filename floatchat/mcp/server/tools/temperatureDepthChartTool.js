// mcp/server/tools/temperatureDepthChartTool.js
import { quickChartUrl } from "../utils.js";

export default {
  name: "temperature_depth_chart",
  title: "Temperature vs Depth Chart",
  description: "Return points and QuickChart URL for temperature vs depth for a float/profile.",
  inputSchema: { float_id: "string", profile_index: "number optional", limit: "number optional" },
  sanitize: (a)=>({ float_id: a.float_id }),
  run: async (input, { runQuery }) => {
    const fid = (input.float_id || "").toString();
    const limit = Number(input.limit || 2000);
    if (!fid) return { error: "float_id required" };

    const sql = `SELECT depth::double precision AS depth, temperature::double precision AS temperature
                 FROM profiles
                 WHERE (CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1
                   AND temperature IS NOT NULL
                 ORDER BY depth ASC
                 LIMIT $2;`;
    const r = await runQuery(sql, [fid, limit]);
    const rows = r.rows || [];
    const depths = rows.map(r=>r.depth);
    const temps = rows.map(r=>r.temperature);

    const chart = {
      type: "line",
      data: { labels: depths, datasets: [{ label: `${fid} temperature vs depth`, data: temps }] },
      options: { scales: { y: { reverse: true }, x: { title: { display: true, text: "Depth (m)" }} } }
    };
    const url = quickChartUrl(chart, 900, 600);
    return { float_id: fid, points: rows, chartUrl: url };
  }
};
