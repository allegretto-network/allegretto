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
import { parseTokenAmount, readTokenMetadata } from "./token.ts";
import { toWalletAccount } from "./viem.ts";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** The curl-style flags `alln mpp fetch` accepts, each already collected. */
export type RequestOptions = {
  method?: string;
  header?: string[];
  query?: string[];
  data?: string;
  form?: string[];
};

/**
 * Calls an endpoint, settling its `402` Challenge when there is one.
 *
 * `inspect` stops after the Challenge is read, so the terms can be reported
 * without a wallet or a payment. `maxAmount` is a ceiling in token units: a
 * Challenge asking for more is refused before anything is signed.
 */
export async function callEndpoint(
  endpoint: string,
  opts: RequestOptions & { inspect: boolean; maxAmount?: string },
) {
  const request = await toRequest(endpoint, opts);

  // polyfill: false keeps globalThis.fetch untouched, so the catalog and every
  // other request in the process stay on the stock fetch. The account is left
  // unset because reading a Challenge needs no wallet — the Privy session only
  // opens once a payment is actually signed.
  const mppx = Mppx.create({
    methods: [tempo.charge({ expectedChainId: TEMPO_CHAIN_ID })],
    polyfill: false,
  });

  const prepared = await mppx
    .prepareRequest(request.url, request.init)
    .catch(rethrowPayment(`prepare a request to ${endpoint}`));

  if (!prepared.payment) {
    if (opts.inspect) return { endpoint: request.url, payment: null, response: null };
    return { endpoint: request.url, payment: null, response: await read(prepared.response) };
  }

  const payment = await describeChallenge(prepared.payment.challenge);
  if (opts.inspect) return { endpoint: request.url, payment, response: null };

  assertWithinMaxAmount(payment, opts.maxAmount);

  const session = await openSession();
  const response = await prepared.payment
    .pay({ account: toWalletAccount(session, requireWallet(session)) })
    .catch(rethrowPayment(`pay ${payment.realm}`));

  return { endpoint: request.url, payment, response: await read(response) };
}

/** The Challenge's own terms, resolved for display and for the amount guard. */
async function describeChallenge(challenge: Challenge.Challenge) {
  const charge = chargeRequestSchema.safeParse(challenge.request);
  if (!charge.success)
    throw new CliError(
      "MPP_CHALLENGE_INVALID",
      `The ${challenge.method}/${challenge.intent} Challenge from ${challenge.realm} names no amount and currency.`,
    );

  // The chain is the authority on decimals and symbol; the Challenge's own
  // decimals are the fallback for a currency that is not a Tempo TIP-20.
  const currency = charge.data.currency as Address;
  const metadata = await readTokenMetadata(currency);
  const decimals = metadata?.decimals ?? charge.data.decimals;
  if (decimals === undefined)
    throw new CliError(
      "MPP_CHALLENGE_INVALID",
      `Could not read the decimals of ${currency}, the currency ${challenge.realm} asks to be paid in.`,
    );

  return {
    id: challenge.id,
    realm: challenge.realm,
    method: `${challenge.method}/${challenge.intent}`,
    description: challenge.description ?? charge.data.description ?? null,
    amount: charge.data.amount,
    formatted: formatAmount(BigInt(charge.data.amount), decimals, metadata?.symbol ?? null),
    decimals,
    currency,
    symbol: metadata?.symbol ?? null,
    recipient: charge.data.recipient ?? null,
    expires: challenge.expires ?? null,
  };
}

/**
 * "0.05 USDC", or "0.05" when the currency is not a TIP-20 the chain knows and
 * only the Challenge's own decimals are available.
 */
function formatAmount(amount: bigint, decimals: number, symbol: string | null) {
  return `${formatUnits(amount, decimals)}${symbol ? ` ${symbol}` : ""}`;
}

type Payment = Awaited<ReturnType<typeof describeChallenge>>;

function assertWithinMaxAmount(payment: Payment, maxAmount: string | undefined) {
  if (maxAmount === undefined) return;

  const limit = parseTokenAmount(maxAmount, false, payment.decimals, "MPP_AMOUNT_EXCEEDED");
  if (BigInt(payment.amount) <= limit) return;

  throw new CliError(
    "MPP_AMOUNT_EXCEEDED",
    `${payment.realm} asks for ${payment.formatted}, more than the ${formatAmount(limit, payment.decimals, payment.symbol)} --max-amount allows.`,
    "Raise --max-amount to pay it, or pass --inspect to read the terms without paying.",
  );
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
async function toRequest(endpoint: string, opts: RequestOptions) {
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
      "Pass the whole endpoint, e.g. https://api.example.com/v1/search — `alln mpp discover` prints them ready to use.",
    );

  for (const entry of query) {
    const [key, value] = splitPair(entry, "=", "--query key=value");
    url.searchParams.append(key, value);
  }

  return url.toString();
}

function toHeaders(entries: string[]) {
  // Headers' own array initializer appends, so a header passed twice is sent
  // twice rather than overwritten.
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
