import type { PluginServerContext } from "@getpaseo/plugin/server";
import { inspectAgentMcps } from "./server/agent-mcps";
import {
  evaluateCatalog,
  readCatalogState,
  saveCatalogAtomic,
  saveRawCatalogAtomic,
} from "./server/catalog";
import { listDaemonProviders } from "./server/providers";
import {
  agentMcpsRpc,
  catalogGetRpc,
  catalogSaveRawRpc,
  catalogSaveRpc,
  providersListRpc,
} from "./shared/rpc";
import type { HubAgentMetadata } from "./shared/schema";

export default function contribute(server: PluginServerContext) {
  const stopCreateHook = server.addHook("agent.create.before", async ({ request }) => {
    if (request.config.internal) return undefined;

    const state = await readCatalogState();
    if (state.status === "invalid") {
      // A broken catalog must never block agent creation.
      console.error(`mcp-hub: cannot load ${state.path}: ${state.error}`);
      return undefined;
    }

    if (!state.exists && Object.keys(state.catalog.servers).length === 0) {
      return undefined;
    }

    const existingNames = new Set(Object.keys(request.config.mcpServers ?? {}));
    const evaluation = await evaluateCatalog(state.catalog, {
      provider: request.config.provider,
      cwd: request.config.cwd,
      existingServerNames: existingNames,
    });

    const hubMetadata: HubAgentMetadata = {
      version: 1,
      evaluatedAt: new Date().toISOString(),
      provider: evaluation.provider,
      providerExcluded: evaluation.providerExcluded,
      injected: evaluation.injected,
      skipped: evaluation.skipped,
    };

    const injectedNames = Object.keys(evaluation.servers);
    if (injectedNames.length > 0) {
      console.log(
        `mcp-hub: ${evaluation.provider} agent in ${request.config.cwd} gets ${injectedNames.join(", ")}`,
      );
    } else if (evaluation.providerExcluded) {
      console.log(
        `mcp-hub: skipping ${evaluation.provider} agent in ${request.config.cwd} (provider excluded)`,
      );
    }

    return {
      ...request,
      config: {
        ...request.config,
        // Explicitly requested servers win over catalog entries with the same name.
        ...(injectedNames.length > 0
          ? { mcpServers: { ...evaluation.servers, ...request.config.mcpServers } }
          : {}),
      },
      metadata: {
        ...request.metadata,
        "mcp-hub": hubMetadata,
      },
    };
  });

  server.handle(catalogGetRpc, () => readCatalogState());
  server.handle(catalogSaveRpc, ({ revision, catalog }) =>
    saveCatalogAtomic(catalog, revision),
  );
  server.handle(catalogSaveRawRpc, ({ revision, rawJson }) =>
    saveRawCatalogAtomic(rawJson, revision),
  );
  server.handle(providersListRpc, (_, { paseo }) => listDaemonProviders(paseo));
  server.handle(agentMcpsRpc, ({ agentId }, { paseo }) =>
    inspectAgentMcps(paseo, agentId),
  );

  return () => {
    stopCreateHook();
  };
}
