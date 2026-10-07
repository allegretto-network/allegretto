import type { Command } from "commander";
import pc from "picocolors";
import { z } from "zod";
import { zodCommand } from "zod-commander";
import { callEndpoint } from "../lib/mpp.ts";
import { discoverEndpoints } from "../lib/services.ts";
import { tokenLabel } from "../lib/token.ts";
import {
  err,
  fields,
  formatRelative,
  isJson,
  ok,
  shortAddress,
  success,
  truncate,
} from "../utils/result.ts";

const discover = zodCommand({
  name: "discover",
  description: "Search the MPP catalog for payable endpoints",
  args: {
    query: z.string().describe("Search text, matched against services, tags and endpoints"),
  },
  opts: {
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(1000)
      .prefault(20)
      .describe("l;Maximum results per page"),
    skip: z.coerce.number().int().nonnegative().prefault(0).describe("Number of results to skip"),
    refresh: z.boolean().prefault(false).describe("Re-download the catalog instead of the cache"),
  },
  action: async (args, opts) => {
    const json = isJson(discover);

    const result = await discoverEndpoints(args.query, opts.limit, opts.skip, opts.refresh).catch(
      (error: Error) => error,
    );
    if (result instanceof Error) return err(result)(json);
    if (result.endpoints.length === 0)
      return ok(pc.dim("No endpoints matched. Try a broader query."), result)(json);

    const rows = result.endpoints.map((endpoint) => ({
      method: endpoint.method,
      endpoint: endpoint.endpoint,
      description: truncate(endpoint.description, 44),
      meta: [endpoint.price, endpoint.service.name].join(" · "),
    }));
    const width = {
      method: Math.max(...rows.map((row) => row.method.length)),
      endpoint: Math.max(...rows.map((row) => row.endpoint.length)),
      description: Math.max(...rows.map((row) => row.description.length)),
    };

    ok(
      [
        ...rows.map((row) =>
          [
            pc.dim(row.method.padEnd(width.method)),
            pc.cyan(row.endpoint.padEnd(width.endpoint)),
            row.description.padEnd(width.description),
            pc.dim(row.meta),
          ].join("  "),
        ),
        ...(result.skip + result.endpoints.length < result.total
          ? [
              "",
              pc.dim(
                `${result.total} endpoints matched — re-run with --skip ${result.skip + result.limit}.`,
              ),
            ]
          : []),
      ].join("\n"),
      result,
    )(json);
  },
});

// `fetch` shadows the global in this module on purpose: every request it makes
// goes through lib/mpp.ts, which owns the payment-aware client.
const fetch = collectRepeated(
  zodCommand({
    name: "fetch",
    description: "Call an MPP endpoint, paying its 402 Challenge from the active wallet",
    args: {
      endpoint: z.string().describe("Absolute URL of the endpoint to call"),
    },
    opts: {
      method: z.string().optional().describe("X;HTTP method; defaults to GET, or POST with a body"),
      header: z.string().array().optional().describe('H;Request header as "Name: value"'),
      query: z.string().array().optional().describe("q;Query string parameter as key=value"),
      data: z.string().optional().describe("d;Request body, or @path to read it from a file"),
      form: z.string().array().optional().describe("F;Multipart field as key=value or key=@path"),
      inspect: z
        .boolean()
        .prefault(false)
        .describe("Report the payment the endpoint requires without paying it"),
      "max-amount": z
        .string()
        .optional()
        .describe("Refuse to pay more than this, in token units, e.g. 0.05"),
    },
    action: async (args, opts) => {
      const json = isJson(fetch);
      // commander camelCases --max-amount; zod-commander's opts type keeps the literal key.
      const maxAmount = (opts as { maxAmount?: string }).maxAmount;

      const result = await callEndpoint(args.endpoint, { ...opts, maxAmount }).catch(
        (error: Error) => error,
      );
      if (result instanceof Error) return err(result)(json);

      if (!result.response) return ok(inspection(result), result)(json);

      // The response body is the whole point of the call, so it owns stdout
      // and stays pipeable into jq. The payment notice goes to stderr, and a
      // failing status only sets the exit code.
      if (!json) process.stderr.write(`${receipt(result)}\n`);
      if (!result.response.ok) process.exitCode = 1;

      ok(result.response.body, result)(json);
    },
  }),
  "header",
  "query",
  "form",
);

type Result = Awaited<ReturnType<typeof callEndpoint>>;

/** What `--inspect` prints: the terms, and nothing paid. */
function inspection(result: Result) {
  if (!result.payment)
    return [
      fields([["Endpoint", pc.cyan(result.endpoint)]]),
      pc.dim("This endpoint requires no payment."),
    ].join("\n");

  return [
    fields([
      ["Endpoint", pc.cyan(result.endpoint)],
      ["Realm", result.payment.realm],
      ["Method", result.payment.method],
      ["Amount", pc.bold(result.payment.formatted)],
      ["Currency", tokenLabel(result.payment.currency, result.payment.symbol)],
      ["Recipient", result.payment.recipient ?? pc.dim("named by the service")],
      [
        "Expires",
        result.payment.expires
          ? formatRelative(Date.parse(result.payment.expires))
          : pc.dim("no expiry"),
      ],
      ...(result.payment.description
        ? [["Reason", result.payment.description] as [string, string]]
        : []),
    ]),
    "",
    pc.dim("Nothing was paid. Re-run without --inspect to settle it and get the response."),
  ].join("\n");
}

/** The one-line payment notice written to stderr after a call. */
function receipt(result: Result) {
  const status = `${result.response?.status} ${result.endpoint}`;
  if (!result.payment) return result.response?.ok ? pc.dim(status) : pc.red(status);

  const reference = result.response?.receipt?.reference;
  return [
    success(`Paid ${result.payment.formatted} to ${result.payment.realm}`),
    pc.dim(reference ? `${status} · ${shortAddress(reference)}` : status),
  ].join("\n");
}

/**
 * zod-commander's parser replaces the previous value, so a flag given twice
 * would keep only the last one. curl-style flags collect every occurrence.
 */
function collectRepeated(command: Command, ...names: string[]) {
  for (const name of names)
    command.options
      .find((option) => option.attributeName() === name)
      ?.argParser((value: string, previous?: string[]) => [...(previous ?? []), value]);

  return command;
}

export const mpp = zodCommand({
  name: "mpp",
  description: "Discover and call paid APIs over the Machine Payments Protocol",
})
  .addCommand(discover)
  .addCommand(fetch);
