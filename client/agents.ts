import type { PluginClientContext } from "@getpaseo/plugin/client";

type Paseo = PluginClientContext["paseo"];
type AgentListResult = Awaited<ReturnType<Paseo["agents"]["list"]>>;
type AgentUpdate = Parameters<Parameters<Paseo["agents"]["subscribe"]>[0]>[0];
type SubscriptionHandle = Awaited<
  ReturnType<Paseo["agents"]["list"]>
>["subscription"];

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * Keep an owned agent observation open with exponential-backoff reconnect.
 * Delivers a full snapshot initially and on every reconnect, plus incremental updates.
 */
export function followAgents(
  paseo: Paseo,
  handlers: {
    snapshot(list: AgentListResult): void;
    update(update: AgentUpdate): void;
  },
): () => void {
  const lifetime = new AbortController();
  let observation: SubscriptionHandle | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = RETRY_MIN_MS;

  function scheduleReopen(error: unknown): void {
    observation = null;
    if (lifetime.signal.aborted || retryTimer !== null) return;
    console.warn("mcp-hub: agent observation failed; reopening", error);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  }

  function open(): void {
    void paseo.agents
      .list({ subscribe: {}, signal: lifetime.signal })
      .then(({ subscription }) => {
        if (lifetime.signal.aborted) return;
        if (!subscription) {
          throw new Error("Host returned no agent observation");
        }
        observation = subscription;
        subscription.subscribe({
          snapshot(list) {
            retryDelay = RETRY_MIN_MS;
            handlers.snapshot(list);
          },
          update(message) {
            if (message.type === "agent_update") {
              handlers.update(message.payload);
            }
          },
          error: scheduleReopen,
        });
      })
      .catch(scheduleReopen);
  }

  open();

  return () => {
    lifetime.abort();
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    void observation?.release().catch(() => undefined);
    observation = null;
  };
}
