import { defineTranslations } from "@getpaseo/plugin/client";
import { describe, expect, it } from "vitest";
import { de } from "./locales/de";
import { en } from "./locales/en";

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(path);
    } else if (typeof value === "object" && value !== null) {
      keys.push(...flattenKeys(value as Record<string, unknown>, path));
    }
  }
  return keys.sort();
}

function extractPlaceholders(str: string): string[] {
  return [...new Set([...str.matchAll(/\{\{-?\s*([^},\s]+)[^}]*\}\}/g)].map((m) => m[1]))].sort();
}

function flattenEntries(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[path] = value;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(out, flattenEntries(value as Record<string, unknown>, path));
    }
  }
  return out;
}

describe("client locales (en & de)", () => {
  it("validates cleanly with Paseo defineTranslations", () => {
    const bundle = defineTranslations({ resources: { en, de } });
    expect(bundle.resources.en).toBe(en);
    expect(bundle.resources.de).toBe(de);
    expect(() => bundle.message("settings.tabs.servers")).not.toThrow();
    expect(() => bundle.message("pill.labelWithCount", { count: 3 })).not.toThrow();
  });

  it("keeps identical flattened key sets between English and German", () => {
    expect(flattenKeys(de)).toEqual(flattenKeys(en));
  });

  it("keeps identical interpolation placeholders between English and German", () => {
    const enFlat = flattenEntries(en);
    const deFlat = flattenEntries(de);
    for (const key of Object.keys(enFlat)) {
      expect(extractPlaceholders(deFlat[key]!)).toEqual(
        extractPlaceholders(enFlat[key]!),
      );
    }
  });
});
