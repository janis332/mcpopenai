// api/mcp.js
import express from "express";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// -------------------------------------------------------------------
// 1️⃣ Create the MCP server
// -------------------------------------------------------------------
const server = new McpServer({
  name: "demo-server",
  version: "1.0.0",
});

// -------------------------------------------------------------------
// 2️⃣ Register tools (these are callable by clients like Claude or Cursor)
// -------------------------------------------------------------------
server.registerTool(
  "add",
  {
    title: "Addition Tool",
    description: "Add two numbers",
    inputSchema: { a: z.number(), b: z.number() },
    outputSchema: { result: z.number() },
  },
  async ({ a, b }) => {
    const output = { result: a + b };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

// -------------------------------------------------------------------
// 3️⃣ Register resources (data that clients can read)
// -------------------------------------------------------------------
server.registerResource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  {
    title: "Greeting Resource",
    description: "Dynamic greeting generator",
  },
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Hello, ${name}!`,
      },
    ],
  })
);

// -------------------------------------------------------------------
// 4️⃣ Set up the Express web server
// -------------------------------------------------------------------
const app = express();
app.use(express.json());

// ✅ MCP route (for clients that support MCP protocol)
app.post("/api/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// ✅ Simple REST test route (for curl testing)
app.post("/test", async (req, res) => {
  const { name, a, b } = req.body;

  if (name) {
    res.json({ message: `👋 Hello, ${name}! Your MCP server is alive.` });
  } else if (a !== undefined && b !== undefined) {
    res.json({ result: a + b });
  } else {
    res.status(400).json({
      error: "Please send either {name} or {a, b} in JSON body",
    });
  }
});

// -------------------------------------------------------------------
// 5️⃣ Start the server
// -------------------------------------------------------------------
const port = parseInt(process.env.PORT || "10000");
app
  .listen(port, () => {
    console.log(`✅ MCP server running on http://localhost:${port}/api/mcp`);
    console.log(`✅ Curl test endpoint:  http://localhost:${port}/test`);
  })
  .on("error", (err) => {
    console.error("Server error:", err);
    process.exit(1);
  });
