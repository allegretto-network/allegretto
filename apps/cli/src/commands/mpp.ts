import type { Command } from "commander";
import pc from "picocolors";
import type { Address } from "viem";
import { z } from "zod";
import { zodCommand } from "zod-commander";
import { api, requestJson } from "../lib/api.ts";
import { callEndpoint, quoteEndpoint } from "../lib/mpp.ts";
import { err, fields, isJson, ok, shortAddress, success, truncate } from "../utils/result.ts";

const discover = zodCommand({
  name: "discover",
  description: "Search for payable MPP endpoints, described in natural language",
  args: {
    query: z.string().describe("What you need, in natural language"),
  },
  opts: {
    limit: z.coerce.number().int().positive().max(50).prefault(20).describe("l;Maximum results"),
  },
  action: async (args, opts) => {
    const json = isJson(discover);

    const result = await discoverTools(args.query, opts.limit).catch((error: Error) => error);
    if (result instanceof Error) return err(result)(json);
    if (result.length === 0)
      return ok(pc.dim("No endpoints matched. Try describing the job differently."), result)(json);

    // Discoveries are advisory; `alln mpp quote` reads an endpoint's own
    // 402 Challenge — the authoritative price — without paying.
    const rows = result.map((tool) => ({
      method: tool.method,
      endpoint: tool.url,
      description: truncate(tool.description, 44),
    }));
    const width = {
      method: Math.max(...rows.map((row) => row.method.length)),
      endpoint: Math.max(...rows.map((row) => row.endpoint.length)),
      description: Math.max(...rows.map((row) => row.description.length)),
    };

    ok(
      rows
        .map((row) =>
          [
            pc.dim(row.method.padEnd(width.method)),
            pc.cyan(row.endpoint.padEnd(width.endpoint)),
            row.description.padEnd(width.description),
          ].join("  "),
        )
        .join("\n"),
      result,
    )(json);
  },
});

async function discoverTools(query: string, limit: number) {
  return requestJson(api.v1.tools.$get({ query: { q: query, limit: String(limit) } }));
}

// Both fetch and quote have to issue the endpoint's request — a Challenge
// only comes back when the endpoint is actually called — so they accept the
// same curl-style flags.
const requestFlags = {
  method: z.string().optional().describe("X;HTTP method; defaults to GET, or POST with a body"),
  header: z.string().array().optional().describe('H;Request header as "Name: value"'),
  query: z.string().array().optional().describe("q;Query string parameter as key=value"),
  data: z.string().optional().describe("d;Request body, or @path to read it from a file"),
  form: z.string().array().optional().describe("F;Multipart field as key=value or key=@path"),
};

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
      ...requestFlags,
      token: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 0x-prefixed address")
        .optional()
        .describe("t;Currency to pay in when the endpoint quotes several"),
    },
    action: async (args, opts) => {
      const json = isJson(fetch);
      // The flag's regex already checked the 0x-address format.
      const token = opts.token as Address | undefined;

      const result = await callEndpoint(args.endpoint, { ...opts, token }).catch(
        (error: Error) => error,
      );
      if (result instanceof Error) return err(result)(json);

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

const quote = collectRepeated(
  zodCommand({
    name: "quote",
    description: "Print the price an MPP endpoint charges, without paying it",
    args: {
      endpoint: z.string().describe("Absolute URL of the endpoint to quote"),
    },
    opts: { ...requestFlags },
    action: async (args, opts) => {
      const json = isJson(quote);

      const result = await quoteEndpoint(args.endpoint, opts).catch((error: Error) => error);
      if (result instanceof Error) return err(result)(json);

      // A 402 can offer one price per currency it accepts; every one is a
      // valid way to pay, so all of them are the answer.
      if (result.quotes.length === 0)
        return ok(
          [
            fields([["Endpoint", pc.cyan(result.endpoint)]]),
            pc.dim("This endpoint requires no payment."),
          ].join("\n"),
          result,
        )(json);

      ok(result.quotes.map((p) => p.formatted).join("\n"), result)(json);
    },
  }),
  "header",
  "query",
  "form",
);

type Result = Awaited<ReturnType<typeof callEndpoint>>;

/** The one-line payment notice written to stderr after a call. */
function receipt(result: Result) {
  const { response, endpoint } = result;
  const status = `${response?.status} ${endpoint}`;
  if (!result.payment) return response?.ok ? pc.dim(status) : pc.red(status);

  const reference = response?.receipt?.reference;
  return [
    success(`Paid ${result.payment.quote.formatted} to ${result.payment.realm}`),
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
  .addCommand(fetch)
  .addCommand(quote);
