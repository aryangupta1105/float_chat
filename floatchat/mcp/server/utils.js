// mcp/server/utils.js
export function safeSqlCheck(sql) {
  if (!sql || typeof sql !== "string") return false;
  const s = sql.trim().toLowerCase();
  // reject semicolons and dangerous keywords
  const banned = ["insert ", "update ", "delete ", "drop ", "create ", "alter ", "--", ";"];
  for (const b of banned) if (s.includes(b)) return false;
  // allow only select queries
  return s.startsWith("select");
}

export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function quickChartUrl(chartConfig, width = 900, height = 600) {
  const qc = encodeURIComponent(JSON.stringify(chartConfig));
  return `https://quickchart.io/chart?c=${qc}&format=png&width=${width}&height=${height}`;
}

export function timeIt(label) {
  const start = Date.now();
  return (msg) => {
    const delta = Date.now() - start;
    console.log(`[TIMING] ${label} – ${delta}ms`, msg || "");
  };
}

export function sanitizeForLogs(obj) {
  try {
    const s = JSON.stringify(obj, (k,v)=> {
      if (k && (k.toLowerCase().includes("password") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("token"))) {
        return "[REDACTED]";
      }
      return v;
    });
    return JSON.parse(s);
  } catch(e) {
    return {};
  }
}
