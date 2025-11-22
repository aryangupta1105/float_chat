// mcp/server/tools/metadataTool.js
export default {
  name: "metadata",
  title: "Metadata Tool",
  description: "Return DB-level metadata (counts, sample raw_metadata).",
  inputSchema: { sample_limit: "number optional" },
  run: async (input, { runQuery }) => {
    const sample_limit = Number(input.sample_limit || 3);
    const counts = await runQuery("SELECT COUNT(*)::int AS profiles FROM profiles");
    const distinct = await runQuery("SELECT COUNT(DISTINCT (CASE WHEN pg_typeof(float_id)='bytea' THEN convert_from(float_id,'UTF8') ELSE float_id::text END))::int AS floats FROM profiles");
    const times = await runQuery("SELECT MIN(time) as first_seen, MAX(time) as last_seen FROM profiles");
    const samples = await runQuery(`SELECT profile_key, float_id, raw_metadata FROM profile_summaries LIMIT $1`, [sample_limit]);
    return {
      stats: {
        profiles: counts.rows[0].profiles,
        floats: distinct.rows[0].floats,
        first_seen: times.rows[0].first_seen,
        last_seen: times.rows[0].last_seen
      },
      samples: samples.rows
    };
  }
};
