import type { Wallet } from "@allegretto-network/core";
import { CliError } from "../utils/errors.ts";
import { getValidAccessToken } from "./credentials.ts";
import { decodeAccessTokenClaims } from "./jwt.ts";
import { openWalletSession, type WalletSession } from "./privy.ts";

export async function requireAccessToken(): Promise<string> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new CliError("NOT_LOGGED_IN", "Not logged in.", "Run `alln auth login`.");

  return accessToken;
}

export async function openSession(): Promise<WalletSession> {
  return openWalletSession(await requireAccessToken());
}

export function requireWallet(session: WalletSession): Wallet {
  const wallet = session.wallets[0];
  if (!wallet)
    throw new CliError(
      "WALLET_NOT_FOUND",
      "This account has no embedded wallet.",
      "Create one by signing in to the Allegretto app, then run this command again.",
    );

  return wallet;
}

export async function requireUserId(): Promise<string> {
  return decodeAccessTokenClaims(await requireAccessToken()).sub;
}
