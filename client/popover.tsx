import type { PluginButtonContentProps, PluginHostProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { SkipReason } from "../shared/schema";
import { HubBadge } from "./components";
import { useHubTranslation } from "./i18n";
import { useAgentMcpsQuery } from "./queries";

export function createMcpPopover(openSettings: () => void) {
  return function McpPopover(props: PluginButtonContentProps) {
    if (props.context !== "agent") return null;
    return (
      <McpPopoverBody
        theme={props.theme}
        compact={props.layout.compact}
        agentId={props.agentId}
        close={props.close}
        openSettings={openSettings}
      />
    );
  };
}

function McpPopoverBody({
  theme,
  compact,
  agentId,
  close,
  openSettings,
}: {
  theme: PluginHostProps["theme"];
  compact: boolean;
  agentId: string;
  close: () => void;
  openSettings: () => void;
}) {
  const { t } = useHubTranslation();
  const query = useAgentMcpsQuery(agentId);
  const [skippedExpanded, setSkippedExpanded] = useState(false);

  const reasonLabel = (reason: SkipReason): string => {
    switch (reason) {
      case "provider_excluded":
        return t("popover.reasons.provider_excluded");
      case "disabled_globally":
        return t("popover.reasons.disabled_globally");
      case "dir_not_matched":
        return t("popover.reasons.dir_not_matched");
      case "dir_excluded":
        return t("popover.reasons.dir_excluded");
      case "overridden":
        return t("popover.reasons.overridden");
    }
  };

  const handleOpenSettings = () => {
    close();
    openSettings();
  };

  const data = query.data;
  const driftChanges = data
    ? [
        ...data.drift.added.map((name) => `+${name}`),
        ...data.drift.removed.map((name) => `-${name}`),
      ]
    : [];

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {compact ? null : (
          <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
            {t("popover.title")}
          </Text>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginLeft: "auto",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("popover.refreshA11y")}
            hitSlop={8}
            onPress={() => void query.refetch()}
            style={({ pressed }) => ({
              padding: 5,
              borderRadius: 6,
              backgroundColor: theme.colors.surface2,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="RotateCw" size={13} color={theme.colors.foregroundMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("popover.settings")}
            hitSlop={8}
            onPress={handleOpenSettings}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 6,
              backgroundColor: theme.colors.surface2,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="Settings" size={13} color={theme.colors.accent} />
            <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "500" }}>
              {t("popover.settings")}
            </Text>
          </Pressable>
        </View>
      </View>

      {query.isLoading ? (
        <View style={{ paddingVertical: 20, alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {t("popover.loading")}
          </Text>
        </View>
      ) : query.error || !data ? (
        <View
          style={{
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.statusDanger,
            backgroundColor: theme.colors.surface1,
          }}
        >
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
            {t("popover.loadError", {
              error:
                query.error instanceof Error
                  ? query.error.message
                  : String(query.error ?? "unknown"),
            })}
          </Text>
        </View>
      ) : (
        <>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 11,
              fontFamily: "monospace",
            }}
          >
            {data.provider} · {data.cwd}
          </Text>

          {data.providerExcluded ? (
            <View
              style={{
                padding: 9,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.statusWarning,
                backgroundColor: theme.colors.surface1,
              }}
            >
              <Text style={{ color: theme.colors.statusWarning, fontSize: 12, lineHeight: 16 }}>
                {t("popover.providerExcludedBanner", { provider: data.provider })}
              </Text>
            </View>
          ) : null}

          {data.catalogError ? (
            <View
              style={{
                padding: 9,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.statusDanger,
                backgroundColor: theme.colors.surface1,
              }}
            >
              <Text style={{ color: theme.colors.statusDanger, fontSize: 12, lineHeight: 16 }}>
                {t("popover.catalogErrorBanner", { error: data.catalogError })}
              </Text>
            </View>
          ) : null}

          {driftChanges.length > 0 ? (
            <View
              style={{
                padding: 9,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface1,
              }}
            >
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 16 }}>
                {t("popover.driftBanner", { changes: driftChanges.join(", ") })}
              </Text>
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
              {data.active.length === 0 ? (
                <View
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface1,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500" }}>
                    {t("popover.emptyTitle")}
                  </Text>
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 17 }}>
                    {t("popover.emptyHint")}
                  </Text>
                </View>
              ) : (
                data.active.map((server) => (
                  <View
                    key={server.name}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface1,
                      gap: 4,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.foreground,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {server.name}
                      </Text>
                      <HubBadge label={server.type} tone="neutral" theme={theme} />
                      <HubBadge
                        label={
                          server.source === "mcp-hub"
                            ? t("popover.sourceHub")
                            : t("popover.sourceOther")
                        }
                        tone={server.source === "mcp-hub" ? "accent" : "neutral"}
                        theme={theme}
                      />
                      {server.matchedBy ? (
                        <HubBadge
                          label={
                            server.matchedBy === "global"
                              ? t("popover.matchedGlobal")
                              : t("popover.matchedDir")
                          }
                          tone="success"
                          theme={theme}
                        />
                      ) : null}
                    </View>
                    {server.summary ? (
                      <Text
                        numberOfLines={2}
                        style={{
                          color: theme.colors.foregroundMuted,
                          fontSize: 11,
                          fontFamily: "monospace",
                        }}
                      >
                        {server.summary}
                      </Text>
                    ) : null}
                    {server.envKeys.length > 0 ? (
                      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                        {t("popover.envKeys", { keys: server.envKeys.join(", ") })}
                      </Text>
                    ) : null}
                    {server.headerKeys.length > 0 ? (
                      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                        {t("popover.headerKeys", { keys: server.headerKeys.join(", ") })}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}

              {data.skipped.length > 0 ? (
                <View style={{ paddingTop: 4, gap: 6 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSkippedExpanded((prev) => !prev)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingVertical: 4,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Icon
                      name={skippedExpanded ? "ChevronDown" : "ChevronRight"}
                      size={14}
                      color={theme.colors.foregroundMuted}
                    />
                    <Text
                      style={{
                        color: theme.colors.foregroundMuted,
                        fontSize: 12,
                        fontWeight: "500",
                      }}
                    >
                      {t("popover.skippedToggle", { count: data.skipped.length })}
                    </Text>
                  </Pressable>

                  {skippedExpanded ? (
                    <View style={{ gap: 4 }}>
                      {data.skipped.map((entry) => (
                        <View
                          key={entry.name}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 7,
                            backgroundColor: theme.colors.surface2,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.colors.foreground,
                              fontSize: 12,
                              fontWeight: "500",
                            }}
                          >
                            {entry.name}
                          </Text>
                          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                            {reasonLabel(entry.reason)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
        </>
      )}
    </View>
  );
}
