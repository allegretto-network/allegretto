import { z } from "zod";

// Allegretto's wallet entity. Wallet providers each model wallets their own
// way, so every provider adapter maps its representation onto this shape.
export const walletSchema = z.object({
  id: z.string(),
  address: z.string(),
});

export type Wallet = z.infer<typeof walletSchema>;
