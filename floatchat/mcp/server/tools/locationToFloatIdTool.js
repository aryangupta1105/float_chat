// mcp/server/tools/locationToFloatIdTool.js
export default {
  name: "location_to_floatid",
  title: "Location → FloatID",
  description: "Return nearest float_id at exact or nearest profile location (single best).",
  inputSchema: { lat: "number", lon: "number" },
  run: async (input, { runQuery }) => {
    const lat = Number(input.lat), lon = Number(input.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return { error: "lat/lon required" };
    const deg = 1; // small bbox
    const sql = `SELECT profile_key, float_id, latitude, longitude FROM profile_summaries WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4 LIMIT 200;`;
    const r = await runQuery(sql, [lat-deg, lat+deg, lon-deg, lon+deg]);
    if (!r.rows || r.rows.length===0) return { error: "no floats near location" };
    // compute simple nearest (in JS; small set)
    const rows = r.rows;
    const dist = (a)=> Math.sqrt((a.latitude-lat)**2 + (a.longitude-lon)**2);
    rows.sort((a,b)=>dist(a)-dist(b));
    const best = rows[0];
    return { nearest: best };
  }
};
