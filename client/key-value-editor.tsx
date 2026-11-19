import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import { useHubTranslation } from "./i18n";

export interface KeyValueEntry {
  id: string;
  key: string;
  value: string;
  revealed: boolean;
}

let nextKvId = 1;
export function makeKvEntry(key = "", value = "", revealed = false): KeyValueEntry {
  return { id: `kv_${nextKvId++}`, key, value, revealed };
}

export function mapToKvEntries(record: Readonly<Record<string, string>> | undefined): KeyValueEntry[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => makeKvEntry(key, value, false));
}

export function kvEntriesToMap(entries: readonly KeyValueEntry[]): Record<string, string> | undefined {
  const clean: Record<string, string> = {};
  for (const entry of entries) {
    const k = entry.key.trim();
    if (!k) continue;
    clean[k] = entry.value;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

export function KeyValueEditor({
  label,
  entries,
  onChange,
  compact,
  theme,
}: {
  label: string;
  entries: readonly KeyValueEntry[];
  onChange: (next: KeyValueEntry[]) => void;
  compact: boolean;
  theme: PluginTheme;
}) {
  const { t } = useHubTranslation();

  const updateEntry = (id: string, patch: Partial<KeyValueEntry>) => {
    onChange(entries.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((item) => item.id !== id));
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
  } as const;

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "500" }}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("editor.addKv")}
          onPress={() => onChange([...entries, makeKvEntry("", "", true)])}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: theme.colors.surface2,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="Plus" size={13} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "500" }}>
            {t("editor.addKv")}
          </Text>
        </Pressable>
      </View>

      {entries.map((entry) => (
        <View
          key={entry.id}
          style={{
            flexDirection: compact ? "column" : "row",
            alignItems: compact ? "stretch" : "center",
            gap: 6,
          }}
        >
          <TextInput
            value={entry.key}
            onChangeText={(text) => updateEntry(entry.id, { key: text })}
            placeholder={t("editor.kvKeyPlaceholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[inputStyle, compact ? undefined : { flex: 1 }]}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: compact ? undefined : 1.4 }}>
            <TextInput
              value={entry.value}
              onChangeText={(text) => updateEntry(entry.id, { value: text })}
              placeholder={t("editor.kvValuePlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              secureTextEntry={!entry.revealed}
              autoCapitalize="none"
              autoCorrect={false}
              style={[inputStyle, { flex: 1 }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                entry.revealed ? t("editor.hideValueA11y") : t("editor.revealValueA11y")
              }
              onPress={() => updateEntry(entry.id, { revealed: !entry.revealed })}
              hitSlop={6}
              style={({ pressed }) => ({
                padding: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface2,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Icon
                name={entry.revealed ? "EyeOff" : "Eye"}
                size={14}
                color={theme.colors.foregroundMuted}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("editor.removeKvA11y")}
              onPress={() => removeEntry(entry.id)}
              hitSlop={6}
              style={({ pressed }) => ({
                padding: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface2,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Icon name="Trash2" size={14} color={theme.colors.statusDanger} />
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
