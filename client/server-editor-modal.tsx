import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ServerConfig, TransportType } from "../shared/schema";
import { HubButton } from "./components";
import { useHubTranslation } from "./i18n";
import {
  KeyValueEditor,
  kvEntriesToMap,
  mapToKvEntries,
  type KeyValueEntry,
} from "./key-value-editor";

type ScopeMode = "all" | "dirs" | "off";

function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function SegmentedOption<T extends string>({
  options,
  value,
  onChange,
  theme,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  theme: PluginTheme;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 7,
              borderWidth: 1,
              borderColor: active ? theme.colors.accent : theme.colors.border,
              backgroundColor: active ? theme.colors.accent : theme.colors.surface2,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                color: active ? theme.colors.accentForeground : theme.colors.foreground,
                fontSize: 12,
                fontWeight: active ? "600" : "500",
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ServerEditorModal({
  open,
  onOpenChange,
  editingName,
  initialServer,
  existingNames,
  saving,
  compact,
  theme,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingName: string | null;
  initialServer: ServerConfig | null;
  existingNames: readonly string[];
  saving: boolean;
  compact: boolean;
  theme: PluginTheme;
  onSave: (name: string, server: ServerConfig, previousName: string | null) => Promise<boolean>;
  onDelete: (name: string) => Promise<boolean>;
}) {
  const { t } = useHubTranslation();

  const [name, setName] = useState("");
  const [transport, setTransport] = useState<TransportType>("stdio");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [url, setUrl] = useState("");
  const [kvEntries, setKvEntries] = useState<KeyValueEntry[]>([]);
  const [scope, setScope] = useState<ScopeMode>("all");
  const [enabledDirsText, setEnabledDirsText] = useState("");
  const [disabledDirsText, setDisabledDirsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDeleteArmed(false);

    if (!initialServer || !editingName) {
      setName("");
      setTransport("stdio");
      setCommand("");
      setArgsText("");
      setUrl("");
      setKvEntries([]);
      setScope("all");
      setEnabledDirsText("");
      setDisabledDirsText("");
      return;
    }

    setName(editingName);
    setTransport(initialServer.type);
    if (initialServer.type === "stdio") {
      setCommand(initialServer.command);
      setArgsText((initialServer.args ?? []).join("\n"));
      setUrl("");
      setKvEntries(mapToKvEntries(initialServer.env));
    } else {
      setCommand("");
      setArgsText("");
      setUrl(initialServer.url);
      setKvEntries(mapToKvEntries(initialServer.headers));
    }

    if (initialServer.enabled === true) {
      setScope("all");
      setEnabledDirsText("");
    } else if (initialServer.enabled === false) {
      setScope("off");
      setEnabledDirsText("");
    } else {
      setScope("dirs");
      setEnabledDirsText(initialServer.enabled.join("\n"));
    }
    setDisabledDirsText(initialServer.disabled.join("\n"));
  }, [open, editingName, initialServer]);

  const validateKv = (): string | null => {
    const seen = new Set<string>();
    for (const entry of kvEntries) {
      const k = entry.key.trim();
      if (!k && entry.value.length > 0) {
        return t("editor.validation.kvEmptyKey");
      }
      if (!k) continue;
      if (seen.has(k)) {
        return t("editor.validation.kvDuplicateKey", { key: k });
      }
      seen.add(k);
    }
    return null;
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("editor.validation.nameRequired"));
      return;
    }
    if (trimmedName === "paseo") {
      setError(t("editor.validation.nameReserved"));
      return;
    }
    if (trimmedName !== editingName && existingNames.includes(trimmedName)) {
      setError(t("editor.validation.nameDuplicate", { name: trimmedName }));
      return;
    }

    const enabledDirs = parseLines(enabledDirsText);
    if (scope === "dirs" && enabledDirs.length === 0) {
      setError(t("editor.validation.dirsRequired"));
      return;
    }

    const kvError = validateKv();
    if (kvError) {
      setError(kvError);
      return;
    }

    const enabled: boolean | string[] =
      scope === "all" ? true : scope === "off" ? false : enabledDirs;
    const disabled = parseLines(disabledDirsText);
    const kvMap = kvEntriesToMap(kvEntries);

    let nextServer: ServerConfig;
    if (transport === "stdio") {
      const trimmedCommand = command.trim();
      if (!trimmedCommand) {
        setError(t("editor.validation.commandRequired"));
        return;
      }
      const args = parseLines(argsText);
      nextServer = {
        type: "stdio",
        command: trimmedCommand,
        ...(args.length > 0 ? { args } : {}),
        ...(kvMap ? { env: kvMap } : {}),
        enabled,
        disabled,
      };
    } else {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        setError(t("editor.validation.urlRequired"));
        return;
      }
      if (!/^https?:\/\//i.test(trimmedUrl)) {
        setError(t("editor.validation.urlInvalid"));
        return;
      }
      nextServer = {
        type: transport,
        url: trimmedUrl,
        ...(kvMap ? { headers: kvMap } : {}),
        enabled,
        disabled,
      };
    }

    setError(null);
    const ok = await onSave(trimmedName, nextServer, editingName);
    if (ok) {
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    if (!editingName) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    const ok = await onDelete(editingName);
    if (ok) {
      onOpenChange(false);
    }
  };

  const labelStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 12,
    fontWeight: "500" as const,
  };

  const inputStyle = {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: 13,
  };

  const multilineStyle = {
    ...inputStyle,
    minHeight: 72,
    maxHeight: 150,
    fontFamily: "monospace",
    fontSize: 12,
    textAlignVertical: "top" as const,
  };

  return (
    <Modal
      title={
        editingName
          ? t("editor.titleEdit", { name: editingName })
          : t("editor.titleAdd")
      }
      icon={<Icon name="Plug" size={16} color={theme.colors.foregroundMuted} />}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Content>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>{t("editor.nameLabel")}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("editor.namePlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>{t("editor.transportLabel")}</Text>
            <SegmentedOption
              value={transport}
              onChange={setTransport}
              options={[
                { value: "stdio", label: "stdio" },
                { value: "http", label: "http" },
                { value: "sse", label: "sse" },
              ]}
              theme={theme}
            />
          </View>

          {transport === "stdio" ? (
            <>
              <View style={{ gap: 6 }}>
                <Text style={labelStyle}>{t("editor.commandLabel")}</Text>
                <TextInput
                  value={command}
                  onChangeText={setCommand}
                  placeholder={t("editor.commandPlaceholder")}
                  placeholderTextColor={theme.colors.foregroundMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={inputStyle}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={labelStyle}>{t("editor.argsLabel")}</Text>
                <TextInput
                  value={argsText}
                  onChangeText={setArgsText}
                  placeholder={t("editor.argsPlaceholder")}
                  placeholderTextColor={theme.colors.foregroundMuted}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={multilineStyle}
                />
              </View>

              <KeyValueEditor
                label={t("editor.envLabel")}
                entries={kvEntries}
                onChange={setKvEntries}
                compact={compact}
                theme={theme}
              />
            </>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={labelStyle}>{t("editor.urlLabel")}</Text>
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  placeholder={t("editor.urlPlaceholder")}
                  placeholderTextColor={theme.colors.foregroundMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={inputStyle}
                />
              </View>

              <KeyValueEditor
                label={t("editor.headersLabel")}
                entries={kvEntries}
                onChange={setKvEntries}
                compact={compact}
                theme={theme}
              />
            </>
          )}

          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>{t("editor.scopeLabel")}</Text>
            <SegmentedOption
              value={scope}
              onChange={setScope}
              options={[
                { value: "all", label: t("editor.scopeAll") },
                { value: "dirs", label: t("editor.scopeDirs") },
                { value: "off", label: t("editor.scopeOff") },
              ]}
              theme={theme}
            />
          </View>

          {scope === "dirs" ? (
            <View style={{ gap: 6 }}>
              <Text style={labelStyle}>{t("editor.enabledDirsLabel")}</Text>
              <TextInput
                value={enabledDirsText}
                onChangeText={setEnabledDirsText}
                placeholder={t("editor.enabledDirsPlaceholder")}
                placeholderTextColor={theme.colors.foregroundMuted}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={multilineStyle}
              />
            </View>
          ) : null}

          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>{t("editor.disabledDirsLabel")}</Text>
            <TextInput
              value={disabledDirsText}
              onChangeText={setDisabledDirsText}
              placeholder={t("editor.disabledDirsPlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={multilineStyle}
            />
          </View>

          {error ? (
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
              {error}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: compact ? "column" : "row",
              alignItems: compact ? "stretch" : "center",
              justifyContent: "space-between",
              gap: 8,
              paddingTop: 4,
            }}
          >
            <View style={{ flexDirection: "row", gap: 8 }}>
              {editingName ? (
                <HubButton
                  label={deleteArmed ? t("settings.confirmDelete") : t("settings.delete")}
                  onPress={() => void handleDelete()}
                  variant="danger"
                  disabled={saving}
                  icon="Trash2"
                  theme={theme}
                />
              ) : null}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <HubButton
                label={t("settings.cancel")}
                onPress={() => onOpenChange(false)}
                variant="secondary"
                disabled={saving}
                theme={theme}
              />
              <HubButton
                label={saving ? t("settings.saving") : t("settings.save")}
                onPress={() => void handleSave()}
                variant="primary"
                disabled={saving}
                theme={theme}
              />
            </View>
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}
