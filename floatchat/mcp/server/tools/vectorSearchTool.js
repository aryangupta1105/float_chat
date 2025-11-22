// mcp/server/tools/vectorSearchTool.js
export default {
  name: "vector_search",
  title: "Vector Search (RAG) - placeholder",
  description: "If RAG microservice present, call it. Currently returns not-configured message.",
  inputSchema: { query: "string", top_k: "number optional" },
  run: async (input, { runQuery }) => {
    return { error: "vector_search not configured. Deploy RAG microservice and update RAG URL in environment." };
  }
};
