import pc from "picocolors";
import type { Address, Hex } from "viem";
import { Abis } from "viem/tempo";
import { z } from "zod";
import { zodCommand } from "zod-commander";
import { openSession, requireWallet } from "../lib/session.ts";
import {
  feeTokenSchema,
  formatTokenAmount,
  parseTokenAmount,
  readFeeToken,
  readTokenMetadata,
  requireFeeToken,
  tokenLabel,
} from "../lib/token.ts";
import { tempoClient, toWalletAccount, walletClient } from "../lib/viem.ts";
import { CliError } from "../utils/errors.ts";
import { jsonStringSchema } from "../utils/json.ts";
import { err, fields, isJson, ok, success } from "../utils/result.ts";

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 0x-prefixed address");

const signMessage = zodCommand({
  name: "sign-message",
  description: "Sign a plaintext message with the active wallet",
  opts: {
    message: z.string().describe("m;The message to sign"),
  },
  action: async (_args, opts) => {
    const json = isJson(signMessage);

    const result = await signPlainMessage(opts.message).catch((error: Error) => error);
    if (result instanceof Error) return err(result)(json);

    ok(
      fields([
        ["Address", pc.cyan(result.address)],
        ["Message", result.message],
        ["Signature", pc.cyan(result.signature)],
      ]),
      result,
    )(json);
  },
});

async function signPlainMessage(message: string) {
  const session = await openSession();
  const wallet = requireWallet(session);

  return {
    address: wallet.address,
    message,
    signature: await toWalletAccount(session, wallet).signMessage({ message }),
  };
}

const typedDataSchema = z.object({
  domain: z.record(z.string(), z.unknown()).prefault({}),
  types: z.record(z.string(), z.unknown()),
  primaryType: z.string(),
  message: z.record(z.string(), z.unknown()),
});

const signTypedData = zodCommand({
  name: "sign-typed-data",
  description: "Sign EIP-712 typed data with the active wallet",
  opts: {
    data: jsonStringSchema
      .pipe(typedDataSchema)
      .describe("d;EIP-712 payload as JSON: { domain, types, primaryType, message }"),
  },
  action: async (_args, opts) => {
    const json = isJson(signTypedData);

    const result = await signEip712(opts.data).catch((error: Error) => error);
    if (result instanceof Error) return err(result)(json);

    ok(
      fields([
        ["Address", pc.cyan(result.address)],
        ["Type", result.primaryType],
        ["Signature", pc.cyan(result.signature)],
      ]),
      result,
    )(json);
  },
});

async function signEip712(typedData: z.infer<typeof typedDataSchema>) {
  const session = await openSession();
  const wallet = requireWallet(session);

  return {
    address: wallet.address,
    primaryType: typedData.primaryType,
    // Privy validates the typed data itself; viem's generics are stricter than
    // anything that survives a round trip through JSON on the command line.
    signature: await toWalletAccount(session, wallet).signTypedData(typedData),
  };
}

const sendTransaction = zodCommand({
  name: "send-transaction",
  description: "Sign and broadcast a raw transaction with the active wallet",
  opts: {
    to: addressSchema.describe("t;Recipient address"),
    data: z
      .string()
      .regex(/^0x[0-9a-fA-F]*$/, "Expected 0x-prefixed hex")
      .optional()
      .describe("d;Calldata as 0x-prefixed hex"),
    "fee-token": feeTokenSchema,
  },
  action: async (_args, opts) => {
    const json = isJson(sendTransaction);

    const result = await broadcastTransaction({
      to: opts.to,
      data: opts.data,
      feeToken: await requireFeeToken(readFeeToken(opts)),
    }).catch((error: Error) => error);
    if (result instanceof Error) return err(result)(json);

    ok(
      fields([
        ["From", pc.cyan(result.from)],
        ["To", pc.cyan(result.to)],
        ["Hash", pc.cyan(result.hash)],
      ]),
      result,
    )(json);
  },
});

async function broadcastTransaction(opts: { to: string; data?: string; feeToken?: Address }) {
  const session = await openSession();
  const wallet = requireWallet(session);

  // viem prepares the transaction (nonce, gas, fees) and broadcasts it against
  // Tempo's own RPC; Privy only produces the signature.
  const hash = await walletClient(session, wallet).sendTransaction({
    type: "tempo",
    feeToken: opts.feeToken,
    to: opts.to as Hex,
    ...(opts.data && { data: opts.data as Hex }),
  });

  return { from: wallet.address, to: opts.to, hash };
}

const address = zodCommand({
  name: "address",
  description: "Show wallet address",
  action: async () => {
    const json = isJson(address);

    const result = await showAddress().catch((error: Error) => error);
    if (result instanceof Error) return err(result)(json);

    ok(fields([["Address", pc.cyan(result.address)]]), result)(json);
  },
});

async function showAddress() {
  const session = await openSession();
  return { address: requireWallet(session).address };
}

const balance = zodCommand({
  name: "balance",
  description: "Show the wallet's balance of a TIP-20 token",
  args: {
    tokenAddress: addressSchema.describe("TIP-20 token contract address"),
  },
  action: async (args) => {
    const json = isJson(balance);

    const result = await readTokenBalance(args.tokenAddress).catch((error: Error) => error);
    if (result instanceof Error) return err(result)(json);

    ok(
      fields([
        ["Address", pc.cyan(result.address)],
        ["Token", tokenLabel(result.token, result.symbol)],
        ["Balance", pc.bold(result.balance)],
      ]),
      result,
    )(json);
  },
});

async function readTokenBalance(token: string) {
  const session = await openSession();
  const wallet = requireWallet(session);

  const [wei, metadata] = await Promise.all([
    tempoClient.readContract({
      address: token as Hex,
      abi: Abis.tip20,
      functionName: "balanceOf",
      args: [wallet.address as Hex],
    }),
    readTokenMetadata(token as Hex),
  ]);

  return {
    address: wallet.address,
    token,
    symbol: metadata?.symbol ?? null,
    balance: formatTokenAmount(wei, metadata),
  };
}

const transfer = zodCommand({
  name: "transfer",
  description: "Send TIP-20 tokens from the active wallet",
  opts: {
    token: addressSchema.describe("t;TIP-20 token contract address"),
    to: addressSchema.describe("Recipient address"),
    amount: z.string().describe("a;Amount to send in token units, e.g. 1.5"),
    "as-unit": z.boolean().prefault(false).describe("Treat --amount as raw base units"),
    "fee-token": feeTokenSchema,
  },
  action: async (_args, opts) => {
    const json = isJson(transfer);
    // commander camelCases --as-unit; zod-commander's opts type keeps the literal key.
    const asUnit = (opts as { asUnit?: boolean }).asUnit === true;

    const result = await transferTokens(opts.token, opts.to, opts.amount, asUnit, {
      feeToken: await requireFeeToken(readFeeToken(opts)),
    }).catch((error: Error) => error);
    if (result instanceof Error) return err(result)(json);

    ok(
      [
        success(`Sent ${result.formatted}`),
        fields([
          ["From", pc.cyan(result.from)],
          ["To", pc.cyan(result.to)],
          ["Token", tokenLabel(result.token, result.symbol)],
          ["Amount", `${result.formatted} ${pc.dim(`(${result.amount} base units)`)}`],
          [
            "Fee Token",
            result.feeToken
              ? tokenLabel(result.feeToken, result.feeSymbol)
              : pc.dim("chosen by Tempo"),
          ],
          ["Tx", pc.cyan(result.hash)],
        ]),
      ].join("\n"),
      result,
    )(json);
  },
});

async function transferTokens(
  token: string,
  to: string,
  amount: string,
  asUnit: boolean,
  opts: { feeToken?: Address },
) {
  const session = await openSession();
  const wallet = requireWallet(session);
  const metadata = await readTokenMetadata(token as Hex);
  if (!asUnit && !metadata)
    throw new CliError(
      "AMOUNT_INVALID",
      `Could not read the decimals of token ${token}.`,
      "Pass --as-unit with the amount in raw base units.",
    );

  // The guard above means metadata is non-null whenever decimals matter, so the
  // fallback is only there to satisfy the signature.
  const wei = parseTokenAmount(amount, asUnit, metadata?.decimals ?? 0, "AMOUNT_INVALID");
  const held = await tempoClient.readContract({
    address: token as Hex,
    abi: Abis.tip20,
    functionName: "balanceOf",
    args: [wallet.address as Hex],
  });
  if (held < wei)
    throw new CliError(
      "AMOUNT_INVALID",
      `This wallet holds ${formatTokenAmount(held, metadata)} but tried to send ${formatTokenAmount(wei, metadata)}.`,
    );

  // Left unset, Tempo's preference rules already pick the transferred USD TIP-20
  // for a single transfer call, so an explicit default would only bypass
  // requireFeeToken's paused/registered checks without changing the outcome.
  const feeToken = await requireFeeToken(opts.feeToken);
  const feeMetadata =
    feeToken === undefined
      ? null
      : feeToken === token
        ? metadata
        : await readTokenMetadata(feeToken);

  // Tempo's transaction type (118) carries a list of calls and lets fees be
  // paid in a TIP-20, so every write asks for it explicitly.
  const hash = await walletClient(session, wallet).writeContract({
    type: "tempo",
    feeToken,
    address: token as Hex,
    abi: Abis.tip20,
    functionName: "transfer",
    args: [to as Hex, wei],
  });
  await tempoClient.waitForTransactionReceipt({ hash });

  return {
    from: wallet.address,
    to,
    token,
    symbol: metadata?.symbol ?? null,
    amount: wei.toString(),
    formatted: formatTokenAmount(wei, metadata),
    feeToken: feeToken ?? null,
    feeSymbol: feeMetadata?.symbol ?? null,
    hash,
  };
}

export const wallet = zodCommand({
  name: "wallet",
  description: "Operate the Privy embedded wallet for the authenticated account",
})
  .addCommand(address)
  .addCommand(balance)
  .addCommand(transfer)
  .addCommand(signMessage)
  .addCommand(signTypedData)
  .addCommand(sendTransaction);
