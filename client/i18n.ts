import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";
import { de } from "./locales/de";
import { en } from "./locales/en";

export const messages = defineTranslations({
  resources: {
    en,
    de,
  },
});

export type HubTextKey = Parameters<typeof messages.message>[0];

export const label = messages.message;

export function useHubTranslation() {
  return useTranslation(messages);
}
