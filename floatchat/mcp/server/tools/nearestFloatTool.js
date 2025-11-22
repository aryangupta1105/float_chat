// mcp/server/tools/nearestFloatTool.js
import { haversineDistanceKm } from "../utils.js";

export default {
  name: "nearest_float",
  title: "Nearest Float Finder",
  description: "Find floats in profile_summaries within radius_km of given lat/lon (uses bounding box + Haversine).",
  inputSchema: { lat: "number", lon: "number", radius_km: "number (optional default 200)", limit: "number optional" },
  sanitize: (a)=>({ lat:a.lat, lon:a.lon, radius_km:a.radius_km||200 }),
  run: async (input, { runQuery }) => {
    const lat = Number(input.lat);
    const lon = Number(input.lon);
    const radius_km = Number(input.radius_km || 200);
    const limit = Number(input.limit || 200);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return { error: "lat and lon numeric required" };

    // bounding box (approx)
    const deg = Math.min(20, Math.max(0.1, radius_km / 111));
    const sql = `
      SELECT profile_key, float_id,
             latitude::double precision as latitude, longitude::double precision as longitude,
             n_levels, mean_temperature, mean_salinity
      FROM profile_summaries
      WHERE latitude BETWEEN $1 AND $2
        AND longitude BETWEEN $3 AND $4
      LIMIT $5;
    `;
    const params = [lat - deg, lat + deg, lon - deg, lon + deg, limit];
    const r = await runQuery(sql, params);
    const rows = (r.rows || []).map(row => {
      const d = haversineDistanceKm(lat, lon, Number(row.latitude), Number(row.longitude));
      return { ...row, distance_km: d };
    }).filter(r=>r.distance_km <= radius_km).sort((a,b)=>a.distance_km-b.distance_km);
    return { count: rows.length, floats: rows.slice(0, limit) };
  }
};
