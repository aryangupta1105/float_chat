// mcp/server/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { runQuery } from "./dbClient.js";
import { safeSqlCheck, timeIt } from "./utils.js";

// ---------------------------
// ✅ Load manifest.json via fs (Option A)
// ---------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifestPath = path.join(__dirname, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// ---------------------------
// Import MCP Tools
// ---------------------------
import sqlQueryTool from "./tools/sqlQueryTool.js";
import nearestFloatTool from "./tools/nearestFloatTool.js";
import profileSummaryTool from "./tools/profileSummaryTool.js";
import temperatureDepthChartTool from "./tools/temperatureDepthChartTool.js";
import salinityTimeSeriesTool from "./tools/salinityTimeSeriesTool.js";
import metadataTool from "./tools/metadataTool.js";
import anomalyDetectionTool from "./tools/anomalyDetectionTool.js";
import floatTrajectoryTool from "./tools/floatTrajectoryTool.js";
import profileExportTool from "./tools/profileExportTool.js";
import netcdfExportTool from "./tools/netcdfExportTool.js";
import bgcSummaryTool from "./tools/bgcSummaryTool.js";
import vectorSearchTool from "./tools/vectorSearchTool.js";
import multiFloatCompareTool from "./tools/multiFloatCompareTool.js";
import seasonalClimatologyTool from "./tools/seasonalClimatologyTool.js";
import locationToFloatIdTool from "./tools/locationToFloatIdTool.js";

// ---------------------------
// Setup MCP Server
// ---------------------------
const server = new McpServer({
    name: "floatchat-mcp",
    version: "1.0.0",
    manifest
});

// ---------------------------
// Register Tools
// ---------------------------
server.registerTool(sqlQueryTool.name, sqlQueryTool, sqlQueryTool.run);
server.registerTool(nearestFloatTool.name, nearestFloatTool, nearestFloatTool.run);
server.registerTool(profileSummaryTool.name, profileSummaryTool, profileSummaryTool.run);
server.registerTool(temperatureDepthChartTool.name, temperatureDepthChartTool, temperatureDepthChartTool.run);
server.registerTool(salinityTimeSeriesTool.name, salinityTimeSeriesTool, salinityTimeSeriesTool.run);
server.registerTool(metadataTool.name, metadataTool, metadataTool.run);
server.registerTool(anomalyDetectionTool.name, anomalyDetectionTool, anomalyDetectionTool.run);
server.registerTool(floatTrajectoryTool.name, floatTrajectoryTool, floatTrajectoryTool.run);
server.registerTool(profileExportTool.name, profileExportTool, profileExportTool.run);
server.registerTool(netcdfExportTool.name, netcdfExportTool, netcdfExportTool.run);
server.registerTool(bgcSummaryTool.name, bgcSummaryTool, bgcSummaryTool.run);
server.registerTool(vectorSearchTool.name, vectorSearchTool, vectorSearchTool.run);
server.registerTool(multiFloatCompareTool.name, multiFloatCompareTool, multiFloatCompareTool.run);
server.registerTool(seasonalClimatologyTool.name, seasonalClimatologyTool, seasonalClimatologyTool.run);
server.registerTool(locationToFloatIdTool.name, locationToFloatIdTool, locationToFloatIdTool.run);

// ---------------------------
// Express HTTP server for MCP
// ---------------------------
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
    try {
        const transport = new StreamableHTTPServerTransport({
            enableJsonResponse: true
        });

        res.on("close", () => transport.close());

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        console.error("❌ MCP handler crash:", err);
        res.status(500).send("MCP Server Error");
    }
});

// ---------------------------
// Start Server
// ---------------------------
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`🚀 MCP server running at http://localhost:${PORT}/mcp`);
});
