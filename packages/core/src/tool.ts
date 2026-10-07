import { z } from "zod";

/**
 * Provider-agnostic view of a payable endpoint ("tool") over MPP. Discovery
 * providers (Orthogonal today, others later) map their catalogs onto these
 * schemas, so callers — the API, the CLI, agents — never see provider shapes.
 */
export const toolSchema = z.object({
  url: z.string().describe("Payable endpoint URL"),
  method: z.string().describe("HTTP method the endpoint expects"),
  description: z.string(),
  verified: z.boolean().describe("Whether the provider verified this endpoint"),
  score: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Provider relevance score for the query; null when it does not score"),
});

export const toolSearchQuerySchema = z.object({
  q: z.string().min(1).describe("What you need, in natural language"),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(50)
    .default(20)
    .describe("Maximum number of tools to return")
    .meta({ example: 20 }),
});

export const toolSearchOutputSchema = z.array(toolSchema);

export type Tool = z.infer<typeof toolSchema>;
export type ToolSearchQuery = z.infer<typeof toolSearchQuerySchema>;
export type ToolSearchResult = z.infer<typeof toolSearchOutputSchema>;
