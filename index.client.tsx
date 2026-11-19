import type { PluginClientContext } from "@getpaseo/plugin/client";
import { label } from "./client/i18n";
import { contributeMcpPills } from "./client/pill";
import { ProvidersSettings } from "./client/providers-settings";
import { ServersSettings } from "./client/servers-settings";

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addSettingsScreen({
      id: "servers",
      title: label("settings.tabs.servers"),
      icon: "Server",
      Component: ServersSettings,
    }),
    client.addSettingsScreen({
      id: "providers",
      title: label("settings.tabs.providers"),
      icon: "Cpu",
      Component: ProvidersSettings,
    }),
    client.addCommandCenterItem({
      id: "open-settings",
      title: label("commands.openSettings"),
      icon: "Plug",
      keywords: ["mcp", "servers", "catalog", "hub", "settings", "providers"],
      context: "global",
      onSelect: ({ openSettings }) => {
        openSettings("servers");
      },
    }),
    contributeMcpPills(client, () => client.openSettings("servers")),
  ];

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
