// mcp/server/tools/netcdfExportTool.js
// NOTE: This is a helper export that builds a minimal NetCDF-like CSV package.
// Full NetCDF creation requires netCDF C libs (NetCDF4) and is better done in your Python ingestion pipeline.
// Here we provide a convenience wrapper: it packages the CSV export and metadata into a zip and returns path.
import archiver from "archiver";
import fs from "fs";
import os from "os";
import path from "path";

export default {
  name: "netcdf_export",
  title: "NetCDF Export (zipped CSV + metadata)",
  description: "Create a zipped export (CSV + metadata JSON) for a profile or float (server-side).",
  inputSchema: { float_id: "string optional", profile_key: "string optional" },
  run: async (input, { runQuery }) => {
    // delegate to profile_export for CSV then zip with metadata
    const profileExport = (await import("./profileExportTool.js")).default;
    const result = await profileExport.run(input, { runQuery });
    if (!result.path) return { error: "no export available" };
    const tmpdir = os.tmpdir();
    const zipname = path.join(tmpdir, `netcdf_like_${Date.now()}.zip`);
    const output = fs.createWriteStream(zipname);
    const archive = archiver("zip");
    archive.pipe(output);
    archive.file(result.path, { name: "profiles.csv" });
    archive.append(JSON.stringify({ generated_at: new Date().toISOString(), source: "FloatChat MCP" }), { name: "metadata.json" });
    await archive.finalize();
    return { zip_path: zipname };
  }
};
