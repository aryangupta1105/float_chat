// mcp/server/tools/seasonalClimatologyTool.js
export default {
  name: "seasonal_climatology",
  title: "Seasonal Climatology",
  description: "Compute seasonal means (DJF/MAM/JJA/SON) for temperature/salinity for a region or float.",
  inputSchema: { float_id: "string optional", variable: "temperature|salinity", lat_min: "number optional", lat_max: "number optional", lon_min: "number optional", lon_max: "number optional" },
  run: async (input, { runQuery }) => {
    const variable = (input.variable || "temperature");
    const fid = input.float_id;
    // season calculation in SQL: extract month -> season mapping
    let where = "";
    const params = [];
    if (fid) { where = " WHERE (CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1"; params.push(fid); }
    const sql = `
      SELECT season, AVG(${variable}) as mean, STDDEV_POP(${variable}) as std, COUNT(*) as n
      FROM (
        SELECT *,
         CASE WHEN extract(month from time) IN (12,1,2) THEN 'DJF'
              WHEN extract(month from time) IN (3,4,5) THEN 'MAM'
              WHEN extract(month from time) IN (6,7,8) THEN 'JJA'
              WHEN extract(month from time) IN (9,10,11) THEN 'SON' END as season
        FROM profiles
        ${where}
      ) s
      GROUP BY season ORDER BY season;
    `;
    const r = await runQuery(sql, params);
    return { variable, climatology: r.rows };
  }
};
