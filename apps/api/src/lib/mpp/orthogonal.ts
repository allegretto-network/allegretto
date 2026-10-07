import { type Tool, type ToolSearchQuery, type ToolSearchResult } from "@allegretto-network/core";
import { z } from "zod";

// Search is discovery-only: it answers with a catalog, never with API results.
// Paying happens at the MPP rail below, straight from the caller's wallet, so
// the mapped `url` is built from MPP_PAY_BASE_URL and not from the credit-run
// base (`payableBaseUrl`) the search response names.
const SEARCH_URL = "https://api.orthogonal.com/v1/search";
const MPP_PAY_BASE_URL = "https://mpp.orthogonal.com";

const searchResponseSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        endpoints: z
          .array(
            z.object({
              id: z.string().optional(),
              path: z.string(),
              method: z.string(),
              description: z.string(),
              verified: z.boolean().optional(),
              score: z.number().optional(),
            }),
          )
          .prefault([]),
      }),
    )
    .prefault([]),
  count: z.number().optional(),
});

/**
 * Maps an Orthogonal search response onto the provider-agnostic MPP schemas,
 * flattened to one record per endpoint so callers page tools, not APIs.
 * Exported for tests.
 */
export function toSearchResult(response: z.infer<typeof searchResponseSchema>): ToolSearchResult {
  const tools = response.results.flatMap((api) =>
    api.endpoints.map((endpoint): Tool => {
      return {
        url: `${MPP_PAY_BASE_URL}/${api.slug}${endpoint.path}`,
        method: endpoint.method.toUpperCase(),
        description: endpoint.description,
        verified: endpoint.verified ?? false,
        score: endpoint.score ?? null,
      };
    }),
  );

  return tools;
}

/**
 * Searches Orthogonal and maps the answer into the shared MPP interface. The
 * API key is the caller's Worker secret binding (`ORTHOGONAL_API_KEY`).
 */
export async function searchOrthogonalTools(
  query: ToolSearchQuery,
  apiKey: string,
): Promise<ToolSearchResult> {
  if (!apiKey)
    throw new Error(
      "ORTHOGONAL_API_KEY is not set. Set it with `wrangler secret put ORTHOGONAL_API_KEY`.",
    );

  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt: query.q, limit: query.limit }),
  });
  if (!response.ok)
    throw new Error(`Orthogonal search answered ${response.status} ${response.statusText}.`);

  const parsed = searchResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success)
    throw new Error("Orthogonal search returned a document this API does not understand.");

  return toSearchResult(parsed.data);
}
