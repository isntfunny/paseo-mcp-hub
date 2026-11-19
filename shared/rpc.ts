import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import {
  agentMcpsResultSchema,
  catalogReadResultSchema,
  catalogSaveResultSchema,
  catalogSchema,
  providerInfoSchema,
} from "./schema";

export const catalogGetRpc = defineRpc({
  name: "mcp-hub.catalog.get",
  input: z.object({}),
  output: catalogReadResultSchema,
});

export const catalogSaveRpc = defineRpc({
  name: "mcp-hub.catalog.save",
  input: z.object({
    revision: z.string(),
    catalog: catalogSchema,
  }),
  output: catalogSaveResultSchema,
});

export const catalogSaveRawRpc = defineRpc({
  name: "mcp-hub.catalog.save-raw",
  input: z.object({
    revision: z.string(),
    rawJson: z.string(),
  }),
  output: catalogSaveResultSchema,
});

export const providersListRpc = defineRpc({
  name: "mcp-hub.providers.list",
  input: z.object({}),
  output: z.object({
    providers: z.array(providerInfoSchema),
  }),
});

export const agentMcpsRpc = defineRpc({
  name: "mcp-hub.agent.mcps",
  input: z.object({
    agentId: z.string().min(1),
  }),
  output: agentMcpsResultSchema,
});
