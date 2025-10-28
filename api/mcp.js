import http from "http";
import { Server } from "@modelcontextprotocol/sdk";
import { z } from "zod";

const mcp = new Server({
  name: "mcpopenai",
  version: "1.0.0",
});

// === Define a sample tool ===
mcp.tool({
  name: "hello",
  description: "Returns a greeting message.",
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => {
    return { message: `👋 Hello, ${name}! Your MCP server is alive on Render.` };
  },
});

// === Start HTTP server ===
const PORT = process.env.PORT || 10000;

http
  .createServer(async (req, res) => {
    // CORS for preflight requests
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "*",
      });
      return res.end();
    }

    const response = await mcp.handleRequest(req);
    res.writeHead(response.status || 200, { "Content-Type": "application/json" });
    res.end(await response.text());
  })
  .listen(PORT, () => console.log(`✅ MCP server listening on port ${PORT}`));
