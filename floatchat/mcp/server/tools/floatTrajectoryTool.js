// mcp/server/tools/floatTrajectoryTool.js
import { quickChartUrl } from "../utils.js";

export default {
  name: "float_trajectory",
  title: "Float Trajectory Tool",
  description: "Return lat/lon trajectory for a float over time, and a simple polyline map link (GeoJSON).",
  inputSchema: { float_id: "string", limit: "number optional" },
  sanitize: (a)=>({ float_id: a.float_id }),
  run: async (input, { runQuery }) => {
    const fid = (input.float_id || "").toString();
    const limit = Number(input.limit || 5000);
    if (!fid) return { error: "float_id required" };
    const sql = `SELECT time::timestamptz as t, latitude::double precision as lat, longitude::double precision as lon FROM profile_summaries WHERE (CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1 ORDER BY time ASC LIMIT $2;`;
    const r = await runQuery(sql, [fid, limit]);
    const rows = r.rows || [];
    const geojson = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: rows.map(r=>[r.lon, r.lat]) }, properties: { float_id: fid } }] };
    return { float_id: fid, trajectory: rows, geojson };
  }
};
