import type { PaseoApi } from "@getpaseo/client";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectAgentMcps } from "./agent-mcps";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-hub-agent-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function mockPaseo(agent: {
  id: string;
  provider: string;
  cwd: string;
  metadata: Record<string, unknown>;
}): PaseoApi {
  return {
    agents: {
      ref: () => ({
        refresh: async () => ({ agent, project: null }),
      }),
    },
  } as unknown as PaseoApi;
}

describe("inspectAgentMcps", () => {
  it("merges stored servers + hub metadata, computes drift, and strips every secret", async () => {
    const dir = await makeTempDir();
    const agentsDir = join(dir, "agents", "project-a");
    await mkdir(agentsDir, { recursive: true });
    const catalogPath = join(dir, "servers.json");

    const secretToken = "SUPER_SECRET_TOKEN_VALUE_12345";
    const secretHeader = "Bearer SECRET_HEADER_VALUE_67890";
    const secretQuery = "SECRET_QUERY_TOKEN_99999";

    await writeFile(
      catalogPath,
      JSON.stringify({
        excludeProviders: ["pi"],
        servers: {
          coolify: {
            type: "stdio",
            command: "npx",
            args: ["-y", "coolify-mcp"],
            env: { COOLIFY_TOKEN: secretToken },
          },
          newServer: {
            type: "http",
            url: `https://api.example.com/mcp?api_key=${secretQuery}`,
            headers: { Authorization: secretHeader },
          },
          disabledOne: {
            enabled: false,
            type: "stdio",
            command: "echo",
          },
        },
      }),
    );

    const agentId = "agent-123";
    await writeFile(
      join(agentsDir, `${agentId}.json`),
      JSON.stringify({
        id: agentId,
        config: {
          mcpServers: {
            paseo: {
              type: "http",
              url: "http://127.0.0.1:1234/mcp/agents?callerAgentId=agent-123",
              headers: { Authorization: "Bearer INTERNAL_PASEO_SECRET" },
            },
            coolify: {
              type: "stdio",
              command: "npx",
              args: ["-y", "coolify-mcp"],
              env: { COOLIFY_TOKEN: secretToken },
            },
            "shared-browser": {
              type: "stdio",
              command: "node",
              args: ["shared-browser-mcp.cjs"],
              env: { PASEO_SHARED_BROWSER_TICKET: "TICKET_SECRET_ABC" },
            },
            removedServer: {
              type: "http",
              url: `https://old.example.com/mcp?token=${secretQuery}`,
              headers: { "X-Api-Key": secretHeader },
            },
          },
        },
      }),
    );

    const paseo = mockPaseo({
      id: agentId,
      provider: "agy",
      cwd: "/workspace/project-a",
      metadata: {
        "mcp-hub": {
          version: 1,
          evaluatedAt: "2026-11-19T06:00:00.000Z",
          provider: "agy",
          providerExcluded: false,
          injected: [
            {
              name: "coolify",
              type: "stdio",
              summary: "npx -y coolify-mcp",
              envKeys: ["COOLIFY_TOKEN"],
              headerKeys: [],
              matchedBy: "global",
            },
            {
              name: "removedServer",
              type: "http",
              summary: "https://old.example.com/mcp",
              envKeys: [],
              headerKeys: ["X-Api-Key"],
              matchedBy: "global",
            },
          ],
          skipped: [
            { name: "disabledOne", type: "stdio", reason: "disabled_globally" },
          ],
        },
      },
    });

    const result = await inspectAgentMcps(paseo, agentId, {
      catalogPath,
      agentsDir: join(dir, "agents"),
    });

    expect(result.active.map((a) => [a.name, a.source])).toEqual([
      ["coolify", "mcp-hub"],
      ["removedServer", "mcp-hub"],
      ["shared-browser", "other"],
    ]);
    expect(result.active[0]?.envKeys).toEqual(["COOLIFY_TOKEN"]);
    expect(result.active[1]?.summary).toBe("https://old.example.com/mcp");
    expect(result.skipped).toEqual([
      { name: "disabledOne", type: "stdio", reason: "disabled_globally" },
    ]);
    expect(result.drift).toEqual({
      added: ["newServer"],
      removed: ["removedServer"],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secretToken);
    expect(serialized).not.toContain(secretHeader);
    expect(serialized).not.toContain(secretQuery);
    expect(serialized).not.toContain("INTERNAL_PASEO_SECRET");
    expect(serialized).not.toContain("TICKET_SECRET_ABC");
  });

  it("handles legacy agents without mcp-hub metadata", async () => {
    const dir = await makeTempDir();
    const agentsDir = join(dir, "agents");
    await mkdir(agentsDir, { recursive: true });
    const catalogPath = join(dir, "servers.json");

    await writeFile(
      catalogPath,
      JSON.stringify({
        excludeProviders: ["pi"],
        servers: {
          coolify: { type: "stdio", command: "npx" },
          grafana: { enabled: ["/other/repo"], type: "stdio", command: "uvx" },
        },
      }),
    );

    const agentId = "legacy-agent";
    await writeFile(
      join(agentsDir, `${agentId}.json`),
      JSON.stringify({
        id: agentId,
        config: {
          mcpServers: {
            coolify: { type: "stdio", command: "npx" },
          },
        },
      }),
    );

    const result = await inspectAgentMcps(
      mockPaseo({
        id: agentId,
        provider: "claude",
        cwd: dir,
        metadata: {},
      }),
      agentId,
      { catalogPath, agentsDir },
    );

    expect(result.active).toEqual([
      {
        name: "coolify",
        type: "stdio",
        summary: "npx",
        envKeys: [],
        headerKeys: [],
        source: "mcp-hub",
        matchedBy: "global",
      },
    ]);
    expect(result.skipped).toEqual([
      { name: "grafana", type: "stdio", reason: "dir_not_matched" },
    ]);
    expect(result.drift).toEqual({ added: [], removed: [] });
  });
});
