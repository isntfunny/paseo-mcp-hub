import type {
  PluginButtonIconProps,
  PluginButtonRegistration,
  PluginClientContext,
  PluginText,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect } from "react";
import { followAgents } from "./agents";
import { label as i18nLabel, useHubTranslation } from "./i18n";
import { createMcpPopover } from "./popover";
import { useAgentMcpsQuery } from "./queries";

function createPillIcon(
  agentId: string,
  pill: { current?: PluginButtonRegistration<PluginText> },
) {
  return function McpPillIcon({ size, color }: PluginButtonIconProps) {
    const { t } = useHubTranslation();
    const query = useAgentMcpsQuery(agentId);
    const count = query.data?.active.length;
    const nextLabel =
      count !== undefined
        ? t("pill.labelWithCount", { count })
        : t("pill.title");

    useEffect(() => {
      pill.current?.update({ label: nextLabel });
    }, [pill, nextLabel]);

    return <Icon name="Plug" size={size} color={color} />;
  };
}

/** Register a per-agent composer pill showing active MCP count and an inspection popover. */
export function contributeMcpPills(
  client: PluginClientContext,
  openSettings: () => void,
): () => void {
  const pills = new Map<
    string,
    { workspaceId: string; registration: PluginButtonRegistration<PluginText> }
  >();
  let stopped = false;
  const Popover = createMcpPopover(openSettings);
  const baseTitle = i18nLabel("pill.title");

  function addPill(agentId: string, workspaceId: string): void {
    if (stopped) return;
    const current = pills.get(agentId);
    if (current?.workspaceId === workspaceId) return;
    if (current) removePill(agentId);

    const pillBox: { current?: PluginButtonRegistration<PluginText> } = {};
    pillBox.current = client.addComposerPill({
      id: "mcp-hub",
      workspaceId,
      agentId,
      button: {
        title: baseTitle,
        label: baseTitle,
        icon: createPillIcon(agentId, pillBox),
        behavior: { kind: "popover", Content: Popover },
      },
    });
    pills.set(agentId, { workspaceId, registration: pillBox.current });
  }

  function removePill(agentId: string): void {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
  }

  const unfollow = followAgents(client.paseo, {
    snapshot(list) {
      if (stopped) return;
      const nextAgents = new Map<string, string>();
      for (const { agent } of list.entries) {
        if (agent.workspaceId) {
          nextAgents.set(agent.id, agent.workspaceId);
        }
      }
      for (const agentId of [...pills.keys()]) {
        if (!nextAgents.has(agentId)) removePill(agentId);
      }
      nextAgents.forEach((workspaceId, agentId) => addPill(agentId, workspaceId));
    },
    update(update) {
      if (update.kind === "remove") {
        removePill(update.agentId);
        return;
      }
      const { id, workspaceId } = update.agent;
      if (workspaceId) addPill(id, workspaceId);
    },
  });

  return () => {
    stopped = true;
    unfollow();
    pills.forEach((pill) => pill.registration.remove());
    pills.clear();
  };
}
