// mcp.js
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Create the MCP server
const server = new McpServer({
  name: "simple-mcp",
  version: "1.0.0",
});

// --- Register a simple "add" tool ---
server.registerTool(
  "add",
  {
    title: "Addition Tool",
    description: "Adds two numbers",
    inputSchema: { a: z.number(), b: z.number() },
    outputSchema: { result: z.number() },
  },
  async ({ a, b }) => {
    const result = a + b;
    return {
      content: [{ type: "text", text: `Result is ${result}` }],
      structuredContent: { result },
    };
  }
);

// --- Basic Express setup ---
const app = express();
app.use(express.json());

// Main MCP endpoint
app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
    });

    res.on("close", () => transport.close());

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err);
    res.status(500).json({ error: err.message });
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`✅ MCP test server running on http://localhost:${port}/mcp`);
});
