import { Server } from "@modelcontextprotocol/sdk";
import { z } from "zod";

// === Create an MCP Server Instance ===
const server = new Server({
  name: "teste-mcp",
  version: "1.0.0",
});

// === Example Tool 1: Hello ===
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
    return { message: `👋 Hello, ${name}! Welcome to the teste MCP server.` };
  },
});

// === Example Tool 2: Search ===
server.tool({
  name: "search",
  description: "Mock search tool returning sample results.",
  input: z.object({
    query: z.string().describe("Search query"),
  }),
  output: z.object({
    content: z.array(
      z.object({
        type: z.literal("text"),
        text: z.string(),
      })
    ),
  }),
  handler: async ({ query }) => {
    const results = {
      results: [
        {
          id: "doc-1",
          title: `Search results for "${query}"`,
          url: "https://example.com/doc-1",
        },
      ],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(results) }],
    };
  },
});

// === Example Tool 3: Fetch ===
server.tool({
  name: "fetch",
  description: "Mock fetch tool returning full document content.",
  input: z.object({
    id: z.string().describe("Document ID to fetch"),
  }),
  output: z.object({
    content: z.array(
      z.object({
        type: z.literal("text"),
        text: z.string(),
      })
    ),
  }),
  handler: async ({ id }) => {
    const doc = {
      id,
      title: "Sample Document",
      text: "This is the full text of the document for testing MCP fetch.",
      url: `https://example.com/${id}`,
      metadata: { source: "mock" },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(doc) }],
    };
  },
});

// === Example API Route Handler (for Render or Replit) ===
export default async function handler(req, res) {
  // CORS support
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(204).end();
  }

  const response = await server.handleRequest(req);
  res.status(response.status || 200);
  res.setHeader("Content-Type", "application/json");
  res.send(await response.text());
}
