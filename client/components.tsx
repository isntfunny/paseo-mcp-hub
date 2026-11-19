import type { PluginTheme } from "@getpaseo/plugin";
import {
  Icon,
  Modal,
  SettingsAction,
  SettingsCard,
  SettingsSection,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { CatalogReadResult } from "../shared/schema";
import { useHubTranslation } from "./i18n";
import { useSaveRawCatalogMutation } from "./queries";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export function HubBadge({
  label,
  tone = "neutral",
  theme,
}: {
  label: string;
  tone?: BadgeTone;
  theme: PluginTheme;
}) {
  const borderColor =
    tone === "accent"
      ? theme.colors.accent
      : tone === "success"
        ? theme.colors.statusSuccess
        : tone === "warning"
          ? theme.colors.statusWarning
          : tone === "danger"
            ? theme.colors.statusDanger
            : theme.colors.border;

  const textColor =
    tone === "accent"
      ? theme.colors.accent
      : tone === "success"
        ? theme.colors.statusSuccess
        : tone === "warning"
          ? theme.colors.statusWarning
          : tone === "danger"
            ? theme.colors.statusDanger
            : theme.colors.foregroundMuted;

  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
        borderWidth: 1,
        borderColor,
        backgroundColor: theme.colors.surface2,
      }}
    >
      <Text style={{ color: textColor, fontSize: 11, fontWeight: "500" }}>{label}</Text>
    </View>
  );
}

export function HubButton({
  label,
  onPress,
  variant = "secondary",
  disabled = false,
  icon,
  theme,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  icon?: string;
  theme: PluginTheme;
}) {
  const backgroundColor =
    variant === "primary"
      ? theme.colors.accent
      : variant === "danger"
        ? theme.colors.statusDanger
        : theme.colors.surface2;

  const textColor =
    variant === "primary" || variant === "danger"
      ? theme.colors.accentForeground
      : theme.colors.foreground;

  const borderColor =
    variant === "secondary" ? theme.colors.border : backgroundColor;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={textColor} /> : null}
      <Text style={{ color: textColor, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function CatalogLoadingOrError({
  isLoading,
  error,
  onRetry,
  theme,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  theme: PluginTheme;
}) {
  const { t } = useHubTranslation();

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
        <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
          {t("settings.loading")}
        </Text>
      </View>
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    <SettingsSection title={t("settings.catalogSectionTitle")}>
      <SettingsCard>
        <SettingsAction
          label={t("settings.loadError", { error: message })}
          actionLabel={t("settings.retry")}
          onPress={onRetry}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export function InvalidCatalogRecovery({
  state,
  onReload,
  theme,
}: {
  state: Extract<CatalogReadResult, { status: "invalid" }>;
  onReload: () => void;
  theme: PluginTheme;
}) {
  const { t } = useHubTranslation();
  const toast = useToast();
  const saveRaw = useSaveRawCatalogMutation();
  const [rawText, setRawText] = useState(state.rawText);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setRawText(state.rawText);
    setLocalError(null);
  }, [state.rawText, state.revision]);

  const handleSave = async () => {
    setLocalError(null);
    try {
      const result = await saveRaw.mutateAsync({
        revision: state.revision,
        rawJson: rawText,
      });
      if (result.status === "saved") {
        toast.show(t("settings.savedToast"), { variant: "success" });
        return;
      }
      if (result.status === "conflict") {
        setLocalError(t("settings.conflictToast"));
        toast.error(t("settings.conflictToast"));
        return;
      }
      setLocalError(result.error);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t("settings.saveErrorFallback"));
    }
  };

  return (
    <SettingsSection
      title={t("settings.invalidSectionTitle")}
      info={
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {t("settings.invalidSectionHint")}
        </Text>
      }
    >
      <SettingsCard>
        <View style={{ padding: 12, gap: 10 }}>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>
            {state.error}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {state.path}
          </Text>
          <TextInput
            value={rawText}
            onChangeText={setRawText}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              minHeight: 180,
              maxHeight: 320,
              padding: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface0,
              color: theme.colors.foreground,
              fontFamily: "monospace",
              fontSize: 12,
              textAlignVertical: "top",
            }}
          />
          {localError ? (
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
              {localError}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <HubButton
              label={t("settings.reload")}
              onPress={onReload}
              variant="secondary"
              theme={theme}
            />
            <HubButton
              label={saveRaw.isPending ? t("settings.saving") : t("settings.saveRawJson")}
              onPress={() => void handleSave()}
              variant="primary"
              disabled={saveRaw.isPending}
              theme={theme}
            />
          </View>
        </View>
      </SettingsCard>
    </SettingsSection>
  );
}

export function RawJsonModal({
  open,
  onOpenChange,
  initialJson,
  revision,
  theme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialJson: string;
  revision: string;
  theme: PluginTheme;
}) {
  const { t } = useHubTranslation();
  const toast = useToast();
  const saveRaw = useSaveRawCatalogMutation();
  const [rawText, setRawText] = useState(initialJson);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRawText(initialJson);
      setError(null);
    }
  }, [open, initialJson]);

  const handleSave = async () => {
    setError(null);
    try {
      JSON.parse(rawText);
    } catch {
      setError(t("providers.invalidJsonError"));
      return;
    }
    try {
      const result = await saveRaw.mutateAsync({ revision, rawJson: rawText });
      if (result.status === "saved") {
        toast.show(t("settings.savedToast"), { variant: "success" });
        onOpenChange(false);
        return;
      }
      if (result.status === "conflict") {
        setError(t("settings.conflictToast"));
        return;
      }
      setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.saveErrorFallback"));
    }
  };

  return (
    <Modal
      title={t("providers.rawJsonModalTitle")}
      icon={<Icon name="FileCode" size={16} color={theme.colors.foregroundMuted} />}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Content>
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.statusWarning, fontSize: 12, lineHeight: 17 }}>
            {t("providers.rawJsonWarning")}
          </Text>
          <TextInput
            value={rawText}
            onChangeText={setRawText}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              minHeight: 240,
              maxHeight: 360,
              padding: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface0,
              color: theme.colors.foreground,
              fontFamily: "monospace",
              fontSize: 12,
              textAlignVertical: "top",
            }}
          />
          {error ? (
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{error}</Text>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <HubButton
              label={t("settings.cancel")}
              onPress={() => onOpenChange(false)}
              variant="secondary"
              theme={theme}
            />
            <HubButton
              label={saveRaw.isPending ? t("settings.saving") : t("settings.save")}
              onPress={() => void handleSave()}
              variant="primary"
              disabled={saveRaw.isPending}
              theme={theme}
            />
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}
