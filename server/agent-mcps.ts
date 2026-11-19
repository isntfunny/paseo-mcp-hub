import type { PaseoApi } from "@getpaseo/client";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agentMcpsResultSchema,
  hubAgentMetadataSchema,
  summarizeServer,
  type AgentActiveMcp,
  type AgentMcpsResult,
  type AgentSkippedMcp,
  type TransportType,
} from "../shared/schema";
import {
  evaluateCatalog,
  normalizeProviderId,
  paseoHome,
  readCatalogState,
} from "./catalog";

const MAX_CACHED_PATHS = 500;
const agentFilePathCache = new Map<string, string>();

function cacheKey(agentsRoot: string, agentId: string): string {
  return `${agentsRoot}\0${agentId}`;
}

function setCachedPath(agentsRoot: string, agentId: string, filePath: string): void {
  const key = cacheKey(agentsRoot, agentId);
  if (agentFilePathCache.size >= MAX_CACHED_PATHS) {
    const oldestKey = agentFilePathCache.keys().next().value;
    if (oldestKey !== undefined) agentFilePathCache.delete(oldestKey);
  }
  agentFilePathCache.set(key, filePath);
}

function isSafeAgentId(agentId: string): boolean {
  return (
    agentId.length > 0 &&
    !agentId.includes("/") &&
    !agentId.includes("\\") &&
    !agentId.includes("..") &&
    !agentId.includes("\0")
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInternalPaseoMcpServer(name: string, raw: Record<string, unknown>): boolean {
  if (name !== "paseo") return false;
  if (raw.type !== "http" && raw.type !== "sse") return true;
  if (typeof raw.url !== "string") return true;
  try {
    return new URL(raw.url).pathname === "/mcp/agents";
  } catch {
    return true;
  }
}

interface StoredMcpSnapshot {
  name: string;
  type: TransportType;
  summary: string;
  envKeys: string[];
  headerKeys: string[];
}

function extractStoredMcpServers(rawRecord: unknown): StoredMcpSnapshot[] | null {
  if (!isPlainRecord(rawRecord)) return null;
  if (!isPlainRecord(rawRecord.config)) return null;
  if (rawRecord.config.mcpServers === undefined || rawRecord.config.mcpServers === null) {
    return [];
  }
  if (!isPlainRecord(rawRecord.config.mcpServers)) return null;

  const list: StoredMcpSnapshot[] = [];
  for (const [name, rawEntry] of Object.entries(rawRecord.config.mcpServers)) {
    if (!isPlainRecord(rawEntry)) continue;
    if (isInternalPaseoMcpServer(name, rawEntry)) continue;

    const rawType = rawEntry.type;
    const type: TransportType =
      rawType === "http" || rawType === "sse" || rawType === "stdio"
        ? rawType
        : typeof rawEntry.command === "string"
          ? "stdio"
          : "http";

    if (type === "stdio") {
      const command = typeof rawEntry.command === "string" ? rawEntry.command : "";
      const args = Array.isArray(rawEntry.args)
        ? rawEntry.args.filter((item): item is string => typeof item === "string")
        : [];
      const envKeys = isPlainRecord(rawEntry.env) ? Object.keys(rawEntry.env).sort() : [];
      list.push({
        name,
        type,
        summary: summarizeServer({ type, command, args }),
        envKeys,
        headerKeys: [],
      });
    } else {
      const url = typeof rawEntry.url === "string" ? rawEntry.url : "";
      const headerKeys = isPlainRecord(rawEntry.headers)
        ? Object.keys(rawEntry.headers).sort()
        : [];
      list.push({
        name,
        type,
        summary: summarizeServer({ type, url }),
        envKeys: [],
        headerKeys,
      });
    }
  }
  return list;
}

async function readStoredAgentMcpServers(
  agentId: string,
  agentsRoot: string,
): Promise<StoredMcpSnapshot[] | null> {
  if (!isSafeAgentId(agentId)) return null;

  const key = cacheKey(agentsRoot, agentId);
  const tryRead = async (filePath: string): Promise<StoredMcpSnapshot[] | null> => {
    try {
      const content = await readFile(filePath, "utf8");
      setCachedPath(agentsRoot, agentId, filePath);
      return extractStoredMcpServers(JSON.parse(content));
    } catch {
      return null;
    }
  };

  const cached = agentFilePathCache.get(key);
  if (cached) {
    const hit = await tryRead(cached);
    if (hit !== null) return hit;
    agentFilePathCache.delete(key);
  }

  const direct = await tryRead(join(agentsRoot, `${agentId}.json`));
  if (direct !== null) return direct;

  let entries;
  try {
    entries = await readdir(agentsRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await tryRead(join(agentsRoot, entry.name, `${agentId}.json`));
    if (found !== null) return found;
  }

  return null;
}

export interface InspectAgentMcpsOptions {
  catalogPath?: string;
  agentsDir?: string;
}

/**
 * Inspect an agent's active MCP servers, skipped catalog entries, and config drift.
 * Strictly excludes all secret values (env values, header values, URL credentials/queries).
 */
export async function inspectAgentMcps(
  paseo: PaseoApi,
  agentId: string,
  options: InspectAgentMcpsOptions = {},
): Promise<AgentMcpsResult> {
  if (!isSafeAgentId(agentId)) {
    throw new Error("Invalid agent ID");
  }

  const refreshed = await paseo.agents.ref(agentId).refresh();
  if (!refreshed?.agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const { agent } = refreshed;
  const provider = normalizeProviderId(agent.provider);
  const cwd = agent.cwd;
  const agentsDir = options.agentsDir ?? join(paseoHome(), "agents");

  const [storedServers, catalogState] = await Promise.all([
    readStoredAgentMcpServers(agentId, agentsDir),
    readCatalogState(options.catalogPath),
  ]);

  const parsedMeta = hubAgentMetadataSchema.safeParse(agent.metadata?.["mcp-hub"]);
  const hubMeta = parsedMeta.success ? parsedMeta.data : null;
  const injectedByName = new Map(
    (hubMeta?.injected ?? []).map((entry) => [entry.name, entry]),
  );

  const active: AgentActiveMcp[] = [];
  if (storedServers !== null) {
    for (const entry of storedServers) {
      const injectedMeta = injectedByName.get(entry.name);
      if (injectedMeta) {
        active.push({
          ...entry,
          source: "mcp-hub",
          matchedBy: injectedMeta.matchedBy,
        });
      } else if (
        !hubMeta &&
        catalogState.status === "ready" &&
        Object.hasOwn(catalogState.catalog.servers, entry.name)
      ) {
        const catalogEntry = catalogState.catalog.servers[entry.name]!;
        active.push({
          ...entry,
          source: "mcp-hub",
          matchedBy: Array.isArray(catalogEntry.enabled) ? "directory" : "global",
        });
      } else {
        active.push({
          ...entry,
          source: "other",
        });
      }
    }
  } else if (hubMeta) {
    for (const entry of hubMeta.injected) {
      active.push({
        ...entry,
        source: "mcp-hub",
      });
    }
  }

  active.sort((a, b) => a.name.localeCompare(b.name));

  let skipped: AgentSkippedMcp[] = hubMeta?.skipped ? [...hubMeta.skipped] : [];
  let providerExcluded = hubMeta?.providerExcluded ?? false;
  let drift = { added: [] as string[], removed: [] as string[] };

  if (catalogState.status === "ready") {
    const otherNames = new Set(
      active.filter((item) => item.source === "other").map((item) => item.name),
    );
    const currentEval = await evaluateCatalog(catalogState.catalog, {
      provider,
      cwd,
      existingServerNames: otherNames,
    });

    if (!hubMeta) {
      providerExcluded = currentEval.providerExcluded;
      const activeNames = new Set(active.map((item) => item.name));
      skipped = currentEval.skipped.filter((item) => !activeNames.has(item.name));
    }

    const currentHubNames = new Set(currentEval.injected.map((item) => item.name));
    const activeHubNames = new Set(
      active.filter((item) => item.source === "mcp-hub").map((item) => item.name),
    );

    drift = {
      added: [...currentHubNames].filter((name) => !activeHubNames.has(name)).sort(),
      removed: [...activeHubNames].filter((name) => !currentHubNames.has(name)).sort(),
    };
  }

  skipped.sort((a, b) => a.name.localeCompare(b.name));

  return agentMcpsResultSchema.parse({
    agentId,
    provider,
    cwd,
    providerExcluded,
    ...(catalogState.status === "invalid" ? { catalogError: catalogState.error } : {}),
    active,
    skipped,
    drift,
    ...(hubMeta ? { recordedAt: hubMeta.evaluatedAt } : {}),
  });
}
