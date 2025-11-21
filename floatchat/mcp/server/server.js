// mcp/server/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { runQuery } from "./dbClient.js";
import { sqlQueryTool } from "./tools/sqlQueryTool.js";
import fs from "fs";

const app = express();
app.use(express.json());

// -----------------------------
// MCP SERVER SETUP
// -----------------------------
const server = new McpServer({
    name: process.env.MCP_NAME || "FloatChat-MCP",
    version: "1.0.0"
});

// Register SQL tool
server.registerTool(
    sqlQueryTool.name,
    {
        title: sqlQueryTool.description,
        inputSchema: sqlQueryTool.inputSchema,
        outputSchema: sqlQueryTool.outputSchema
    },
    async (input) => {
        const output = await sqlQueryTool.run(input, { runQuery });
        return {
            content: [{ type: "text", text: JSON.stringify(output) }],
            structuredContent: output
        };
    }
);

// -----------------------------
// HTTP ENDPOINT FOR MCP
// -----------------------------
app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true
    });

    res.on("close", () => transport.close());

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});

// Health route
app.get("/health", (req, res) => {
    res.json({ ok: true });
});

// Project brief endpoint (for your SIH PDF)
app.get("/project-brief", (req, res) => {
    const path = process.env.PROJECT_BRIEF_PATH;
    if (fs.existsSync(path)) {
        res.sendFile(path);
    } else {
        res.status(404).send("Brief file not found.");
    }
});

// --------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🚀 MCP server running at http://localhost:${PORT}/mcp`);
});
