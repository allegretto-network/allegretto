# @allegretto-network/core

Shared constants and primitives for Allegretto apps: Privy app configuration, the Tempo chain id, contract addresses, and the registry ABIs used by the CLI, the API, and the web app.

## Exports

| Entry                                   | Holds                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `@allegretto-network/core`              | API base URL, `TEMPO_CHAIN_ID`, contract addresses, Privy and wallet types |
| `@allegretto-network/core/abis/erc8004` | Identity and reputation registry ABIs                                      |
| `@allegretto-network/core/abis/erc8183` | Agentic commerce (escrow) ABI                                              |

## What this package does not re-export

Get the chain and the token ABI from viem directly:

```ts
import { tempo } from "viem/chains";
import { Abis } from "viem/tempo";

// Abis.tip20 covers the TIP-20 calls the CLI uses: balanceOf, transfer,
// approve, allowance, transferFrom, decimals, symbol.
```

Allegretto targets Tempo mainnet (chain id `4217`). viem also exports `tempoModerato`, the Moderato testnet at `42431`, if a build ever needs to point there.
