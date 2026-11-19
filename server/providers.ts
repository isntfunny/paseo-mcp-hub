import type { PaseoApi } from "@getpaseo/client";
import type { ProviderInfo } from "../shared/schema";

const PROVIDERS_READY_TIMEOUT_MS = 4_000;

/** List configured Paseo providers and their availability for the exclusion settings screen. */
export async function listDaemonProviders(paseo: PaseoApi): Promise<{ providers: ProviderInfo[] }> {
  let snapshot;
  try {
    snapshot = await paseo.providers.waitForReady({ timeoutMs: PROVIDERS_READY_TIMEOUT_MS });
  } catch {
    snapshot = await paseo.providers.snapshot();
  }

  const providers: ProviderInfo[] = (snapshot.entries ?? [])
    .map((entry) => ({
      id: entry.provider,
      label: entry.label?.trim() || entry.provider,
      status: typeof entry.status === "string" ? entry.status : "unknown",
      enabled: entry.enabled !== false,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { providers };
}
