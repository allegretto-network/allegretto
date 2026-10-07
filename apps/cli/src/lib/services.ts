import { formatUnits } from "viem";
import { z } from "zod";
import { CliError } from "../utils/errors.ts";
import { getCached, setCached } from "./cache.ts";

// The public MPP catalog of payment-enabled services, the same JSON behind
// https://mpp.dev/services.
const CATALOG_URL = "https://mpp.dev/api/services";

// Half a megabyte of curated listings that turn over on the order of days, so
// one download serves a whole agent session and every later search is local.
const CATALOG_TTL = "1h";

const paymentSchema = z.object({
  intent: z.string(),
  method: z.string(),
  currency: z.string(),
  decimals: z.number(),
  description: z.string().optional(),
  // Fixed-price endpoints carry `amount` in base units; metered ones set
  // `dynamic` and describe their range in `amountHint` instead.
  amount: z.string().optional(),
  amountHint: z.string().optional(),
  dynamic: z.boolean().optional(),
  unitType: z.string().optional(),
});

const endpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  description: z.string(),
  docs: z.string().optional(),
  // Null on the free endpoints of an otherwise paid service.
  payment: paymentSchema.nullish(),
});

const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  url: z.string(),
  serviceUrl: z.string(),
  status: z.string(),
  categories: z.array(z.string()).prefault([]),
  tags: z.array(z.string()).prefault([]),
  docs: z
    .object({
      homepage: z.string().optional(),
      llmsTxt: z.string().optional(),
      apiReference: z.string().optional(),
    })
    .prefault({}),
  endpoints: z.array(endpointSchema).prefault([]),
});

const catalogSchema = z.object({ services: z.array(serviceSchema) });

export type ServicePayment = z.infer<typeof paymentSchema>;

/**
 * Searches the catalog and answers with endpoints rather than services, since
 * an endpoint URL is what `alln mpp fetch` takes. Ranking is local: the whole
 * catalog is small enough to download once and score in memory.
 */
export async function discoverEndpoints(
  query: string,
  limit: number,
  skip: number,
  refresh: boolean,
) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (await readCatalog(refresh))
    .flatMap((service) =>
      service.endpoints.map((endpoint) => ({
        service,
        endpoint,
        score: score(terms, service, endpoint),
      })),
    )
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    query,
    limit,
    skip,
    total: matches.length,
    endpoints: matches.slice(skip, skip + limit).map(({ service, endpoint }) => ({
      // serviceUrl is the API origin, url is the human landing page, so the
      // callable endpoint is only ever built from the former.
      endpoint: `${service.serviceUrl.replace(/\/$/, "")}${endpoint.path}`,
      method: endpoint.method,
      description: endpoint.description,
      price: formatPrice(endpoint.payment),
      payment: endpoint.payment ?? null,
      docs: endpoint.docs ?? service.docs.llmsTxt ?? service.docs.homepage ?? service.url,
      service: {
        id: service.id,
        name: service.name,
        url: service.url,
        status: service.status,
      },
    })),
  };
}

/**
 * Catalog prices are advisory — the runtime 402 Challenge is authoritative —
 * and every currency MPP lists is a USD stablecoin, so the amount reads as
 * dollars while the exact token address stays on the payment record.
 */
export function formatPrice(payment: ServicePayment | null | undefined): string {
  if (!payment) return "free";
  if (!payment.amount) return payment.amountHint ?? "metered";

  const amount = formatUnits(BigInt(payment.amount), payment.decimals);
  return payment.unitType ? `$${amount}/${payment.unitType}` : `$${amount}`;
}

type Service = z.infer<typeof serviceSchema>;
type ServiceEndpoint = z.infer<typeof endpointSchema>;

/**
 * Scores one endpoint against the query terms. Weights put a service's own
 * identity above its prose, because a query is far likelier to name the tool
 * or its domain than to quote a description.
 */
function score(terms: string[], service: Service, endpoint: ServiceEndpoint): number {
  if (terms.length === 0) return 1;

  const haystack: Array<[weight: number, text: string]> = [
    [6, service.name],
    [5, service.id],
    [4, service.tags.join(" ")],
    [4, service.categories.join(" ")],
    [4, endpoint.path],
    [3, endpoint.description],
    [2, service.description],
    [1, endpoint.payment?.description ?? ""],
  ];

  const perTerm = terms.map((term) =>
    haystack.reduce(
      (total, [weight, text]) => (text.toLowerCase().includes(term) ? total + weight : total),
      0,
    ),
  );
  const matched = perTerm.filter((value) => value > 0).length;
  if (matched === 0) return 0;

  // Covering the whole query beats matching one term loudly, so the total is
  // scaled by the share of terms that hit something.
  return (perTerm.reduce((total, value) => total + value, 0) * matched) / terms.length;
}

async function readCatalog(refresh: boolean) {
  // A cache written by an older release can disagree with the schema; treat
  // that like a miss rather than failing the command.
  const cached = refresh ? undefined : getCached<unknown>("mpp-services", "catalog");
  const reused = cached === undefined ? undefined : catalogSchema.safeParse(cached);
  if (reused?.success) return reused.data.services;

  const response = await fetch(CATALOG_URL, {
    headers: { accept: "application/json" },
  }).catch((error: Error) => error);
  if (response instanceof Error)
    throw new CliError(
      "MPP_CATALOG_FAILED",
      `Could not reach the MPP service catalog: ${response.message}`,
    );
  if (!response.ok)
    throw new CliError(
      "MPP_CATALOG_FAILED",
      `The MPP service catalog answered ${response.status} ${response.statusText}.`,
    );

  const catalog = catalogSchema.safeParse(await response.json().catch(() => null));
  if (!catalog.success)
    throw new CliError(
      "MPP_CATALOG_FAILED",
      "The MPP service catalog returned a document this version does not understand.",
      "Update the CLI with `npm install -g @allegretto-network/cli`.",
    );

  setCached("mpp-services", "catalog", catalog.data, CATALOG_TTL);
  return catalog.data.services;
}
