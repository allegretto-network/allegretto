import { expect, test } from "vite-plus/test";
import { toWallet } from "../src/privy.ts";

test("maps the Privy Ethereum wallet onto an Allegretto wallet", () => {
  expect(toWallet({ id: "wallet_1", address: "0xabc", chain_type: "ethereum" })).toEqual({
    id: "wallet_1",
    address: "0xabc",
  });
});

test("drops wallets on chain types Allegretto does not use", () => {
  expect(toWallet({ id: "wallet_2", address: "9wtG", chain_type: "solana" })).toBeNull();
  expect(toWallet({ id: "wallet_3", address: "T9yD", chain_type: "tron" })).toBeNull();
});
