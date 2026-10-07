import { expect, test } from "vite-plus/test";
import { toSearchResult } from "../src/lib/mpp/orthogonal.ts";

// The shape Orthogonal's search answers with; optional fields are omitted the
// way the live API does for endpoints it knows less about.
const response = {
  success: true,
  results: [
    {
      id: "api-uuid",
      name: "Apollo.io",
      slug: "apollo",
      baseUrl: "https://api.apollo.io",
      payableBaseUrl: "https://api.orthogonal.com/pay/apollo",
      endpoints: [
        {
          id: "endpoint-uuid",
          path: "/v1/people/match",
          method: "POST",
          description: "Enrich a person by email, name, or LinkedIn URL",
          price: "0.03",
          isPayable: true,
          verified: true,
          score: 0.95,
        },
        {
          path: "/v1/organizations/enrich",
          method: "post",
          description: "Enrich a company by domain",
        },
      ],
    },
  ],
  count: 3,
  apisCount: 1,
  prompt: "enrich lead with contact info",
  searchType: "semantic",
  responseTime: 145,
};

test("endpoints map to one tool each, payable at mpp.orthogonal.com", () => {
  const tools = toSearchResult(response);

  expect(tools).toHaveLength(2);
  expect(tools[0]).toEqual({
    url: "https://mpp.orthogonal.com/apollo/v1/people/match",
    method: "POST",
    description: "Enrich a person by email, name, or LinkedIn URL",
    verified: true,
    score: 0.95,
  });
});

test("fields Orthogonal omits fall back to the schema's nulls and defaults", () => {
  expect(toSearchResult(response)[1]).toEqual({
    url: "https://mpp.orthogonal.com/apollo/v1/organizations/enrich",
    method: "POST",
    description: "Enrich a company by domain",
    verified: false,
    score: null,
  });
});

test("the credit rail the search response names is never served to callers", () => {
  const urls = toSearchResult(response).map((tool) => new URL(tool.url));

  for (const url of urls) expect(url.origin).toBe("https://mpp.orthogonal.com");
});
