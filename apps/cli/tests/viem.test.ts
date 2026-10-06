import { encodeFunctionData, parseAbi } from "viem";
import { Transaction } from "viem/tempo";
import { expect, test } from "vite-plus/test";
import { toPrivyTransaction } from "../src/lib/viem.ts";

const usdc = "0x20c000000000000000000000b9537d11c60e8b50" as const;
const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const transferData = encodeFunctionData({
  abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
  functionName: "transfer",
  args: [recipient, 1_000_000n],
});

// What viem hands an account's signTransaction once prepareTransactionRequest
// has filled nonce, gas, and fees.
const prepared = {
  type: "tempo",
  chainId: 4217,
  nonce: 7,
  gas: 284_403n,
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 1n,
  calls: [{ to: usdc, data: transferData }],
} as const;

test("maps a Tempo transaction to Privy's type 118 schema", () => {
  expect(toPrivyTransaction(prepared)).toEqual({
    type: 118,
    chain_id: 4217,
    nonce: 7,
    gas_limit: "0x456f3",
    max_fee_per_gas: "0x3b9aca00",
    max_priority_fee_per_gas: "0x1",
    calls: [{ to: usdc, data: transferData, value: undefined }],
    fee_token: undefined,
    nonce_key: undefined,
    valid_before: undefined,
    valid_after: undefined,
  });
});

test("carries the Tempo fields Privy signs over", () => {
  expect(
    toPrivyTransaction({
      ...prepared,
      feeToken: usdc,
      nonceKey: 1337n,
      validBefore: 1_800_000_030,
      validAfter: 1_800_000_000,
    }),
  ).toMatchObject({
    fee_token: usdc,
    nonce_key: "0x539",
    valid_before: 1_800_000_030,
    valid_after: 1_800_000_000,
  });
});

// viem's Tempo serializer derives the call list from to/data/value whenever the
// prepared transaction carries no calls of its own, so the adapter has to derive
// it the same way or Privy would sign a transaction that does nothing.
test("derives a single call from a plain to/data/value request", () => {
  expect(
    toPrivyTransaction({ ...prepared, calls: [], to: recipient, value: 10_000_000n }),
  ).toMatchObject({ calls: [{ to: recipient, data: "0x", value: "0x989680" }] });
});

test("maps non-Tempo transactions to the EIP-1559 schema", () => {
  expect(
    toPrivyTransaction({
      type: "eip1559",
      chainId: 4217,
      nonce: 7,
      to: recipient,
      value: 10_000_000n,
    }),
  ).toMatchObject({ type: 2, to: recipient, value: "0x989680" });
});

// The envelope Privy signs has to carry the calls and fee token the CLI asked
// for; a Tempo transaction is RLP behind a 0x76 type prefix.
test("the fields sent to Privy survive Tempo's own serializer", async () => {
  const serialized = (await Transaction.serialize(
    { ...prepared, feeToken: usdc },
    { r: `0x${"1".padStart(64, "0")}`, s: `0x${"2".padStart(64, "0")}`, yParity: 0 },
  )) as Transaction.TransactionSerializedTempo;
  const deserialized = Transaction.deserialize(serialized);

  expect(serialized.startsWith("0x76")).toBe(true);
  expect(deserialized.calls).toEqual([{ to: usdc, data: transferData }]);
  expect(deserialized.feeToken).toBe(usdc);
  expect(deserialized.chainId).toBe(4217);
});
