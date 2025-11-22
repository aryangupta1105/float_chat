// mcp/server/tools/multiFloatCompareTool.js
import { quickChartUrl } from "../utils.js";

export default {
  name: "multi_float_compare",
  title: "Multi-Float Comparison",
  description: "Compare given floats for variable (mean profiles) and return chart.",
  inputSchema: { float_ids: "array of strings", variable: "temperature|salinity", limit: "number" },
  run: async (input, { runQuery }) => {
    const fids = input.float_ids || [];
    const variable = (input.variable || "temperature");
    if (!Array.isArray(fids) || fids.length === 0) return { error: "float_ids required" };
    const series = [];
    for (const fid of fids) {
      const sql = `SELECT depth::double precision as depth, AVG(${variable}) as value FROM profiles WHERE (CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1 GROUP BY depth ORDER BY depth LIMIT 2000;`;
      try {
        const r = await runQuery(sql, [fid]);
        series.push({ float_id: fid, points: r.rows });
      } catch (e) {
        series.push({ float_id: fid, error: e.message });
      }
    }
    // build chart comparing mean profiles (simple approach — align by depth)
    const datasets = series.map(s => ({ label: s.float_id, data: s.points.map(p=>p.value) }));
    const labels = series[0] ? series[0].points.map(p=>p.depth) : [];
    const chart = { type: "line", data: { labels, datasets }, options: { scales: { y: { reverse: true } } } };
    const url = quickChartUrl(chart, 1000, 600);
    return { comparisons: series, chartUrl: url };
  }
};
