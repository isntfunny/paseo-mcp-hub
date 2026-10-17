import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

// Central MCP catalog. Edit this file to add servers or flip `enabled`;
// it is re-read on every agent creation, so no plugin reload is needed.
export const catalogPath =
  process.env.MCP_HUB_CATALOG ?? join(homedir(), ".paseo", "mcp-hub", "servers.json");

// `true`/`false` turns a server on or off everywhere. A list of directories
// limits it to agents whose cwd is one of them or lies below one of them.
const enabled = z.union([z.boolean(), z.array(z.string())]).default(true);

const stdioServer = z.object({
  enabled,
  type: z.literal("stdio"),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const remoteServer = z.object({
  enabled,
  type: z.enum(["http", "sse"]),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

const catalogSchema = z.object({
  // Providers that receive the servers; others (e.g. ACP adapters without MCP support) are skipped.
  providers: z.array(z.string()).default(["claude", "codex"]),
  servers: z.record(z.string(), z.discriminatedUnion("type", [stdioServer, remoteServer])),
});

export type Catalog = z.infer<typeof catalogSchema>;

export async function loadCatalog(): Promise<Catalog> {
  const raw = await readFile(catalogPath, "utf8");
  return catalogSchema.parse(JSON.parse(raw));
}

function expandPath(path: string) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}

function isWithin(dir: string, root: string) {
  return dir === root || dir.startsWith(root.endsWith(sep) ? root : root + sep);
}

// A git worktree (e.g. a Paseo worktree under ~/.paseo/worktrees) also counts as
// the repository it belongs to, so project paths keep matching in worktrees.
async function candidateDirs(cwd: string) {
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

export async function enabledServers(catalog: Catalog, cwd: string) {
  const dirs = await candidateDirs(cwd);
  return Object.fromEntries(
    Object.entries(catalog.servers)
      .filter(([, server]) =>
        typeof server.enabled === "boolean"
          ? server.enabled
          : server.enabled.some((root) => dirs.some((dir) => isWithin(dir, expandPath(root)))),
      )
      .map(([name, { enabled: _enabled, ...server }]) => [name, server]),
  );
}
