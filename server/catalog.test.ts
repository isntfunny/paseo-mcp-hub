import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { catalogSchema, sanitizeUrlForDisplay } from "../shared/schema";
import {
  evaluateCatalog,
  readCatalogState,
  saveCatalogAtomic,
  saveRawCatalogAtomic,
} from "./catalog";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-hub-catalog-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("catalog schema and URL sanitization", () => {
  it("defaults excludeProviders to ['pi'] and ignores legacy providers field", () => {
    const parsed = catalogSchema.parse({
      providers: ["claude", "codex"],
      servers: {
        searxng: { type: "stdio", command: "npx", args: ["-y", "mcp-searxng"] },
      },
    });
    expect(parsed.excludeProviders).toEqual(["pi"]);
    expect("providers" in parsed).toBe(false);
    expect(parsed.servers.searxng?.disabled).toEqual([]);
    expect(parsed.servers.searxng?.enabled).toBe(true);
  });

  it("preserves an explicit empty excludeProviders array", () => {
    const parsed = catalogSchema.parse({
      excludeProviders: [],
      servers: {},
    });
    expect(parsed.excludeProviders).toEqual([]);
  });

  it("strips credentials, query params, and fragments from display URLs", () => {
    expect(
      sanitizeUrlForDisplay(
        "https://user:secretpass@mcp.example.com:8443/sse?token=topsecret#frag",
      ),
    ).toBe("https://mcp.example.com:8443/sse");
  });
});

describe("readCatalogState & saveCatalogAtomic", () => {
  it("returns empty default catalog when file does not exist", async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, "servers.json");

    const state = await readCatalogState(filePath);
    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;
    expect(state.exists).toBe(false);
    expect(state.revision).toBe("missing");
    expect(state.legacyProvidersFound).toBe(false);
    expect(state.catalog).toEqual({ excludeProviders: ["pi"], servers: {} });
  });

  it("detects legacy providers field and invalid JSON files", async () => {
    const dir = await makeTempDir();
    const legacyPath = join(dir, "legacy.json");
    await writeFile(
      legacyPath,
      JSON.stringify({
        providers: ["claude"],
        servers: {
          coolify: { type: "stdio", command: "npx" },
        },
      }),
    );

    const legacyState = await readCatalogState(legacyPath);
    expect(legacyState.status).toBe("ready");
    if (legacyState.status !== "ready") return;
    expect(legacyState.legacyProvidersFound).toBe(true);
    expect(legacyState.catalog.excludeProviders).toEqual(["pi"]);

    const invalidPath = join(dir, "broken.json");
    await writeFile(invalidPath, "{ not valid json");
    const brokenState = await readCatalogState(invalidPath);
    expect(brokenState.status).toBe("invalid");
    if (brokenState.status !== "invalid") return;
    expect(brokenState.rawText).toBe("{ not valid json");
  });

  it("writes 0600 permissions, detects conflicts, and rejects reserved 'paseo'", async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, "nested", "servers.json");

    const initial = await readCatalogState(filePath);
    expect(initial.status).toBe("ready");
    if (initial.status !== "ready") return;

    const reserved = await saveCatalogAtomic(
      {
        excludeProviders: ["pi"],
        servers: {
          paseo: { type: "stdio", command: "echo", enabled: true, disabled: [] },
        },
      },
      initial.revision,
      filePath,
    );
    expect(reserved.status).toBe("invalid");

    const saved = await saveCatalogAtomic(
      {
        excludeProviders: ["pi", "custom", "pi"],
        servers: {
          coolify: {
            type: "stdio",
            command: "npx",
            args: ["-y", "coolify-mcp"],
            env: { TOKEN: "abc" },
            enabled: true,
            disabled: [],
          },
        },
      },
      initial.revision,
      filePath,
    );
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") return;
    expect(saved.catalog.excludeProviders).toEqual(["pi", "custom"]);

    const fileStat = await stat(filePath);
    expect(fileStat.mode & 0o777).toBe(0o600);

    const conflict = await saveCatalogAtomic(
      { excludeProviders: [], servers: {} },
      "stale-revision",
      filePath,
    );
    expect(conflict.status).toBe("conflict");

    const rawSave = await saveRawCatalogAtomic(
      JSON.stringify({
        excludeProviders: ["pi"],
        servers: {
          api: { type: "http", url: "https://example.com/mcp" },
        },
      }),
      saved.revision,
      filePath,
    );
    expect(rawSave.status).toBe("saved");
  });
});

describe("evaluateCatalog", () => {
  it("injects matching servers for agy/claude/codex and skips excluded providers", async () => {
    const dir = await makeTempDir();
    const catalog = catalogSchema.parse({
      excludeProviders: ["pi"],
      servers: {
        coolify: {
          type: "stdio",
          command: "npx",
          args: ["-y", "coolify-mcp"],
          env: { COOLIFY_TOKEN: "secret-123" },
        },
        off: {
          enabled: false,
          type: "stdio",
          command: "echo",
        },
        scoped: {
          enabled: [dir],
          disabled: [join(dir, "private")],
          type: "http",
          url: "https://mcp.example.com/v1?apiKey=should-hide",
          headers: { Authorization: "Bearer secret-456" },
        },
      },
    });

    const agyResult = await evaluateCatalog(catalog, {
      provider: "agy/gemini-3-pro",
      cwd: dir,
      existingServerNames: new Set(["coolify"]),
    });
    expect(agyResult.provider).toBe("agy");
    expect(agyResult.providerExcluded).toBe(false);
    expect(Object.keys(agyResult.servers)).toEqual(["scoped"]);
    expect(agyResult.injected).toEqual([
      {
        name: "scoped",
        type: "http",
        summary: "https://mcp.example.com/v1",
        envKeys: [],
        headerKeys: ["Authorization"],
        matchedBy: "directory",
      },
    ]);
    expect(agyResult.skipped).toEqual([
      { name: "coolify", type: "stdio", reason: "overridden" },
      { name: "off", type: "stdio", reason: "disabled_globally" },
    ]);

    const excludedSubdir = await evaluateCatalog(catalog, {
      provider: "claude",
      cwd: join(dir, "private"),
    });
    expect(Object.keys(excludedSubdir.servers)).toEqual(["coolify"]);
    expect(excludedSubdir.skipped).toContainEqual({
      name: "scoped",
      type: "http",
      reason: "dir_excluded",
    });

    const piResult = await evaluateCatalog(catalog, {
      provider: "pi",
      cwd: dir,
    });
    expect(piResult.providerExcluded).toBe(true);
    expect(Object.keys(piResult.servers)).toEqual([]);
    expect(piResult.skipped.every((item) => item.reason === "provider_excluded")).toBe(
      true,
    );
  });

  it("matches git worktree directories against the main repository path", async () => {
    const root = await makeTempDir();
    const repoDir = join(root, "my-repo");
    const worktreeDir = join(root, "worktree-branch");
    await mkdir(repoDir, { recursive: true });

    await execFileAsync("git", ["init"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], {
      cwd: repoDir,
    });
    await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoDir });
    await writeFile(join(repoDir, "README.md"), "hello\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: repoDir });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoDir });
    await execFileAsync("git", ["worktree", "add", worktreeDir, "-b", "feat"], {
      cwd: repoDir,
    });

    const catalog = catalogSchema.parse({
      servers: {
        repoOnly: {
          enabled: [repoDir],
          type: "stdio",
          command: "node",
          args: ["server.js"],
        },
      },
    });

    const res = await evaluateCatalog(catalog, {
      provider: "codex",
      cwd: worktreeDir,
    });
    expect(Object.keys(res.servers)).toEqual(["repoOnly"]);
    expect(res.injected[0]?.matchedBy).toBe("directory");
  });
});
