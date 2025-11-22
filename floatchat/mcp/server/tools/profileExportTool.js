// mcp/server/tools/profileExportTool.js
import fs from "fs";
import os from "os";
import path from "path";

export default {
  name: "profile_export",
  title: "Profile Data Export",
  description: "Export filtered profiles to CSV (returns server path).",
  inputSchema: { float_id: "string optional", profile_key: "string optional", format: "csv|sql default csv", limit: "number optional" },
  sanitize: (a)=>({ float_id: a.float_id, profile_key: a.profile_key }),
  run: async (input, { runQuery }) => {
    const fid = input.float_id;
    const pk = input.profile_key;
    const limit = Number(input.limit || 100000);
    let sql = "SELECT * FROM profiles ";
    let params = [];
    if (pk) { sql += "WHERE source_file || ':' || profile_index = $1"; params = [pk]; }
    else if (fid) { sql += "WHERE (CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END) = $1"; params=[fid]; }
    sql += " ORDER BY time ASC LIMIT $2;";
    params.push(limit);
    const r = await runQuery(sql, params);
    const rows = r.rows || [];
    if (rows.length === 0) return { rows:0, path:null, message:"no rows" };

    // write CSV
    const tmpdir = os.tmpdir();
    const fname = `profile_export_${Date.now()}.csv`;
    const full = path.join(tmpdir, fname);
    const header = Object.keys(rows[0]).join(",") + "\n";
    const csv = rows.map(row => Object.values(row).map(v=> (v===null||v===undefined) ? "" : String(v).replace(/\n/g," ")).join(",")).join("\n");
    fs.writeFileSync(full, header + csv);
    return { rows: rows.length, path: full };
  }
};
