import { encodeFunctionData, keccak256, parseAbi, parseSignature, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Chain, Transaction } from "viem/tempo";
import { expect, test } from "vite-plus/test";

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

const key = keccak256("0xa11ce");
const serialize = Chain.tempo.serializers.transaction;
type Serializable = Parameters<typeof serialize>[0];

/**
 * The same two steps the Privy wallet adapter runs: hash the serialized
 * transaction, then hand the signature back to viem's serializer. Only the
 * source of the signature differs, so these tests pin the envelope contract
 * with a local key.
 */
async function signLike(transaction: Record<string, unknown>) {
  const presign = transaction.feePayerSignature
    ? { ...transaction, feePayerSignature: null }
    : transaction;
  const digest = keccak256(await serialize(presign as unknown as Serializable));
  const signature = await privateKeyToAccount(key).sign({ hash: digest });

  return {
    digest,
    serialized: (await serialize(
      transaction as unknown as Serializable,
      parseSignature(signature),
    )) as Transaction.TransactionSerializedTempo,
  };
}

// The sender's digest is the serializer's unsigned payload, so a pre-filled
// fee-payer signature must not change it: sender and fee payer countersign
// the same payload (TIP-76). This pins the serializer behavior the adapter's
// sponsorship path relies on.
test("the fee payer's signature does not change what the sender signs", async () => {
  const feePayerKey = keccak256("0xf33d");
  const feePayerSignature = parseSignature(
    await privateKeyToAccount(feePayerKey).sign({ hash: keccak256("0xbeef") }),
  );
  const sponsored = { ...prepared, feePayer: true, from: recipient };
  const digest = keccak256(await serialize(sponsored as unknown as Serializable));

  expect(
    keccak256(await serialize({ ...sponsored, feePayerSignature } as unknown as Serializable)),
  ).toBe(digest);
});

test("recovers the wallet address from the signed digest", async () => {
  const { digest } = await signLike({ ...prepared, feeToken: usdc });
  const signature = await privateKeyToAccount(key).sign({ hash: digest });

  expect(await recoverAddress({ hash: digest, signature })).toBe(privateKeyToAccount(key).address);
});

// Every `alln wallet` and `alln agent` write takes this path: with no fee payer
// the sender commits to the fee token, and the envelope is a plain type-118
// transaction behind a 0x76 prefix.
test("serializes an unsponsored transaction as a plain tempo envelope", async () => {
  const { serialized } = await signLike({ ...prepared, feeToken: usdc });
  const deserialized = Transaction.deserialize(serialized);

  expect(serialized.startsWith("0x76")).toBe(true);
  expect(deserialized.calls).toEqual([{ to: usdc, data: transferData }]);
  expect(deserialized.feeToken).toBe(usdc);
  expect(deserialized.chainId).toBe(4217);
});

// What `alln mpp fetch` signs when the service sponsors the fee. The envelope
// carries the 0x78 fee-payer prefix and no fee token, because the sender does
// not commit to a fee it is not paying. Privy's own signer could not express
// this, which is why the adapter serializes through viem instead.
test("serializes a sponsored transaction as a fee-payer envelope", async () => {
  const { serialized } = await signLike({ ...prepared, feePayer: true, from: recipient });

  expect(serialized.startsWith("0x78")).toBe(true);
  expect(Transaction.deserialize(serialized).feeToken).toBeUndefined();
});

// viem's Tempo serializer derives the call list from to/data/value whenever the
// prepared transaction carries no calls of its own.
test("derives a single call from a plain to/data/value request", async () => {
  const { serialized } = await signLike({
    ...prepared,
    calls: [],
    to: recipient,
    value: 10_000_000n,
  });

  expect(Transaction.deserialize(serialized).calls).toEqual([
    { to: recipient.toLowerCase(), value: 10_000_000n },
  ]);
});
