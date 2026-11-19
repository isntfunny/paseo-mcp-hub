import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import {
  CatalogLoadingOrError,
  HubButton,
  InvalidCatalogRecovery,
  RawJsonModal,
} from "./components";
import { useHubTranslation } from "./i18n";
import {
  useCatalogQuery,
  useProvidersQuery,
  useSaveCatalogMutation,
} from "./queries";

export function ProvidersSettings({ theme }: PluginSurfaceProps) {
  const { t } = useHubTranslation();
  const toast = useToast();
  const catalogQuery = useCatalogQuery();
  const providersQuery = useProvidersQuery();
  const saveCatalog = useSaveCatalogMutation();

  const [customProvider, setCustomProvider] = useState("");
  const [rawModalOpen, setRawModalOpen] = useState(false);

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
  const excluded = catalog.excludeProviders;

  const updateExcluded = async (nextExcluded: string[]) => {
    try {
      const result = await saveCatalog.mutateAsync({
        revision,
        catalog: {
          ...catalog,
          excludeProviders: nextExcluded,
        },
      });
      if (result.status === "saved") {
        toast.show(t("settings.savedToast"), { variant: "success" });
        return;
      }
      if (result.status === "conflict") {
        toast.error(t("settings.conflictToast"));
        return;
      }
      toast.error(result.error);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.saveErrorFallback"));
    }
  };

  const toggleProvider = (id: string, exclude: boolean) => {
    const next = exclude
      ? [...new Set([...excluded, id])]
      : excluded.filter((item) => item !== id);
    void updateExcluded(next);
  };

  const handleAddCustom = () => {
    const trimmed = customProvider.trim();
    if (!trimmed) return;
    setCustomProvider("");
    if (excluded.includes(trimmed)) return;
    void updateExcluded([...excluded, trimmed]);
  };

  const liveProviders = providersQuery.data?.providers ?? [];
  const liveIds = new Set(liveProviders.map((provider) => provider.id));
  const extraExcluded = excluded.filter((id) => !liveIds.has(id));

  const formatStatus = (status: string): string => {
    if (status === "ready") return t("providers.statusReady");
    if (status === "unavailable") return t("providers.statusUnavailable");
    if (status === "loading") return t("providers.statusLoading");
    if (status === "error") return t("providers.statusError");
    return status;
  };

  return (
    <View style={{ gap: 20 }}>
      <SettingsSection
        title={t("providers.sectionTitle")}
        info={
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 17 }}>
            {t("providers.sectionInfo")}
          </Text>
        }
      >
        <SettingsCard>
          {providersQuery.isLoading ? (
            <SettingsRow label={t("providers.loadingProviders")} />
          ) : providersQuery.error ? (
            <SettingsAction
              label={t("providers.loadError", {
                error:
                  providersQuery.error instanceof Error
                    ? providersQuery.error.message
                    : String(providersQuery.error),
              })}
              actionLabel={t("settings.retry")}
              onPress={() => void providersQuery.refetch()}
            />
          ) : (
            liveProviders.map((provider) => (
              <SettingsSwitch
                key={provider.id}
                label={provider.label}
                hint={t("providers.statusHint", {
                  id: provider.id,
                  status: formatStatus(provider.status),
                })}
                value={excluded.includes(provider.id)}
                disabled={saveCatalog.isPending}
                onValueChange={(nextValue) => toggleProvider(provider.id, nextValue)}
              />
            ))
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("providers.customExcludedTitle")}>
        <SettingsCard>
          {extraExcluded.map((id) => (
            <SettingsAction
              key={id}
              label={id}
              hint={t("providers.customExcludedHint")}
              actionLabel={t("settings.remove")}
              disabled={saveCatalog.isPending}
              onPress={() => toggleProvider(id, false)}
            />
          ))}
          <View style={{ padding: 12, gap: 8 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "500" }}>
              {t("providers.addCustomLabel")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                value={customProvider}
                onChangeText={setCustomProvider}
                placeholder={t("providers.addCustomPlaceholder")}
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface0,
                  color: theme.colors.foreground,
                  fontSize: 13,
                }}
              />
              <HubButton
                label={t("settings.add")}
                onPress={handleAddCustom}
                variant="secondary"
                disabled={saveCatalog.isPending || !customProvider.trim()}
                theme={theme}
              />
            </View>
          </View>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("providers.advancedTitle")}>
        <SettingsCard>
          <SettingsAction
            label={t("providers.rawJsonRowLabel")}
            hint={t("providers.rawJsonRowHint")}
            actionLabel={t("providers.openRawJson")}
            onPress={() => setRawModalOpen(true)}
          />
        </SettingsCard>
      </SettingsSection>

      <RawJsonModal
        open={rawModalOpen}
        onOpenChange={setRawModalOpen}
        initialJson={JSON.stringify(catalog, null, 2)}
        revision={revision}
        theme={theme}
      />
    </View>
  );
}
