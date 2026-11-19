import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  Icon,
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { summarizeServer, type Catalog, type ServerConfig } from "../shared/schema";
import {
  CatalogLoadingOrError,
  HubBadge,
  HubButton,
  InvalidCatalogRecovery,
} from "./components";
import { useHubTranslation } from "./i18n";
import { useCatalogQuery, useSaveCatalogMutation } from "./queries";
import { ServerEditorModal } from "./server-editor-modal";

export function ServersSettings({ theme, layout }: PluginSurfaceProps) {
  const { t } = useHubTranslation();
  const toast = useToast();
  const catalogQuery = useCatalogQuery();
  const saveCatalog = useSaveCatalogMutation();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);

  if (catalogQuery.isLoading || catalogQuery.error || !catalogQuery.data) {
    return (
      <CatalogLoadingOrError
        isLoading={catalogQuery.isLoading}
        error={catalogQuery.error ?? new Error("Missing catalog state")}
        onRetry={() => void catalogQuery.refetch()}
        theme={theme}
      />
    );
  }

  const state = catalogQuery.data;
  if (state.status === "invalid") {
    return (
      <InvalidCatalogRecovery
        state={state}
        onReload={() => void catalogQuery.refetch()}
        theme={theme}
      />
    );
  }

  const { catalog, revision } = state;
  const serverNames = Object.keys(catalog.servers).sort((a, b) => a.localeCompare(b));
  const activeCount = serverNames.filter((name) => {
    const enabled = catalog.servers[name]!.enabled;
    return enabled === true || (Array.isArray(enabled) && enabled.length > 0);
  }).length;

  const persistCatalog = async (nextCatalog: Catalog): Promise<boolean> => {
    try {
      const result = await saveCatalog.mutateAsync({ revision, catalog: nextCatalog });
      if (result.status === "saved") {
        toast.show(t("settings.savedToast"), { variant: "success" });
        return true;
      }
      if (result.status === "conflict") {
        toast.error(t("settings.conflictToast"));
        return false;
      }
      toast.error(result.error);
      return false;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.saveErrorFallback"));
      return false;
    }
  };

  const handleToggleServer = (name: string, nextValue: boolean) => {
    const current = catalog.servers[name];
    if (!current || typeof current.enabled !== "boolean") return;
    const nextServers = {
      ...catalog.servers,
      [name]: { ...current, enabled: nextValue },
    };
    void persistCatalog({ ...catalog, servers: nextServers });
  };

  const handleSaveServer = async (
    name: string,
    server: ServerConfig,
    previousName: string | null,
  ): Promise<boolean> => {
    const nextServers = { ...catalog.servers };
    if (previousName && previousName !== name) {
      delete nextServers[previousName];
    }
    nextServers[name] = server;
    return persistCatalog({ ...catalog, servers: nextServers });
  };

  const handleDeleteServer = async (name: string): Promise<boolean> => {
    const nextServers = { ...catalog.servers };
    delete nextServers[name];
    return persistCatalog({ ...catalog, servers: nextServers });
  };

  const openAddModal = () => {
    setEditingName(null);
    setEditorOpen(true);
  };

  const openEditModal = (name: string) => {
    setEditingName(name);
    setEditorOpen(true);
  };

  const initialServer = editingName ? (catalog.servers[editingName] ?? null) : null;

  return (
    <View style={{ gap: 20 }}>
      {state.legacyProvidersFound ? (
        <View
          style={{
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.colors.statusWarning,
            backgroundColor: theme.colors.surface1,
          }}
        >
          <Text style={{ color: theme.colors.statusWarning, fontSize: 12, lineHeight: 17 }}>
            {t("settings.legacyMigrationNotice")}
          </Text>
        </View>
      ) : null}

      <SettingsSection
        title={t("settings.catalogSectionTitle")}
        info={
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 17 }}>
            {t("settings.catalogSectionInfo")}
          </Text>
        }
        trailing={
          <HubButton
            label={t("settings.addServer")}
            onPress={openAddModal}
            variant="primary"
            icon="Plus"
            theme={theme}
          />
        }
      >
        <SettingsCard>
          <SettingsRow
            label={t("settings.catalogPathLabel")}
            hint={state.exists ? state.path : `${state.path} (${t("settings.catalogNotCreatedHint")})`}
          />
          <SettingsRow
            label={t("settings.summaryLabel")}
            hint={t("settings.summaryValue", {
              active: activeCount,
              total: serverNames.length,
            })}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.tabs.servers")}>
        {serverNames.length === 0 ? (
          <SettingsCard>
            <SettingsAction
              label={t("settings.emptyTitle")}
              hint={t("settings.emptyHint")}
              actionLabel={t("settings.addServer")}
              onPress={openAddModal}
            />
          </SettingsCard>
        ) : (
          <SettingsCard>
            {serverNames.map((name) => {
              const server = catalog.servers[name]!;
              const summary = summarizeServer(server);
              const isBooleanScope = typeof server.enabled === "boolean";
              const scopeBadge =
                server.enabled === true
                  ? { label: t("settings.badgeGlobal"), tone: "success" as const }
                  : server.enabled === false
                    ? { label: t("settings.badgeDisabled"), tone: "neutral" as const }
                    : {
                        label: t("settings.badgeDirs", { count: server.enabled.length }),
                        tone: "accent" as const,
                      };

              return (
                <View
                  key={name}
                  style={{
                    flexDirection: layout.compact ? "column" : "row",
                    alignItems: layout.compact ? "stretch" : "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    gap: 10,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("settings.editServerA11y", { name })}
                    onPress={() => openEditModal(name)}
                    style={{ flex: 1, gap: 4 }}
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
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        {name}
                      </Text>
                      <HubBadge label={server.type} tone="neutral" theme={theme} />
                      <HubBadge
                        label={scopeBadge.label}
                        tone={scopeBadge.tone}
                        theme={theme}
                      />
                      {server.disabled.length > 0 ? (
                        <HubBadge
                          label={t("settings.badgeExcluded", { count: server.disabled.length })}
                          tone="warning"
                          theme={theme}
                        />
                      ) : null}
                    </View>
                    {summary ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.foregroundMuted,
                          fontSize: 12,
                          fontFamily: "monospace",
                        }}
                      >
                        {summary}
                      </Text>
                    ) : null}
                  </Pressable>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 10,
                    }}
                  >
                    {isBooleanScope ? (
                      <Switch
                        accessibilityLabel={t("settings.toggleServerA11y", { name })}
                        value={server.enabled === true}
                        disabled={saveCatalog.isPending}
                        onValueChange={(nextValue) => handleToggleServer(name, nextValue)}
                      />
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("settings.editServerA11y", { name })}
                      onPress={() => openEditModal(name)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 7,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface2,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Icon name="Pencil" size={12} color={theme.colors.foreground} />
                      <Text
                        style={{
                          color: theme.colors.foreground,
                          fontSize: 12,
                          fontWeight: "500",
                        }}
                      >
                        {t("settings.edit")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </SettingsCard>
        )}
      </SettingsSection>

      <ServerEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editingName={editingName}
        initialServer={initialServer}
        existingNames={serverNames}
        saving={saveCatalog.isPending}
        compact={layout.compact}
        theme={theme}
        onSave={handleSaveServer}
        onDelete={handleDeleteServer}
      />
    </View>
  );
}
