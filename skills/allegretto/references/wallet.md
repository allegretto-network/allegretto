# Wallet and chain

## What a "wallet" is here

Every authenticated account gets a hosted embedded wallet. One EVM key signs for everything: identity, escrow, and transfers. There is no seed phrase to manage and no separate agent keypair — the wallet is tied to your Allegretto account, and `alln auth login` on a machine is what grants that machine access to it.

Credentials live in the OS keychain, keyed per account as `account-<user_id>`. `~/.allegretto/alln/config.json` records which account is active. Access tokens refresh automatically and the refresh token rotates on every use, so do not copy credentials between machines.

One account, one wallet. The same address is the client, the provider, the evaluator, and the registry owner — which is exactly why `alln agent job create` refuses when the target agent is provided by the same wallet.

## Funds

Tempo has no native token. Balances are TIP-20 tokens and gas is paid in USD-denominated stablecoins, so `balance` always takes a token address:

```sh
alln wallet balance <tokenAddress>
alln wallet transfer --token <address> --to <address> --amount 1.5
```

### TIP-20, not ERC-20

TIP-20 is Tempo's protocol-level token standard. It extends ERC-20 with memos, transfer policies, supply caps, pause controls, and the right to pay transaction fees, and the standard calls (`name`, `symbol`, `decimals`, `balanceOf`, `transfer`, `approve`, `allowance`, `transferFrom`) behave as they do on any EVM chain. The CLI only uses that shared set, through `Abis.tip20` from `viem/tempo`, so a plain ERC-20 deployed on Tempo works with every wallet and escrow command. Say "TIP-20" when naming a token on Tempo. Two differences that bite:

- TIP-20 decimals are `6`, not the `18` that OpenZeppelin ERC-20 contracts default to. Never assume; `transfer` and `set-budget` read `decimals()` and tell you to pass `--as-unit` when the read fails.
- Only a USD-denominated TIP-20 can pay gas. A wallet holding some other token can read the network but cannot write to it.

Job budgets settle in whichever payment token the provider picks from the escrow's whitelist; `alln agent job set-budget` requires `--token <address>`. Escrow pulls the token with `transferFrom`, so a client must _hold_ the budget **and** have approved it before `agree` can succeed. `alln agent job agree` runs the approval itself when the allowance is short, so you rarely approve by hand.

Amount formats to remember. `transfer` and `set-budget` take `--amount` in whole units like `1.5` unless `--as-unit` is passed. When the CLI cannot read a token's decimals, it says so and points at `--as-unit`.

Gas is another token balance. Keep enough stablecoins in the wallet and the write commands (`push`, `agree`, `deliver`, `complete`, `reject`, `refund`, `transfer`) pay for themselves. Every write also takes `--fee-token <address>` to pick which USD TIP-20 covers gas; left unset, Tempo chooses from the wallet's balances and falls back to pathUSD. An address that is not an unpaused, USD-denominated TIP-20 fails with `FEE_TOKEN_INVALID` before anything is signed. Known addresses are in [TIP-20 tokens](#tip-20-tokens).

Naming the chain:

- Chain: **Tempo** only. `alln` has no `--chain` flag; every command runs against Tempo.
- Chain id: `4217`. Agent registry references are `eip155:4217:<contract>`.

## Contract addresses (Tempo)

| What                               | Address                                      |
| ---------------------------------- | -------------------------------------------- |
| ERC-8004 identity registry         | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 reputation registry       | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ERC-8183 agentic commerce (escrow) | `0xDdFdC15bE5a7be281c8532876E6ACAacB267416e` |

The identity registry is where `alln agent push` registers and sets the agent URI. The escrow contract is where `agree`, `deliver`, `complete`, `reject`, and `refund` act. Read a token's balance with `alln wallet balance <tokenAddress>`.

### TIP-20 tokens

TIP-20 contracts share the `0x20c0` prefix and use 6 decimals, so a balance is never scaled by 18. `alln` resolves a token's symbol and decimals at runtime from viem's Tempo token list, which is the same list its `token` action reads, so these addresses work anywhere a `<tokenAddress>` is expected. The table lists the tokens on Tempo mainnet (chain 4217). The testnet set (chain 42431) is separate.

Payment and fee eligibility differ. `--fee-token` takes a USD-denominated token from this list that is not paused, and the command checks that before signing. A job budget can be any TIP-20 the escrow whitelists, and an MPP call settles in the currency its Challenge names, so payment is not limited to the USD rows.

| Token       | Name                    | Currency  | Address                                      |
| ----------- | ----------------------- | --------- | -------------------------------------------- |
| `pathUSD`   | PathUSD                 | USD       | `0x20c0000000000000000000000000000000000000` |
| `USDC.e`    | Bridged USDC (Stargate) | USD       | `0x20c000000000000000000000b9537d11c60e8b50` |
| `USDT0`     | USDT0                   | USD       | `0x20c00000000000000000000014f22ca97301eb73` |
| `USDe`      | USDe                    | USD       | `0x20c0000000000000000000002f52d5cc21a3207b` |
| `OUSD`      | OpenUSD                 | USD       | `0x20c0000000000000000000006a37DA5C996874BE` |
| `USD1`      | USD1                    | USD       | `0x20c000000000000000000000111111111e910f0f` |
| `USDB`      | USDBridge               | USD       | `0x20c0000000000000000000003158081efd85bfc2` |
| `cUSD`      | Cap USD                 | USD       | `0x20c0000000000000000000000520792dcccccccc` |
| `DLUSD`     | Deel USD                | USD       | `0x20c0000000000000000000006fd9a167923ba194` |
| `frxUSD`    | Frax USD                | USD       | `0x20c0000000000000000000003554d28269e0f3c2` |
| `GUSD`      | Generic USD             | USD       | `0x20c0000000000000000000005c0bac7cef389a11` |
| `iUSD`      | InfiniFi USD            | USD       | `0x20c000000000000000000000ab02d39df30bd17e` |
| `reUSD`     | Re Protocol reUSD       | USD       | `0x20c000000000000000000000383a23bacb546ab9` |
| `rUSD`      | Reservoir Stablecoin    | USD       | `0x20c0000000000000000000007f7ba549dd0251b9` |
| `SBC`       | Stable Coin             | USD       | `0x20c000000000000000000000ae247a1130450f09` |
| `BRLA`      | BRLA Token              | BRL       | `0x20c000000000000000000000f047dd7018e50367` |
| `cbBTC`     | Coinbase Wrapped BTC    | BTC       | `0x20c000000000000000000000c412ec89d0c08be5` |
| `CHFAU`     | AllUnity CHF            | CHF       | `0x20c00000000000000000000042109aef2f8b28e1` |
| `EURAU`     | AllUnity EUR            | EUR       | `0x20c0000000000000000000009a4a4b17e0dc6651` |
| `EURC.e`    | Bridged EURC (Stargate) | EUR       | `0x20c0000000000000000000001621e21f71cf12fb` |
| `GBPA`      | Agant GBP               | GBP       | `0x20c0000000000000000000000a6da882d075a4c3` |
| `sUSDe`     | Staked USDe             | sUSDe     | `0x20c000000000000000000000bd95bfb69fbe6ce3` |
| `siUSD`     | InfiniFi Staked USD     | siUSD     | `0x20c000000000000000000000048c8f36df1c9a4a` |
| `stcUSD`    | Staked Cap USD          | stcUSD    | `0x20c0000000000000000000008ee4fcff88888888` |
| `syrupUSDC` | Syrup USDC              | syrupUSDC | `0x20c0000000000000000000008191667423f70e67` |
| `wsrUSD`    | Wrapped Savings rUSD    | wsrUSD    | `0x20c000000000000000000000aeed2ec36a54d0e5` |

## Storage

`alln storage` is registered but unimplemented and exits `1` with `NOT_IMPLEMENTED`. The previous storage backend has been removed. Until a replacement lands, host the deliverable yourself and pass a 32-byte hash committing to it — a merkle root of the file works — to `alln agent job deliver`.

## On-chain agent facts

The API and the CLI expose the same profile. `alln agent profile <id> --onchain` returns the name, description, image, agent URI, owner address, feedback count, and creation time.

- **Owner** is the address that registered the agent — the wallet that ran `push`.
- **`registrations`** on a local card ties it to the owner's chain and registry: `{ agentId, agentRegistry }`. That pair is what makes `push` idempotent and `pull` able to match an onchain agent to a local card.
- **Metadata** may hold an `agentWallet` entry. When it is a valid address, that wallet is the **provider** paid by jobs; otherwise the agent's owner is. This is how an owner can direct the revenue from its agent to a different address — but the key must be set **on-chain**, and `alln` has no command for it. An agent published entirely through the CLI is paid at its owner address. Details, including the EIP-712 path for setting it out-of-band, are in [agent-card-shaping.md](agent-card-shaping.md#payment-routing-and-the-trap).
- **Feedback** accrues against the numeric onchain id, independently of which client paid or which token settled the job.

On-chain ids are shared across the network and are what every other party references. Local uuids never leave the machine.

## Reading the network without a wallet

`alln agent discover`, `alln agent profile --onchain`, and `alln agent service list --onchain` hit the Allegretto API, which indexes ERC-8004 registrations. They need no login and cost nothing. The same data is exposed to agent harnesses through the Allegretto MCP server as `search_agents`, `get_agent`, `list_agent_services`, `list_agent_feedbacks`, `list_jobs`, and `get_job` — but those are read-only. Anything that writes goes through `alln`.
