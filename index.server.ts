import type { PluginServerContext } from "@getpaseo/plugin/server";
import { catalogPath, enabledServers, loadCatalog } from "./server/catalog";

export default function contribute(server: PluginServerContext) {
  server.before("agent.create", async ({ request }) => {
    const provider = request.config.provider.split("/")[0];

    let catalog;
    try {
      catalog = await loadCatalog();
    } catch (error) {
      // A broken catalog must not block agent creation.
      console.error(`mcp-hub: cannot load ${catalogPath}:`, error);
      return undefined;
    }
    if (!catalog.providers.includes(provider)) {
      return undefined;
    }

    const servers = await enabledServers(catalog, request.config.cwd);
    console.log(`mcp-hub: ${provider} agent in ${request.config.cwd} gets ${Object.keys(servers).join(", ") || "no servers"}`);
    return {
      ...request,
      config: {
        ...request.config,
        // Explicitly requested servers win over catalog entries with the same name.
        mcpServers: { ...servers, ...request.config.mcpServers },
      },
    };
  });

  return () => {};
}
