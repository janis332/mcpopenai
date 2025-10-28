import { createServer } from "@modelcontextprotocol/sdk/server";
import { z } from "zod";

// Create an MCP server instance
const server = createServer({
  name: "sample-mcp",
  version: "1.0.0",
});

// === Define a simple tool ===
server.tool({
  name: "hello",
  description: "Returns a friendly greeting message.",
  input: z.object({
    name: z.string().describe("Your name"),
  }),
  output: z.object({
    message: z.string(),
  }),
  handler: async ({ name }) => {
    return { message: `👋 Hello, ${name}! Welcome to the MCP server.` };
  },
});

// === Example API route handler for Vercel ===
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(204).end();
  }

  // Handle JSON-RPC requests
  const response = await server.handleRequest(req);
  res.status(response.status || 200);
  res.setHeader("Content-Type", "application/json");
  res.send(await response.text());
}

