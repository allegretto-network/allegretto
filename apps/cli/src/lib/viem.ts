import type { Wallet } from "@allegretto-network/core";
import {
  type Address,
  type Hex,
  type LocalAccount,
  numberToHex,
  type Transport,
  zeroAddress,
} from "viem";
import { toAccount } from "viem/accounts";
import { Chain, type Client, createClient, TokenId, type Transaction } from "viem/tempo";
import { CliError } from "../utils/errors.ts";
import {
  walletRpc,
  type WalletSession,
  walletSignatureSchema,
  walletSignedTransactionSchema,
} from "./privy.ts";
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
// (nonce, gas, fee estimation) and broadcasting against Tempo's own RPC, which
// keeps `sendTransactionSync` and custom-error decoding working; Privy only
// signs. Writes pass `type: "tempo"` so Privy signs a Tempo envelope (TIP-76,
// type 118) rather than a plain EIP-1559 transaction.
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

    async signTransaction(transaction) {
      const response = await walletRpc(session, wallet.id, {
        method: "eth_signTransaction",
        params: {
          transaction: toPrivyTransaction(transaction as Transaction.TransactionSerializable),
        },
      });

      return walletSignedTransactionSchema.parse(response).data.signed_transaction as Hex;
    },
  });
}

// Tempo's own type, per TIP-76. Privy's schema takes it as a number.
const TEMPO_TRANSACTION_TYPE = 118;

// Privy's transaction schema has no type-3 (blob) equivalent.
const transactionTypes = {
  legacy: 0,
  eip2930: 1,
  eip1559: 2,
  eip4844: undefined,
  eip7702: 4,
  tempo: TEMPO_TRANSACTION_TYPE,
} as const;

// Privy's transaction schema is snake_case and rejects unknown keys, so viem's
// camelCase fields are mapped across explicitly.
export function toPrivyTransaction(transaction: Transaction.TransactionSerializable) {
  // Privy's schema carries neither access_list nor authorization_list, so these
  // would be silently dropped and a different transaction signed than the one
  // that was prepared. Checked by field rather than by type because every
  // non-legacy type can carry an access list.
  if (transaction.accessList?.length)
    throw new CliError(
      "WALLET_RPC_FAILED",
      "Access lists are not supported by the Privy wallet adapter.",
      "Send this transaction without an access list.",
    );
  if (transaction.authorizationList?.length)
    throw new CliError(
      "WALLET_RPC_FAILED",
      "eip7702 authorization lists are not supported by the Privy wallet adapter.",
      "Send this transaction without an authorization list.",
    );

  const quantity = (value: bigint | number | undefined) =>
    value === undefined ? undefined : numberToHex(value);

  const shared = {
    chain_id: transaction.chainId,
    nonce: transaction.nonce,
    gas_limit: quantity(transaction.gas),
    max_fee_per_gas: quantity(transaction.maxFeePerGas),
    max_priority_fee_per_gas: quantity(transaction.maxPriorityFeePerGas),
  };

  if (transaction.type === "tempo")
    return {
      ...shared,
      type: TEMPO_TRANSACTION_TYPE,
      // A Tempo transaction carries a list of calls instead of one
      // to/data/value triple. The list is derived the way viem's own Tempo
      // serializer derives it — an empty list counts as absent — so Privy
      // signs the transaction viem prepared and estimated gas for.
      calls: (transaction.calls?.length ? transaction.calls : [toCall(transaction)]).map(
        (call) => ({
          to: call.to,
          data: call.data ?? "0x",
          value: quantity(call.value),
        }),
      ),
      // Tempo has no native gas token: fees come out of a TIP-20, chosen here
      // or by Tempo's fee-token preference rules when left unset.
      fee_token:
        transaction.feeToken === undefined ? undefined : TokenId.toAddress(transaction.feeToken),
      nonce_key: quantity(transaction.nonceKey),
      valid_before: transaction.validBefore,
      valid_after: transaction.validAfter,
    };

  return {
    ...shared,
    to: transaction.to ?? undefined,
    data: transaction.data,
    value: quantity(transaction.value),
    type: transaction.type ? transactionTypes[transaction.type] : undefined,
    gas_price: quantity(transaction.gasPrice),
  };
}

// viem only fills `calls` when the caller passes them, and sends a plain
// to/data/value request otherwise; its serializer substitutes the zero address
// for a value transfer with no recipient.
function toCall(transaction: Transaction.TransactionSerializable) {
  return {
    to: transaction.to ?? (transaction.data && transaction.data !== "0x" ? undefined : zeroAddress),
    data: transaction.data,
    value: transaction.value,
  };
}
