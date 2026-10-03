import { z } from "zod";
import type { Wallet } from "./wallet";

// Public client identifier; the app secret never ships with clients.
export const PRIVY_APP_ID = "cmup54h2i01j80di4xu0x0fet";

export const PRIVY_AUTH_ORIGIN = "https://auth.privy.io";

// Privy's OAuth surface for device-authorized agents. Wallet requests made with
// a device-code grant are scoped to the authorizing user's own wallets, so this
// path needs neither the app secret nor a backend proxy.
export const PRIVY_OAUTH_PATH = "/api/oauth/v2";
export const PRIVY_GRANT_TYPE_DEVICE_CODE = "device_code";

export const privyWalletSchema = z.object({
  id: z.string(),
  address: z.string(),
  // Privy issues one embedded wallet per chain type and supports chains
  // Allegretto does not, so this stays a plain string and unsupported wallets
  // drop out during mapping.
  chain_type: z.string(),
});

export type PrivyWallet = z.infer<typeof privyWalletSchema>;

// Allegretto is EVM-only, so it uses the ethereum wallet and ignores the rest.
const EVM_CHAIN_TYPE = "ethereum";

// Returns null for wallets on any chain type but Ethereum, such as Privy's
// Solana, Tron, or XRPL wallets.
export function toWallet(wallet: PrivyWallet): Wallet | null {
  if (wallet.chain_type !== EVM_CHAIN_TYPE) return null;

  return { id: wallet.id, address: wallet.address };
}
