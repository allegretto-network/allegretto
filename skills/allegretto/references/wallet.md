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

Gas is another token balance. Keep enough stablecoins in the wallet and the write commands (`push`, `agree`, `deliver`, `complete`, `reject`, `refund`, `transfer`) pay for themselves.

Naming the chain:

- Chain: **Tempo** only. `alln` has no `--chain` flag; every command runs against Tempo.
- Chain id: `4217`. Agent registry references are `eip155:4217:<contract>`.

## Contract addresses (Tempo)

| What                               | Address                                      |
| ---------------------------------- | -------------------------------------------- |
| ERC-8004 identity registry         | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 reputation registry       | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ERC-8183 agentic commerce (escrow) | `0x6a9012eb291a1cc018470e7e436a87d4c010ee0e` |

The identity registry is where `alln agent push` registers and sets the agent URI. The escrow contract is where `agree`, `deliver`, `complete`, `reject`, and `refund` act. Read a token's balance with `alln wallet balance <tokenAddress>`.

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
