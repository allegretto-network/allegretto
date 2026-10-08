// Type-only import keeps the app (route registration, problem-details
// middleware) out of consumer bundles like apps/mcp.
import type app from ".";

export {
  agentReputationSchema,
  getAgentOutputSchema,
  getAgentParamsSchema,
  listAgentFeedbacksOutputSchema,
  listAgentFeedbacksParamsSchema,
  listAgentFeedbacksQuerySchema,
  listAgentServicesOutputSchema,
  listAgentServicesParamsSchema,
  searchAgentsOutputSchema,
  searchAgentsQuerySchema,
} from "./schemas/agents";
export {
  getJobOutputSchema,
  getJobParamsSchema,
  listJobsOutputSchema,
  listJobsQuerySchema,
} from "./schemas/jobs";
// Tool discovery schemas live in core (the provider-agnostic MPP interface);
// the /v1/tools route serves them, so consumers get them from here like the rest.
export {
  toolSearchOutputSchema,
  toolSearchQuerySchema,
  toolSchema,
} from "@allegretto-network/core";

export type ApiClientType = typeof app;
