import fs from "node:fs/promises";
import path from "node:path";
import { TEMPO_CHAIN_ID } from "@allegretto-network/core";
import type { Challenge } from "mppx";
import { Receipt } from "mppx";
import { Mppx, tempo } from "mppx/client";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { z } from "zod";
import { CliError } from "../utils/errors.ts";
import { jsonStringSchema } from "../utils/json.ts";
import { openSession, requireWallet } from "./session.ts";
import { readTokenMetadata } from "./token.ts";
import { toWalletAccount } from "./viem.ts";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** The curl-style flags `alln mpp fetch` and `alln mpp quote` accept. */
export type RequestOptions = {
  method?: string;
  header?: string[];
  query?: string[];
  data?: string;
  form?: string[];
};

/**
 * One price an endpoint offers: the Challenge's amount in one of the
 * currencies it accepts.
 */
export type Quote = {
  /** Base-unit amount as the Challenge named it. */
  amount: string;
  currency: Address;
  symbol: string | null;
  /** "0.02 USDC.e", or "0.02" when only the Challenge's decimals are known. */
  formatted: string;
};

/**
 * Calls an endpoint, settling its `402` Challenge when there is one. `token`
 * picks which offered currency to pay in when the endpoint quotes several.
 */
export async function callEndpoint(endpoint: string, opts: RequestOptions & { token?: Address }) {
  const { url, payment, prepared } = await prepare(endpoint, opts);

  if (!prepared.payment || !payment)
    return { endpoint: url, payment: null, response: await read(prepared.response) };

  const session = await openSession();
  const response = await prepared.payment
    .pay({ account: toWalletAccount(session, requireWallet(session)) })
    .catch(rethrowPayment(`pay ${payment.realm}`));

  return { endpoint: url, payment, response: await read(response) };
}

/**
 * Reads the prices an endpoint's `402` Challenge offers — one per currency it
 * accepts — and pays nothing. No wallet is opened; the Privy session only
 * starts once a payment is actually signed.
 */
export async function quoteEndpoint(endpoint: string, opts: RequestOptions) {
  const { url, payment } = await prepare(endpoint, opts);
  return { endpoint: url, quotes: payment?.quotes ?? [] };
}

/**
 * Issues the request once — a Challenge only comes back when the endpoint is
 * actually called — and resolves its terms, if the endpoint raises one.
 * When `token` names a currency, the matching Challenge is selected for pay.
 */
async function prepare(endpoint: string, opts: RequestOptions & { token?: Address }) {
  const request = await toRequest(endpoint, opts);
  const token = opts.token?.toLowerCase();

  // polyfill: false keeps globalThis.fetch untouched, so every other request in
  // the process stays on the stock fetch.
  const mppx = Mppx.create({
    methods: [tempo.charge({ expectedChainId: TEMPO_CHAIN_ID })],
    polyfill: false,
  });

  const prepared = await mppx
    .prepareRequest(request.url, request.init, {
      // A 402 can offer one Challenge per currency. Sort the named token's
      // Challenge first so `pay` signs that one; never empty the list here, so
      // a token the endpoint does not accept fails with our error naming the
      // quotes instead of an SDK selection error.
      ...(token && {
        orderChallenges: (candidates) =>
          candidates.toSorted(
            (a, b) =>
              Number(challengeCurrency(b.challenge) === token) -
              Number(challengeCurrency(a.challenge) === token),
          ),
      }),
    })
    .catch(rethrowPayment(`prepare a request to ${endpoint}`));

  const payment = prepared.payment ? await describePayment(prepared.payment, opts.token) : null;
  return { url: request.url, payment, prepared };
}

/** The currency a Challenge asks to be paid in, lowercased for comparison. */
function challengeCurrency(challenge: Challenge.Challenge) {
  const currency = (challenge.request as { currency?: unknown }).currency;
  return typeof currency === "string" ? currency.toLowerCase() : "";
}

/** One Challenge's own terms: who asks, and for how much in which currency. */
type ChallengeTerms = {
  id: string;
  realm: string;
  method: string;
  description: string | null;
  recipient: string | null;
  expires: string | null;
  quote: Quote;
};

/** The selected terms alongside every price the endpoint offered. */
export type Payment = ChallengeTerms & { quotes: Quote[] };

/**
 * Resolves one Challenge's terms, or null when its request is not a
 * `tempo/charge` — a mixed offer must not sink the currencies that parse.
 */
async function describeChallenge(challenge: Challenge.Challenge): Promise<ChallengeTerms | null> {
  const charge = chargeRequestSchema.safeParse(challenge.request);
  if (!charge.success) return null;

  // The chain is the authority on decimals and symbol; the Challenge's own
  // decimals are the fallback for a currency that is not a Tempo TIP-20.
  const currency = charge.data.currency as Address;
  const metadata = await readTokenMetadata(currency);
  const decimals = metadata?.decimals ?? charge.data.decimals;
  if (decimals === undefined) return null;

  return {
    id: challenge.id,
    realm: challenge.realm,
    method: `${challenge.method}/${challenge.intent}`,
    description: challenge.description ?? charge.data.description ?? null,
    recipient: charge.data.recipient ?? null,
    expires: challenge.expires ?? null,
    quote: {
      amount: charge.data.amount,
      currency,
      symbol: metadata?.symbol ?? null,
      formatted: formatAmount(BigInt(charge.data.amount), decimals, metadata?.symbol ?? null),
    },
  };
}

/**
 * Resolves every Challenge the endpoint offered into quotes and picks the one
 * `fetch` would settle: the `--token` currency when given, else the client's
 * own selection.
 */
async function describePayment(
  payment: { challenge: Challenge.Challenge; challenges: readonly Challenge.Challenge[] },
  token: Address | undefined,
): Promise<Payment> {
  const offered = (
    await Promise.all(
      payment.challenges.map(async (challenge) => ({
        challenge,
        terms: await describeChallenge(challenge),
      })),
    )
  ).filter((entry) => entry.terms !== null);

  if (offered.length === 0)
    throw new CliError(
      "MPP_CHALLENGE_INVALID",
      `The ${payment.challenge.method}/${payment.challenge.intent} Challenge from ${payment.challenge.realm} names no amount and currency.`,
    );

  const quotes = offered.map((entry) => entry.terms!.quote);
  const match = token
    ? offered.find((entry) => entry.terms!.quote.currency.toLowerCase() === token.toLowerCase())
    : undefined;
  if (token && !match)
    throw new CliError(
      "MPP_TOKEN_NOT_ACCEPTED",
      `${payment.challenge.realm} does not quote a price in ${token}.`,
      `It accepts ${quotes.map((quote) => quote.formatted).join(" or ")} — run \`alln mpp quote\` to list them.`,
    );

  // Without --token the client's own selection stands; with it, the ordering in
  // prepare() already made the match the selected Challenge.
  const terms =
    match?.terms ??
    offered.find((entry) => entry.challenge === payment.challenge)?.terms ??
    (await describeChallenge(payment.challenge));
  if (!terms)
    throw new CliError(
      "MPP_CHALLENGE_INVALID",
      `The ${payment.challenge.method}/${payment.challenge.intent} Challenge from ${payment.challenge.realm} names no amount and currency.`,
    );

  return { ...terms, quotes };
}

/**
 * "0.05 USDC", or "0.05" when the currency is not a TIP-20 the chain knows and
 * only the Challenge's own decimals are available.
 */
function formatAmount(amount: bigint, decimals: number, symbol: string | null) {
  return `${formatUnits(amount, decimals)}${symbol ? ` ${symbol}` : ""}`;
}

// Tempo charges name the amount in base units alongside the TIP-20 they settle
// in. Everything else on the Challenge is method-specific and left untouched.
const chargeRequestSchema = z.object({
  amount: z.string().regex(/^\d+$/, "Expected an integer amount of base units"),
  currency: z.string(),
  decimals: z.number().optional(),
  description: z.string().optional(),
  recipient: z.string().optional(),
});

async function read(response: Response) {
  return {
    status: response.status,
    ok: response.ok,
    body: await response.text(),
    // Present once a payment settled, and the only proof of it the service
    // hands back, so it travels with the response.
    receipt: response.headers.has("payment-receipt") ? Receipt.fromResponse(response) : null,
  };
}

/**
 * Turns curl-style repeated flags into one request. `--data` and `--form` are
 * mutually exclusive bodies, and either one implies POST the way curl does.
 */
export async function toRequest(endpoint: string, opts: RequestOptions) {
  if (opts.data !== undefined && (opts.form ?? []).length > 0)
    throw new CliError(
      "FLAG_CONFLICT",
      "--data and --form cannot both carry the body.",
      "Send JSON or text with --data, or multipart fields with --form.",
    );

  const headers = toHeaders(opts.header ?? []);
  const body = await toBody(opts.data, opts.form ?? [], headers);

  return {
    url: toUrl(endpoint, opts.query ?? []),
    init: {
      method: toMethod(opts.method, body !== undefined),
      headers,
      ...(body !== undefined && { body }),
    } satisfies RequestInit,
  };
}

function toMethod(method: string | undefined, hasBody: boolean) {
  if (method === undefined) return hasBody ? "POST" : "GET";

  const upper = method.toUpperCase();
  if (!HTTP_METHODS.includes(upper))
    throw new CliError(
      "MPP_REQUEST_INVALID",
      `${method} is not an HTTP method.`,
      `Pass one of ${HTTP_METHODS.join(", ")}.`,
    );

  return upper;
}

function toUrl(endpoint: string, query: string[]) {
  const url = URL.parse(endpoint);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:"))
    throw new CliError(
      "MPP_REQUEST_INVALID",
      `${endpoint} is not an http(s) URL.`,
      "Pass the whole endpoint, e.g. https://mpp.orthogonal.com/olostep/v1/scrapes — `alln mpp discover` prints them ready to use.",
    );

  for (const entry of query) {
    const [key, value] = splitPair(entry, "=", "--query key=value");
    url.searchParams.append(key, value);
  }

  return url.toString();
}

function toHeaders(entries: string[]) {
  // Headers' array initializer follows HTTP combining: a header passed twice
  // is sent once with comma-joined values, e.g. `X-A: 1` + `X-A: 2` -> `1, 2`.
  return new Headers(entries.map((entry) => splitPair(entry, ":", '--header "Name: value"')));
}

async function toBody(data: string | undefined, form: string[], headers: Headers) {
  if (form.length > 0) return toFormData(form);
  if (data === undefined) return undefined;

  const body = data.startsWith("@") ? await readFileBytes(data.slice(1)).then(String) : data;

  // curl defaults an unannounced body to form encoding. An agent calling a
  // paid API almost never wants that, so a body that parses as JSON says so.
  if (!headers.has("content-type"))
    headers.set(
      "content-type",
      jsonStringSchema.safeParse(body).success ? "application/json" : "text/plain",
    );

  return body;
}

async function toFormData(entries: string[]) {
  const form = new FormData();

  for (const entry of entries) {
    const [name, value] = splitPair(entry, "=", "--form key=value or key=@path");
    if (!value.startsWith("@")) {
      form.append(name, value);
      continue;
    }

    const file = value.slice(1);
    form.append(name, new File([await readFileBytes(file)], path.basename(file)));
  }

  return form;
}

/** Splits `key<separator>value`, keeping any further separators in the value. */
function splitPair(entry: string, separator: string, expected: string): [string, string] {
  const at = entry.indexOf(separator);
  if (at < 1) throw new CliError("MPP_REQUEST_INVALID", `${entry} is not ${expected}.`);

  return [entry.slice(0, at).trim(), entry.slice(at + separator.length)];
}

async function readFileBytes(file: string) {
  const bytes = await fs.readFile(file).catch(() => null);
  if (!bytes) throw new CliError("FILE_NOT_FOUND", `Could not read ${file}.`);

  return bytes;
}

// mppx reports a failed payment through its own error hierarchy, where the
// first line already names the cause; the action it failed at is the context
// the message is missing.
function rethrowPayment(action: string) {
  return (error: unknown): never => {
    const message = error instanceof Error ? error.message : String(error);

    throw new CliError(
      "MPP_PAYMENT_FAILED",
      `Could not ${action}: ${message.split("\n")[0] ?? message}`,
      "Check the wallet holds the currency the Challenge asks for, and that the endpoint settles a per-request `tempo/charge`.",
    );
  };
}
