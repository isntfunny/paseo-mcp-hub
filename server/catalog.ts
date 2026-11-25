import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { ZodError } from "zod";
import {
  DEFAULT_EXCLUDED_PROVIDERS,
  catalogSchema,
  summarizeServer,
  type AgentSkippedMcp,
  type Catalog,
  type CatalogReadResult,
  type CatalogSaveResult,
  type InjectedMcpMeta,
  type RemoteServerConfig,
  type ServerConfig,
  type StdioServerConfig,
} from "../shared/schema";

const RESERVED_SERVER_NAME = "paseo";

export function paseoHome(): string {
  return process.env.PASEO_HOME ?? join(homedir(), ".paseo");
}

// Central MCP catalog. Re-read on every agent creation, so edits apply immediately
// to new sessions without reloading the plugin.
export const catalogPath =
  process.env.MCP_HUB_CATALOG ?? join(paseoHome(), "mcp-hub", "servers.json");

export type RuntimeServerConfig =
  | Omit<StdioServerConfig, "enabled" | "disabled">
  | (Omit<RemoteServerConfig, "enabled" | "disabled" | "type"> & { type: "http" })
  | (Omit<RemoteServerConfig, "enabled" | "disabled" | "type"> & { type: "sse" });

export interface EvaluatedCatalog {
  provider: string;
  providerExcluded: boolean;
  servers: Record<string, RuntimeServerConfig>;
  injected: InjectedMcpMeta[];
  skipped: AgentSkippedMcp[];
}

export function revisionOf(raw: string | null): string {
  if (raw === null) return "missing";
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function normalizeProviderId(provider: string): string {
  return provider.split("/")[0]?.trim() ?? provider.trim();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      })
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function cleanStringList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of values) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function cleanKeyValueMap(map: Readonly<Record<string, string>> | undefined): Record<string, string> | undefined {
  if (!map) return undefined;
  const entries = Object.entries(map)
    .map(([k, v]) => [k.trim(), v] as const)
    .filter(([k]) => k.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Validate and normalize a catalog into both in-memory schema shape and clean disk JSON shape. */
function normalizeCatalogForWrite(input: unknown): {
  catalog: Catalog;
  disk: Record<string, unknown>;
} {
  const parsed = catalogSchema.parse(input);
  const excludeProviders = cleanStringList(parsed.excludeProviders);
  const diskServers: Record<string, Record<string, unknown>> = {};
  const normalizedServers: Record<string, ServerConfig> = {};

  for (const [rawName, server] of Object.entries(parsed.servers)) {
    const name = rawName.trim();
    if (!name) {
      throw new Error("Server name must not be empty");
    }
    if (name === RESERVED_SERVER_NAME) {
      throw new Error(`Server name "${RESERVED_SERVER_NAME}" is reserved by Paseo`);
    }
    if (Object.hasOwn(normalizedServers, name)) {
      throw new Error(`Duplicate server name "${name}"`);
    }

    const enabled = Array.isArray(server.enabled)
      ? cleanStringList(server.enabled)
      : server.enabled;
    const disabled = cleanStringList(server.disabled);

    if (server.type === "stdio") {
      const command = server.command.trim();
      if (!command) {
        throw new Error(`Server "${name}": command must not be empty`);
      }
      const args = server.args?.map((a) => a.trim()).filter((a) => a.length > 0);
      const env = cleanKeyValueMap(server.env);

      const diskEntry: Record<string, unknown> = {
        ...(enabled !== true ? { enabled } : {}),
        ...(disabled.length > 0 ? { disabled } : {}),
        type: "stdio",
        command,
        ...(args && args.length > 0 ? { args } : {}),
        ...(env ? { env } : {}),
      };
      diskServers[name] = diskEntry;
      normalizedServers[name] = {
        enabled,
        disabled,
        type: "stdio",
        command,
        ...(args && args.length > 0 ? { args } : {}),
        ...(env ? { env } : {}),
      };
    } else {
      const url = server.url.trim();
      if (!url) {
        throw new Error(`Server "${name}": URL must not be empty`);
      }
      const headers = cleanKeyValueMap(server.headers);

      const diskEntry: Record<string, unknown> = {
        ...(enabled !== true ? { enabled } : {}),
        ...(disabled.length > 0 ? { disabled } : {}),
        type: server.type,
        url,
        ...(headers ? { headers } : {}),
      };
      diskServers[name] = diskEntry;
      normalizedServers[name] = {
        enabled,
        disabled,
        type: server.type,
        url,
        ...(headers ? { headers } : {}),
      };
    }
  }

  return {
    catalog: {
      excludeProviders,
      servers: normalizedServers,
    },
    disk: {
      excludeProviders,
      servers: diskServers,
    },
  };
}

/** Read and validate the MCP catalog without leaking secrets into error logs. */
export async function readCatalogState(filePath = catalogPath): Promise<CatalogReadResult> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        status: "ready",
        path: filePath,
        exists: false,
        revision: "missing",
        legacyProvidersFound: false,
        catalog: {
          excludeProviders: [...DEFAULT_EXCLUDED_PROVIDERS],
          servers: {},
        },
      };
    }
    return {
      status: "invalid",
      path: filePath,
      revision: "error",
      error: formatError(error),
      rawText: "",
    };
  }

  const revision = revisionOf(raw);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return {
      status: "invalid",
      path: filePath,
      revision,
      error: formatError(error),
      rawText: raw,
    };
  }

  const legacyProvidersFound = isPlainRecord(parsedJson) && Object.hasOwn(parsedJson, "providers");
  const result = catalogSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      status: "invalid",
      path: filePath,
      revision,
      error: formatError(result.error),
      rawText: raw,
    };
  }

  return {
    status: "ready",
    path: filePath,
    exists: true,
    revision,
    legacyProvidersFound,
    catalog: {
      excludeProviders: cleanStringList(result.data.excludeProviders),
      servers: result.data.servers,
    },
  };
}

// Keep the revision check and rename together for writers inside the plugin.
let pendingSave: Promise<unknown> = Promise.resolve();

export function saveCatalogAtomic(
  input: Catalog,
  expectedRevision: string,
  filePath = catalogPath,
): Promise<CatalogSaveResult> {
  const save = pendingSave.then(() => writeCatalog(input, expectedRevision, filePath));
  pendingSave = save.catch(() => undefined);
  return save;
}

/** Write a validated catalog atomically with 0600 permissions and optimistic revision check. */
async function writeCatalog(
  input: Catalog,
  expectedRevision: string,
  filePath = catalogPath,
): Promise<CatalogSaveResult> {
  let normalized: { catalog: Catalog; disk: Record<string, unknown> };
  try {
    normalized = normalizeCatalogForWrite(input);
  } catch (error) {
    return { status: "invalid", error: formatError(error) };
  }

  let currentRaw: string | null = null;
  try {
    currentRaw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      return { status: "invalid", error: formatError(error) };
    }
  }

  const currentRevision = revisionOf(currentRaw);
  if (currentRevision !== expectedRevision) {
    return {
      status: "conflict",
      error: "Catalog was modified externally. Reload and try again.",
    };
  }

  const serialized = `${JSON.stringify(normalized.disk, null, 2)}\n`;
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmpPath = join(dir, `.servers.${randomBytes(6).toString("hex")}.tmp`);

  try {
    await writeFile(tmpPath, serialized, { encoding: "utf8", mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, filePath);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }

  return {
    status: "saved",
    revision: revisionOf(serialized),
    catalog: normalized.catalog,
  };
}

/** Parse raw JSON text from recovery/advanced editor and persist atomically. */
export async function saveRawCatalogAtomic(
  rawJson: string,
  expectedRevision: string,
  filePath = catalogPath,
): Promise<CatalogSaveResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return { status: "invalid", error: formatError(error) };
  }
  const validated = catalogSchema.safeParse(parsed);
  if (!validated.success) {
    return { status: "invalid", error: formatError(validated.error) };
  }
  return saveCatalogAtomic(validated.data, expectedRevision, filePath);
}

function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}

function isWithin(dir: string, root: string): boolean {
  return dir === root || dir.startsWith(root.endsWith(sep) ? root : root + sep);
}

// A git worktree (e.g. a Paseo worktree under ~/.paseo/worktrees) also counts as
// the repository it belongs to, so project paths keep matching in worktrees.
export async function candidateDirs(cwd: string): Promise<string[]> {
  const dirs = [resolve(cwd)];
  try {
    const { stdout } = await promisify(execFile)(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, timeout: 2000 },
    );
    const commonDir = stdout.trim();
    if (commonDir.endsWith(`${sep}.git`)) dirs.push(dirname(commonDir));
  } catch {
    // Not a git repository, or git is unavailable.
  }
  return dirs;
}

/** Evaluate which catalog servers are active or skipped for a provider + working directory. */
export async function evaluateCatalog(
  catalog: Catalog,
  input: {
    provider: string;
    cwd: string;
    existingServerNames?: ReadonlySet<string>;
  },
): Promise<EvaluatedCatalog> {
  const provider = normalizeProviderId(input.provider);
  const providerExcluded = catalog.excludeProviders.includes(provider);
  const dirs = providerExcluded ? [] : await candidateDirs(input.cwd);
  const matches = (roots: readonly string[]) =>
    roots.some((root) => {
      const trimmed = root.trim();
      if (!trimmed) return false;
      const expanded = expandPath(trimmed);
      return dirs.some((dir) => isWithin(dir, expanded));
    });

  const servers: Record<string, RuntimeServerConfig> = {};
  const injected: InjectedMcpMeta[] = [];
  const skipped: AgentSkippedMcp[] = [];

  for (const [name, server] of Object.entries(catalog.servers)) {
    if (providerExcluded) {
      skipped.push({ name, type: server.type, reason: "provider_excluded" });
      continue;
    }

    if (server.enabled === false) {
      skipped.push({ name, type: server.type, reason: "disabled_globally" });
      continue;
    }

    if (Array.isArray(server.enabled) && !matches(server.enabled)) {
      skipped.push({ name, type: server.type, reason: "dir_not_matched" });
      continue;
    }

    if (matches(server.disabled)) {
      skipped.push({ name, type: server.type, reason: "dir_excluded" });
      continue;
    }

    if (name === RESERVED_SERVER_NAME || input.existingServerNames?.has(name)) {
      skipped.push({ name, type: server.type, reason: "overridden" });
      continue;
    }

    if (server.type === "stdio") {
      const { enabled: _enabled, disabled: _disabled, ...stdioConfig } = server;
      servers[name] = stdioConfig;
    } else if (server.type === "http") {
      const { enabled: _enabled, disabled: _disabled, ...httpConfig } = server;
      servers[name] = { ...httpConfig, type: "http" };
    } else {
      const { enabled: _enabled, disabled: _disabled, ...sseConfig } = server;
      servers[name] = { ...sseConfig, type: "sse" };
    }
    injected.push({
      name,
      type: server.type,
      summary: summarizeServer(server),
      envKeys: server.type === "stdio" ? Object.keys(server.env ?? {}).sort() : [],
      headerKeys: server.type !== "stdio" ? Object.keys(server.headers ?? {}).sort() : [],
      matchedBy: Array.isArray(server.enabled) ? "directory" : "global",
    });
  }

  return {
    provider,
    providerExcluded,
    servers,
    injected,
    skipped,
  };
}
