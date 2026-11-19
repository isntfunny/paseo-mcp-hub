import { z } from "zod";

export const DEFAULT_EXCLUDED_PROVIDERS = ["pi"] as const;

export const enabledSchema = z.union([z.boolean(), z.array(z.string())]).default(true);
export const disabledSchema = z.array(z.string()).default([]);

export const stdioServerSchema = z.object({
  enabled: enabledSchema,
  disabled: disabledSchema,
  type: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const remoteServerSchema = z.object({
  enabled: enabledSchema,
  disabled: disabledSchema,
  type: z.enum(["http", "sse"]),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
});

export const serverConfigSchema = z.discriminatedUnion("type", [
  stdioServerSchema,
  remoteServerSchema,
]);

export const catalogSchema = z.object({
  excludeProviders: z.array(z.string()).default([...DEFAULT_EXCLUDED_PROVIDERS]),
  servers: z.record(z.string(), serverConfigSchema).default({}),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type StdioServerConfig = z.infer<typeof stdioServerSchema>;
export type RemoteServerConfig = z.infer<typeof remoteServerSchema>;
export type Catalog = z.infer<typeof catalogSchema>;

export const skipReasonSchema = z.enum([
  "provider_excluded",
  "disabled_globally",
  "dir_not_matched",
  "dir_excluded",
  "overridden",
]);
export type SkipReason = z.infer<typeof skipReasonSchema>;

export const matchRuleSchema = z.enum(["global", "directory"]);
export type MatchRule = z.infer<typeof matchRuleSchema>;

export const mcpSourceSchema = z.enum(["mcp-hub", "other"]);
export type McpSource = z.infer<typeof mcpSourceSchema>;

export const transportTypeSchema = z.enum(["stdio", "http", "sse"]);
export type TransportType = z.infer<typeof transportTypeSchema>;

export const injectedMcpMetaSchema = z.object({
  name: z.string(),
  type: transportTypeSchema,
  summary: z.string(),
  envKeys: z.array(z.string()),
  headerKeys: z.array(z.string()),
  matchedBy: matchRuleSchema,
});
export type InjectedMcpMeta = z.infer<typeof injectedMcpMetaSchema>;

export const agentActiveMcpSchema = z.object({
  name: z.string(),
  type: transportTypeSchema,
  summary: z.string(),
  envKeys: z.array(z.string()),
  headerKeys: z.array(z.string()),
  source: mcpSourceSchema,
  matchedBy: matchRuleSchema.optional(),
});
export type AgentActiveMcp = z.infer<typeof agentActiveMcpSchema>;

export const agentSkippedMcpSchema = z.object({
  name: z.string(),
  type: transportTypeSchema,
  reason: skipReasonSchema,
});
export type AgentSkippedMcp = z.infer<typeof agentSkippedMcpSchema>;

export const hubAgentMetadataSchema = z.object({
  version: z.literal(1),
  evaluatedAt: z.string(),
  provider: z.string(),
  providerExcluded: z.boolean(),
  injected: z.array(injectedMcpMetaSchema),
  skipped: z.array(agentSkippedMcpSchema),
});
export type HubAgentMetadata = z.infer<typeof hubAgentMetadataSchema>;

export const catalogReadResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    path: z.string(),
    exists: z.boolean(),
    revision: z.string(),
    legacyProvidersFound: z.boolean(),
    catalog: catalogSchema,
  }),
  z.object({
    status: z.literal("invalid"),
    path: z.string(),
    revision: z.string(),
    error: z.string(),
    rawText: z.string(),
  }),
]);
export type CatalogReadResult = z.infer<typeof catalogReadResultSchema>;

export const catalogSaveResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("saved"),
    revision: z.string(),
    catalog: catalogSchema,
  }),
  z.object({
    status: z.literal("conflict"),
    error: z.string(),
  }),
  z.object({
    status: z.literal("invalid"),
    error: z.string(),
  }),
]);
export type CatalogSaveResult = z.infer<typeof catalogSaveResultSchema>;

export const providerInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.string(),
  enabled: z.boolean(),
});
export type ProviderInfo = z.infer<typeof providerInfoSchema>;

export const agentMcpsResultSchema = z.object({
  agentId: z.string(),
  provider: z.string(),
  cwd: z.string(),
  providerExcluded: z.boolean(),
  catalogError: z.string().optional(),
  active: z.array(agentActiveMcpSchema),
  skipped: z.array(agentSkippedMcpSchema),
  drift: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
  }),
  recordedAt: z.string().optional(),
});
export type AgentMcpsResult = z.infer<typeof agentMcpsResultSchema>;

/** Strip credentials, query strings, and fragments so secrets in URLs never surface in UI or metadata. */
export function sanitizeUrlForDisplay(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed
      .replace(/\/\/[^/@\s]+@/, "//")
      .replace(/[?#].*$/, "");
  }
}

/** Build a non-secret display summary for a stdio or remote MCP server config. */
export function summarizeServer(server: {
  type: TransportType;
  command?: string;
  args?: readonly string[];
  url?: string;
}): string {
  if (server.type === "stdio") {
    return [server.command ?? "", ...(server.args ?? [])]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
  }
  return sanitizeUrlForDisplay(server.url ?? "");
}
