import { createServer } from "@modelcontextprotocol/sdk/server";
import { z } from "zod";

// Create the MCP server
const server = createServer({
  name: "wein-mcp",
  version: "1.0.0",
});

// === Tool: Search wines ===
server.tool({
  name: "search",
  description: "Search wines from Spanienweinonline feed",
  input: z.object({ query: z.string() }),
  output: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string(),
      })
    ),
  }),
  handler: async ({ query }) => {
    const xmlUrl = "https://www.spanienweinonline.ch/AI.xml?key=CHat@sw34234ol.csdfsdfh25!";
    const xml = await (await fetch(xmlUrl)).text();

    const results = [...xml.matchAll(/<product>([\s\S]*?)<\/product>/g)]
      .map((m) => {
        const get = (tag, base = m[1]) =>
          (base.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1]?.trim() || "";
        return {
          id: get("product-id"),
          title: get("wine-name"),
          url: get("link"),
        };
      })
      .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()));

    return { results };
  },
});

// === Tool: Fetch details by ID ===
server.tool({
  name: "fetch",
  description: "Fetch details for a specific wine",
  input: z.object({ id: z.string() }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    url: z.string(),
  }),
  handler: async ({ id }) => {
    const xmlUrl = "https://www.spanienweinonline.ch/AI.xml?key=CHat@swol.ch25!";
    const xml = await (await fetch(xmlUrl)).text();
    const match = [...xml.matchAll(/<product>([\s\S]*?)<\/product>/g)]
      .map((m) => {
        const get = (tag, base = m[1]) =>
          (base.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1]?.trim() || "";
        return {
          id: get("product-id"),
          title: get("wine-name"),
          url: get("link"),
        };
      })
      .find((p) => p.id === id);
    return match || { id, title: "Not found", url: "" };
  },
});

// === Vercel-compatible handler ===
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(204).end();
  }

  const response = await server.handleRequest(req);
  res.status(response.status || 200);
  res.setHeader("content-type", "application/json");
  res.send(await response.text());
}
