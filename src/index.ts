#!/usr/bin/env node
/**
 * Qasper MCP shim.
 *
 * Exposes Qasper's remote MCP server (https://qasper.ai/mcp) as a local stdio
 * MCP server so it can be installed via `npx @qasper/mcp-server` from any MCP
 * client (Claude Desktop, Cursor, etc.) and listed in Anthropic's directory.
 *
 * Strategy: on startup we hit the upstream `tools/list` once and cache the
 * advertised tool schemas. Every `tools/call` is forwarded verbatim. No tool
 * definitions are hardcoded here, so adding a new tool to BusinessAgentTools
 * on the C# side requires zero changes here.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

const UPSTREAM_URL = process.env.QASPER_MCP_URL ?? "https://qasper.ai/mcp";

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

let requestId = 0;
const nextId = () => ++requestId;

async function callUpstream<T = unknown>(
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const res = await fetch(UPSTREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId(),
      method,
      params,
    }),
  });

  if (!res.ok) {
    throw new Error(`Upstream ${UPSTREAM_URL} returned ${res.status} ${res.statusText}`);
  }

  // Streamable HTTP can return either application/json or text/event-stream.
  const contentType = res.headers.get("content-type") ?? "";
  let payload: JsonRpcResponse<T>;

  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    // Pull the first `data: { ... }` line.
    const dataLine = text
      .split("\n")
      .find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error("Upstream SSE response had no data line");
    payload = JSON.parse(dataLine.slice(5).trim());
  } else {
    payload = (await res.json()) as JsonRpcResponse<T>;
  }

  if (payload.error) {
    throw new Error(`Upstream error ${payload.error.code}: ${payload.error.message}`);
  }
  return payload.result as T;
}

async function main() {
  const server = new Server(
    {
      name: "qasper",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Cache tools/list from upstream so we can serve it synchronously to clients
  // that list tools repeatedly.
  let cachedTools: Tool[] | null = null;
  let cacheExpiry = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async function getTools(): Promise<Tool[]> {
    const now = Date.now();
    if (cachedTools && now < cacheExpiry) return cachedTools;

    const result = await callUpstream<{ tools: Tool[] }>("tools/list", {});
    cachedTools = result.tools ?? [];
    cacheExpiry = now + CACHE_TTL_MS;
    return cachedTools;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const tools = await getTools();
      return { tools };
    } catch (err) {
      // If the upstream is down, return an empty list rather than crashing
      // the client. The error surfaces on the next tools/call.
      console.error(`[qasper-mcp] tools/list failed:`, err);
      return { tools: [] };
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await callUpstream<{
        content: Array<{ type: string; text?: string }>;
        isError?: boolean;
      }>("tools/call", { name, arguments: args ?? {} });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Qasper upstream error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[qasper-mcp] connected, proxying to ${UPSTREAM_URL}`);
}

main().catch((err) => {
  console.error("[qasper-mcp] fatal:", err);
  process.exit(1);
});