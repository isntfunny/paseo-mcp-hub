import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  agentMcpsRpc,
  catalogGetRpc,
  catalogSaveRawRpc,
  catalogSaveRpc,
  providersListRpc,
} from "../shared/rpc";
import type { Catalog, CatalogReadResult, CatalogSaveResult } from "../shared/schema";

export const CATALOG_QUERY_KEY = ["mcp-hub", "catalog"] as const;
export const PROVIDERS_QUERY_KEY = ["mcp-hub", "providers"] as const;

export function agentMcpsQueryKey(agentId: string) {
  return ["mcp-hub", "agent-mcps", agentId] as const;
}

export function useCatalogQuery() {
  const getCatalog = useRpc(catalogGetRpc);
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: () => getCatalog({}),
    staleTime: 10_000,
  });
}

export function useProvidersQuery() {
  const listProviders = useRpc(providersListRpc);
  return useQuery({
    queryKey: PROVIDERS_QUERY_KEY,
    queryFn: () => listProviders({}),
    staleTime: 30_000,
  });
}

export function useAgentMcpsQuery(agentId: string) {
  const getAgentMcps = useRpc(agentMcpsRpc);
  return useQuery({
    queryKey: agentMcpsQueryKey(agentId),
    queryFn: () => getAgentMcps({ agentId }),
    staleTime: 15_000,
  });
}

function applySavedCatalog(
  queryClient: ReturnType<typeof useQueryClient>,
  result: CatalogSaveResult,
): void {
  if (result.status !== "saved") return;

  queryClient.setQueryData<CatalogReadResult>(CATALOG_QUERY_KEY, (prev) => ({
    status: "ready",
    path: prev?.path ?? "",
    exists: true,
    revision: result.revision,
    legacyProvidersFound: false,
    catalog: result.catalog,
  }));
  void queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ["mcp-hub", "agent-mcps"] });
}

export function useSaveCatalogMutation() {
  const saveCatalog = useRpc(catalogSaveRpc);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { revision: string; catalog: Catalog }) => saveCatalog(input),
    onSuccess: (result) => applySavedCatalog(queryClient, result),
  });
}

export function useSaveRawCatalogMutation() {
  const saveRaw = useRpc(catalogSaveRawRpc);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { revision: string; rawJson: string }) => saveRaw(input),
    onSuccess: (result) => applySavedCatalog(queryClient, result),
  });
}
