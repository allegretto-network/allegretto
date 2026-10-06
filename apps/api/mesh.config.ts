import { defineConfig, loadGraphQLHTTPSubgraph } from "@graphql-mesh/compose-cli";

import { requireEnv } from "./scripts/env.js";

// The Graph requires an API key, but it must never land in the committed
// artifact: compose-time introspection authenticates with schemaHeaders,
// while the runtime calls interpolate the {env.*} templates below from
// process.env — Worker secrets surface there under nodejs_compat
// (wrangler secret put ERC_8004_SUBGRAPH_API_KEY / ERC_8183_SUBGRAPH_API_KEY).

// Composes the erc-8004 and erc-8183 subgraphs into a single supergraph.
export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph("ERC8004", {
        endpoint: requireEnv("ERC_8004_SUBGRAPH_URL"),
        schemaHeaders: {
          Authorization: `Bearer ${requireEnv("ERC_8004_SUBGRAPH_API_KEY")}`,
        },
        operationHeaders: {
          Authorization: "Bearer {env.ERC_8004_SUBGRAPH_API_KEY}",
        },
        // graph-node resolves null for the non-null `isDeprecated` field when
        // input-value deprecation is requested, failing the whole
        // introspection. Codegen never asked for it either.
        introspectionOptions: { inputValueDeprecation: false },
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph("ERC8183", {
        endpoint: requireEnv("ERC_8183_SUBGRAPH_URL"),
        schemaHeaders: {
          Authorization: `Bearer ${requireEnv("ERC_8183_SUBGRAPH_API_KEY")}`,
        },
        operationHeaders: {
          Authorization: "Bearer {env.ERC_8183_SUBGRAPH_API_KEY}",
        },
        // graph-node resolves null for the non-null `isDeprecated` field when
        // input-value deprecation is requested, failing the whole
        // introspection. Codegen never asked for it either.
        introspectionOptions: { inputValueDeprecation: false },
      }),
    },
  ],
  // Cross-source relationship: erc-8183's Job.providerAgentId (the numeric
  // ERC-8004 agent id) joined onto erc-8004's AgentRegistration. Resolved by
  // src/lib/mesh/resolvers.ts, which recomputes the hex entity id the subgraph
  // keys registrations with.
  additionalTypeDefs: /* GraphQL */ `
    extend type Job {
      "ERC-8004 agent assigned as the job provider, resolved across the erc-8004 subgraph from providerAgentId"
      agent: Agent
    }
  `,
});
