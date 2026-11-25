import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it } from "vitest";
import { readCatalogState } from "./catalog";
import { startCatalogMcp } from "./catalog-mcp";

it("manages one catalog entry over MCP without returning its credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-hub-tools-"));
  const path = join(dir, "servers.json");
  const server = await startCatalogMcp(path);
  const client = new Client({ name: "test", version: "1" });
  try {
    const unauthenticated = await fetch(server.config.url, { method: "POST" });
    expect(unauthenticated.status).toBe(401);

    await client.connect(new StreamableHTTPClientTransport(new URL(server.config.url), {
      requestInit: { headers: server.config.headers },
    }));
    expect((await client.listTools()).tools.map(({ name }) => name)).toEqual(["manage_server"]);
    const call = (args: Record<string, unknown>) =>
      client.callTool({ name: "manage_server", arguments: args });

    const added = await call({
      action: "add",
      name: "example",
      config: { type: "http", url: "https://example.test/mcp?token=private", headers: { Authorization: "private" } },
    });
    expect(added.isError).toBeUndefined();
    expect(JSON.stringify(added)).not.toContain("private");
    expect((await call({ action: "add", name: "example", config: { type: "stdio", command: "example" } })).isError).toBe(true);

    const updated = await call({ action: "update", name: "example", config: { enabled: false } });
    expect(updated.isError).toBeUndefined();
    expect(await readCatalogState(path)).toMatchObject({
      catalog: { servers: { example: { enabled: false, headers: { Authorization: "private" } } } },
    });

    expect((await call({ action: "remove", name: "example" })).isError).toBeUndefined();
    expect((await call({ action: "remove", name: "example" })).isError).toBe(true);
    expect(await readCatalogState(path)).toMatchObject({ catalog: { servers: {} } });
  } finally {
    await client.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
