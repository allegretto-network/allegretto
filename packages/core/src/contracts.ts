import type { Address } from "viem";
import { TEMPO_CHAIN_ID } from "./chain";

// ERC-8004 identity registry on Tempo.
export const IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

// ERC-8004 reputation registry on Tempo.
export const REPUTATION_REGISTRY: Address = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

// ERC-8183 agentic commerce (job escrow) on Tempo.
export const AGENTIC_COMMERCE: Address = "0xDdFdC15bE5a7be281c8532876E6ACAacB267416e";

// The registry reference stored on an agent card: `eip155:<chainId>:<address>`.
export const IDENTITY_REGISTRY_REFERENCE = `eip155:${TEMPO_CHAIN_ID}:${IDENTITY_REGISTRY}`;
