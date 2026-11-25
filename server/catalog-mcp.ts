import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { catalogPath, readCatalogState, saveCatalogAtomic } from "./catalog";
import { enabledSchema, serverConfigSchema } from "../shared/schema";

export const catalogMcpName = "mcp-hub-admin";

const configSchema = z.strictObject({
  type: z.enum(["stdio", "http", "sse"]).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.url({ protocol: /^https?$/ }).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: enabledSchema.unwrap().optional(),
  disabled: z.array(z.string()).optional(),
});

function toolError(text: string) {
  return { isError: true, content: [{ type: "text" as const, text }] };
}

function createCatalogServer(path: string) {
  const mcp = new McpServer({ name: catalogMcpName, version: "1.0.0" });
  mcp.registerTool("manage_server", {
    description: "Add, update, or remove a named server in the shared MCP Hub catalog. Changes apply to newly created agents. Add needs a transport and its command or URL. Update merges supplied fields into the existing entry. Remove deletes the named entry.",
    inputSchema: {
      action: z.enum(["add", "update", "remove"]),
      name: z.string().trim().min(1).describe("Name of the catalog entry"),
      config: configSchema.optional().describe("Server configuration for add, or fields to replace for update. Omit for remove."),
    },
  }, async ({ action, name, config }) => {
    if (name === "paseo" || name === catalogMcpName || name === "__proto__") {
      return toolError("This server name is reserved.");
    }
    if (action === "remove" ? config !== undefined : !config || Object.keys(config).length === 0) {
      return toolError("Provide config for add or update and omit it for remove.");
    }

    const state = await readCatalogState(path);
    if (state.status !== "ready") return toolError("The MCP Hub catalog could not be read.");
    const servers = { ...state.catalog.servers };
    const exists = Object.hasOwn(servers, name);
    if (action === "add" && exists) return toolError("The server already exists.");
    if (action !== "add" && !exists) return toolError("The server does not exist.");

    if (action === "remove") {
      delete servers[name];
    } else {
      const current = servers[name];
      const type = config?.type ?? current?.type;
      const hasLocalFields = config?.command !== undefined || config?.args !== undefined || config?.env !== undefined;
      const hasRemoteFields = config?.url !== undefined || config?.headers !== undefined;
      if (type === "stdio" ? hasRemoteFields : hasLocalFields) {
        return toolError("The configuration fields must match the server transport.");
      }
      const transportChanged = config?.type !== undefined && current?.type !== config.type;
      const previous = transportChanged
        ? { enabled: current?.enabled, disabled: current?.disabled }
        : current;
      const parsed = serverConfigSchema.safeParse({ ...previous, ...config });
      if (!parsed.success) return toolError("Supply a command for stdio or a URL for http and sse.");
      servers[name] = parsed.data;
    }

    const result = await saveCatalogAtomic({ ...state.catalog, servers }, state.revision, path);
    if (result.status === "conflict") return toolError("The catalog changed. Retry the operation.");
    if (result.status !== "saved") return toolError("The updated catalog is invalid.");
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ action, name, status: "saved" }) }],
    };
  });
  return mcp;
}

export async function startCatalogMcp(path = catalogPath) {
  const host = "127.0.0.1";
  const authorization = `Bearer ${randomBytes(32).toString("hex")}`;
  const http = createServer(async (request, response) => {
    if (request.url !== "/mcp") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== authorization) {
      response.writeHead(401).end();
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST" }).end();
      return;
    }

    const mcp = createCatalogServer(path);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.once("close", () => { void mcp.close(); });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(request, response);
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, host, () => {
      http.off("error", reject);
      resolve();
    });
  });
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("MCP Hub MCP has no TCP address.");
  return {
    config: {
      type: "http" as const,
      url: `http://${host}:${address.port}/mcp`,
      headers: { Authorization: authorization },
    },
    close: () => new Promise<void>((resolve, reject) => {
      http.close((error) => error ? reject(error) : resolve());
      http.closeAllConnections();
    }),
  };
}
