#!/usr/bin/env node
/**
 * Inpost MCP stdio entry — proxies tool calls to the desktop HTTP bridge.
 * Requestly-style packaging: McpServer + StdioServerTransport + registerTools.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "inpost",
  version: "0.1.0",
});

async function main() {
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Inpost MCP running on stdio (desktop app must be open)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
