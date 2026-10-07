import type { Wallet } from "@allegretto-network/core";
import { type Address, type Hex, keccak256, type LocalAccount, parseSignature } from "viem";
import type { Transport } from "viem";
import { toAccount } from "viem/accounts";
import { Chain, type Client, createClient } from "viem/tempo";
import { walletRpc, type WalletSession, walletSignatureSchema } from "./privy.ts";
import { requireWallet } from "./session.ts";

// The Tempo client's inferred type is too large for TypeScript to serialize, so
// every client is annotated with this alias.
type TempoClient<account extends LocalAccount | undefined = undefined> = Client<
  Transport,
  typeof Chain.tempo,
  account
>;

/**
 * viem/tempo's createClient defaults to the Tempo mainnet chain and an http
 * transport, and decorates one client with public, wallet, and Tempo actions.
 * Reads, receipt waits, and Tempo-native actions (`token`, `dex`, `fee`, …) all
 * go through this single instance so the transport can batch and dedupe.
 */
export const tempoClient: TempoClient = createClient();

/** The same Tempo client, signing and sending as the session's wallet. */
export function walletClient(
  session: WalletSession,
  wallet: Wallet = requireWallet(session),
): TempoClient<LocalAccount> {
  return createClient({ account: toWalletAccount(session, wallet) });
}

// Exposing the wallet as a viem account means viem owns transaction preparation
// (nonce, gas, fee estimation), serialization, and broadcasting against Tempo's
// own RPC, which keeps `sendTransactionSync` and custom-error decoding working;
// Privy only produces signatures.
export function toWalletAccount(session: WalletSession, wallet: Wallet) {
  const sign = async (body: object) =>
    walletSignatureSchema.parse(await walletRpc(session, wallet.id, body)).data.signature as Hex;

  return toAccount({
    address: wallet.address as Address,

    async signMessage({ message }) {
      const params =
        typeof message === "string"
          ? { message, encoding: "utf-8" }
          : {
              message:
                typeof message.raw === "string"
                  ? message.raw
                  : `0x${Buffer.from(message.raw).toString("hex")}`,
              encoding: "hex",
            };

      return sign({ method: "personal_sign", params });
    },

    async signTypedData({ domain, types, primaryType, message }) {
      return sign({
        method: "eth_signTypedData_v4",
        params: { typed_data: { domain, types, message, primary_type: primaryType } },
      });
    },

    /**
     * Signs the hash of the serialized transaction and hands the signature back
     * to viem's serializer, rather than asking Privy to serialize.
     *
     * Privy's `eth_signTransaction` re-encodes the transaction from its own
     * snake_case schema, which has no field for Tempo's fee-payer marker. A
     * sponsored charge (`feePayer: true`) must be serialized with the `0x78`
     * magic prefix and a `0x00` sender placeholder (TIP-76); Privy always
     * emitted a plain `0x76` envelope instead, so a sponsored payment produced
     * a signature over the wrong payload and the service rejected it as
     * unverifiable. Signing the digest keeps envelope construction in viem,
     * which does know about sponsorship.
     */
    async signTransaction(transaction, options) {
      // Tempo's chain supplies the type-118 serializer; it is the same function
      // viem's own Tempo accounts sign through.
      const serialize = (options?.serializer ??
        Chain.tempo.serializers.transaction) as typeof Chain.tempo.serializers.transaction;
      // viem types the transaction as a union spanning every chain's shape,
      // which hides the Tempo fee-payer fields read below.
      const tempoTransaction = transaction as Parameters<typeof serialize>[0] & {
        feePayerSignature?: unknown;
      };

      // A pre-filled fee-payer signature is not part of what the sender signs:
      // null marks the envelope as awaiting sponsorship so the digest matches
      // the one the fee payer later countersigns.
      const payload = await serialize(
        tempoTransaction.feePayerSignature
          ? { ...tempoTransaction, feePayerSignature: null }
          : tempoTransaction,
      );

      return serialize(
        tempoTransaction,
        parseSignature(
          walletSignatureSchema.parse(
            await walletRpc(session, wallet.id, {
              method: "secp256k1_sign",
              params: { hash: keccak256(payload) },
            }),
          ).data.signature as Hex,
        ),
      );
    },
  });
}
