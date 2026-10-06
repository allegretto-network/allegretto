import { expect, test } from "vite-plus/test";
import { feeTokenSchema, readFeeToken, requireFeeToken } from "../src/lib/token.ts";

const usdc = "0x20c000000000000000000000b9537d11c60e8b50";

test("--fee-token accepts a token address and stays optional", () => {
  expect(feeTokenSchema.parse(usdc)).toBe(usdc);
  expect(feeTokenSchema.parse(undefined)).toBeUndefined();
});

test("--fee-token rejects anything that is not an address", () => {
  // A symbol would be friendlier, but the transaction field takes an address.
  expect(() => feeTokenSchema.parse("usdc")).toThrow();
  expect(() => feeTokenSchema.parse(usdc.slice(0, 20))).toThrow();
  expect(() => feeTokenSchema.parse(`${usdc}00`)).toThrow();
});

// commander hands the action camelCased opts while the schema key stays
// hyphenated, so the reader is what bridges the two.
test("reads the camelCased flag commander actually sets", () => {
  expect(readFeeToken({ feeToken: usdc })).toBe(usdc);
  expect(readFeeToken({ "fee-token": usdc })).toBeUndefined();
  expect(readFeeToken({})).toBeUndefined();
});

// requireFeeToken passes undefined straight through — the flag is optional and
// its absence means Tempo's own preference rules apply.
test("requireFeeToken passes undefined without calling the RPC", async () => {
  await expect(requireFeeToken(undefined)).resolves.toBeUndefined();
});
