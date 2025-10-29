import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const XML_URL = "https://www.spanienweinonline.ch/AI.xml?key=CHat@swol.ch25!";

// Cache to avoid re-fetching big XML each time
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchAndParseXml() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  console.log("⏳ Fetching XML feed...");
  const res = await fetch(XML_URL);
  if (!res.ok) throw new Error(`Failed to fetch XML: ${res.status} ${res.statusText}`);
  const xmlText = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: true
  });

  const parsed = parser.parse(xmlText);
  const products = parsed["vivino-product-list"]?.product;
  if (!products) throw new Error("No <product> elements found in XML feed.");

  // Limit to top 10 entries
  const limited = Array.isArray(products) ? products.slice(0, 5000) : [products];

  const items = limited.map((p, i) => ({
    __id: String(p["product-id"] ?? `item-${i}`),
    name: p["wine-name"] ?? "",
    price: p.price ?? "",
    link: p.link ?? "",
    ...(p.extras || {}) // flatten extras
  }));

  cache = { items };
  cacheTime = now;
  console.log(`✅ Cached ${items.length} XML items.`);
  return cache;
}

// Prefetch XML on startup
(async () => {
  try {
    console.log("⏳ Prefetching XML feed...");
    await fetchAndParseXml();
    console.log("✅ XML cached and ready!");
  } catch (err) {
    console.error("⚠️ Prefetch failed:", err.message);
  }
})();

// --- MCP Server Setup ---
const server = new McpServer({ name: "xml-mcp", version: "1.0.0" });

// Tool: search
// Tool: search
server.registerTool(
  "search",
  {
    title: "XML Search",
    description: "Searches the XML feed by text value",
    inputSchema: { q: z.string().describe("Search query") },
    outputSchema: {
      results: z.array(z.object({
        id: z.string(),
        title: z.string().optional(),
        snippet: z.string().optional()
      }))
    }
  },
  async ({ q }) => {
    const { items } = await fetchAndParseXml();
    const qLower = q.toLowerCase();
    const results = items
      .filter(it => Object.values(it).some(v => String(v).toLowerCase().includes(qLower)))
      .slice(0, 20) // ✅ limit results to top 20
      .map(it => ({
        id: it.__id,
        title: it.name || it.title || Object.values(it)[0],
        snippet: JSON.stringify(it)
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
