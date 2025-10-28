import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import FastXMLParser from "fast-xml-parser";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Remote XML file
const XML_URL = "https://www.spanienweinonline.ch/AI.xml?key=CHat@swol.ch25!";

// --- Cache so we don’t hammer the endpoint
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchAndParseXml() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  const res = await fetch(XML_URL);
  if (!res.ok) throw new Error(`Failed to fetch XML: ${res.status} ${res.statusText}`);
  const xmlText = await res.text();

  const parsed = FastXMLParser.parse(xmlText, {
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: true
  });

  // Try to locate array-like nodes
  const items = [];
  function collect(obj, prefix = "") {
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => collect(v, `${prefix}[${i}]`));
    } else if (obj && typeof obj === "object") {
      const primitiveProps = Object.values(obj).every(v => typeof v !== "object");
      if (primitiveProps) items.push({ __id: prefix || "item-" + items.length, ...obj });
      else for (const key of Object.keys(obj)) collect(obj[key], prefix ? `${prefix}.${key}` : key);
    }
  }
  collect(parsed);

  cache = { items };
  cacheTime = now;
  return cache;
}

// --- MCP server setup ---
const server = new McpServer({ name: "xml-mcp", version: "1.0.0" });

// Tool: search
server.registerTool(
  "search",
  {
    title: "XML Search",
    description: "Searches the XML feed by text value",
    inputSchema: { q: z.string().describe("Search query") },
    outputSchema: {
      results: z.array(z.object({ id: z.string(), title: z.string().optional(), snippet: z.string().optional() }))
    }
  },
  async ({ q }) => {
    const { items } = await fetchAndParseXml();
    const qLower = q.toLowerCase();
    const results = items
      .filter(it => Object.values(it).some(v => String(v).toLowerCase().includes(qLower)))
      .slice(0, 25)
      .map(it => ({
        id: it.__id,
        title: it.title || it.name || Object.values(it)[0],
        snippet: JSON.stringify(it).slice(0, 100)
      }));

    return {
      content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
      structuredContent: { results }
    };
  }
);

// Tool: fetch
server.registerTool(
  "fetch",
  {
    title: "XML Fetch",
    description: "Fetches full details for a specific item id",
    inputSchema: { id: z.string() },
    outputSchema: {
      id: z.string(),
      text: z.string(),
      metadata: z.record(z.any()).optional()
    }
  },
  async ({ id }) => {
    const { items } = await fetchAndParseXml();
    const item = items.find(it => it.__id === id);
    if (!item) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Not found" }) }], isError: true };
    }
    const text = Object.entries(item)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: { id, text, metadata: { source: XML_URL } }
    };
  }
);

// --- Express server ---
const app = express();
app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"], allowedHeaders: ["Content-Type", "mcp-session-id"] }));
app.use(express.json());

// MCP endpoint
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Helper: search (for quick curl testing)
app.post("/test-search", async (req, res) => {
  try {
    const { items } = await fetchAndParseXml();
    const q = (req.body.q || "").toLowerCase();
    const results = items
      .filter(it => Object.values(it).some(v => String(v).toLowerCase().includes(q)))
      .slice(0, 10)
      .map(it => ({ id: it.__id, preview: JSON.stringify(it).slice(0, 120) }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: fetch (for quick curl testing)
app.get("/test-fetch", async (req, res) => {
  try {
    const { items } = await fetchAndParseXml();
    const item = items.find(it => it.__id === req.query.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ XML MCP server running on http://localhost:${PORT}/mcp`);
});
