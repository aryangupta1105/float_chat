// mcp/server/tools/anomalyDetectionTool.js
export default {
  name: "anomaly_detection",
  title: "Anomaly Detection",
  description: "Detect anomalies using z-score per float or region for temperature and salinity.",
  inputSchema: { float_id: "string optional", z_threshold: "number (default 3)", limit: "number optional" },
  sanitize: (a)=>({ float_id: a.float_id, z_threshold: a.z_threshold||3 }),
  run: async (input, { runQuery }) => {
    const zThresh = Number(input.z_threshold || 3);
    const limit = Number(input.limit || 10000);
    if (input.float_id) {
      // compute zscore per float (SQL window)
      const sql = `
        SELECT latitude, longitude, time, depth, temperature, salinity, 
          (temperature - avg_temp)/std_temp as temp_z,
          (salinity - avg_sal)/std_sal as sal_z
        FROM (
          SELECT *, 
            AVG(temperature) OVER () as avg_temp,
            STDDEV_POP(temperature) OVER () as std_temp,
            AVG(salinity) OVER () as avg_sal,
            STDDEV_POP(salinity) OVER () as std_sal
          FROM profiles
          WHERE (CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1
        ) s
        WHERE (abs((temperature - avg_temp)/nullif(std_temp,0)) > $2) OR (abs((salinity - avg_sal)/nullif(std_sal,0)) > $2)
        LIMIT $3;
      `;
      const r = await runQuery(sql, [input.float_id, zThresh, limit]);
      return { anomalies: r.rows };
    } else {
      // global anomalies (region / entire DB)
      const sql = `
        SELECT latitude, longitude, time, depth, temperature, salinity,
          (temperature - avg_temp)/std_temp as temp_z,
          (salinity - avg_sal)/std_sal as sal_z
        FROM (
          SELECT *, 
            AVG(temperature) OVER () as avg_temp,
            STDDEV_POP(temperature) OVER () as std_temp,
            AVG(salinity) OVER () as avg_sal,
            STDDEV_POP(salinity) OVER () as std_sal
          FROM profiles
        ) s
        WHERE (abs((temperature - avg_temp)/nullif(std_temp,0)) > $1) OR (abs((salinity - avg_sal)/nullif(std_sal,0)) > $1)
        LIMIT $2;
      `;
      const r = await runQuery(sql, [zThresh, limit]);
      return { anomalies: r.rows };
    }
  }
};
