import pc from "picocolors";
import { type Address, formatUnits, parseUnits } from "viem";
import { z } from "zod";
import type { ErrorCode } from "../utils/errors.ts";
import { CliError } from "../utils/errors.ts";
import { getCached, setCached } from "./cache.ts";
import { tempoClient } from "./viem.ts";

export type TokenMetadata = { decimals: number; symbol: string; currency: string };

/**
 * `--fee-token` for any onchain write. Tempo has no native gas token, so fees
 * come out of a TIP-20; left unset, Tempo's own fee-token preference rules pick
 * one, falling back to pathUSD.
 */
export const feeTokenSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 0x-prefixed address")
  .optional()
  .describe("TIP-20 token to pay Tempo fees in");

// commander camelCases --fee-token; zod-commander's opts type keeps the literal
// key, so every caller reads it back through here.
export function readFeeToken(opts: object): Address | undefined {
  return (opts as { feeToken?: Address }).feeToken;
}

/**
 * Checks a fee token against the rules the protocol enforces before execution:
 * it must be an unpaused TIP-20 whose currency is USD. Failing those makes the
 * transaction invalid rather than reverting, so validating first turns a bare
 * "transaction invalid" into a message naming the problem. Returns the token so
 * callers can pass it straight to a write.
 */
export async function requireFeeToken(feeToken: Address | undefined) {
  if (feeToken === undefined) return undefined;

  const result = await tempoClient.fee
    .validateToken({ token: feeToken })
    .catch((error: Error) => error);
  if (result instanceof Error) throw feeTokenError(feeToken, result);

  return result.address;
}

// viem names the three protocol rules; its own message already says what is
// wrong, so each case only adds how to fix it.
function feeTokenError(feeToken: Address, error: Error) {
  const recovery = {
    FeeTokenNotTip20Error: "Pass a TIP-20 token address — they start with 0x20c0.",
    FeeTokenNotUsdError: "Tempo charges fees in USD, so pick a USD-denominated TIP-20.",
    FeeTokenPausedError: "Pass a different token, or omit --fee-token to let Tempo choose.",
  }[error.name];

  return new CliError(
    "FEE_TOKEN_INVALID",
    `${feeToken} cannot pay Tempo fees: ${(error as { shortMessage?: string }).shortMessage ?? error.message}`,
    recovery ?? "Pass an unpaused, USD-denominated TIP-20, or omit --fee-token.",
  );
}

/**
 * Reads a token's decimals and symbol, cached forever per address since both
 * are immutable for a deployed contract. Returns null when the contract does
 * not answer (not a TIP-20), so callers can fall back to raw base units.
 */
export async function readTokenMetadata(token: Address): Promise<TokenMetadata | null> {
  const key = token.toLowerCase();
  const cached = getCached<TokenMetadata>("token-metadata", key);
  if (cached) return cached;

  // Tempo's token action reads the whole TIP-20 metadata set in one deployless
  // multicall, and answers from viem's Tempo token list for known tokens.
  const metadata = await tempoClient.token
    .getMetadata({ token })
    .then(({ decimals, symbol, currency }) => ({ decimals, symbol, currency }))
    .catch(() => null);

  if (metadata) setCached("token-metadata", key, metadata);
  return metadata;
}

/** "0.05 USDC" when metadata is known, "50000000000000000 base units" when not. */
export function formatTokenAmount(amount: bigint, metadata: TokenMetadata | null): string {
  if (!metadata) return `${amount} base units`;
  return `${formatUnits(amount, metadata.decimals)} ${metadata.symbol}`;
}

/** "USDC (0x...)" when a symbol is known, else just the address. */
export function tokenLabel(token: string, symbol: string | null): string {
  return symbol ? `${symbol} ${pc.dim(`(${token})`)}` : token;
}

/**
 * Parses a token amount from the command line: raw base units when asUnit is
 * set, otherwise decimal token units scaled by decimals. errorCode lets each
 * caller keep its own CliError code for invalid input.
 */
export function parseTokenAmount(
  amount: string,
  asUnit: boolean,
  decimals: number,
  errorCode: ErrorCode,
): bigint {
  if (asUnit) {
    if (!/^\d+$/.test(amount))
      throw new CliError(errorCode, `${amount} is not an integer amount of base units.`);
    return BigInt(amount);
  }

  if (!/^\d+(\.\d+)?$/.test(amount))
    throw new CliError(errorCode, `${amount} is not a token amount, e.g. 1.5 or 20.`);
  return parseUnits(amount, decimals);
}
