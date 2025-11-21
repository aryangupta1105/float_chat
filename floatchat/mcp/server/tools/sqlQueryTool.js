// mcp/server/tools/sqlQueryTool.js

export const sqlQueryTool = {
    name: "sql_query",
    description: "Run a SELECT SQL query on Postgres",
    inputSchema: {
        query: "string"
    },
    outputSchema: {
        rows: "array"
    },
    run: async ({ query }, { runQuery }) => {

        const q = query.trim().toLowerCase();

        if (!q.startsWith("select")) {
            return { error: "Only SELECT queries allowed." };
        }
        if (q.includes(";")) {
            return { error: "Semicolons are not allowed." };
        }

        const result = await runQuery(query);
        return { rows: result.rows };
    }
};
