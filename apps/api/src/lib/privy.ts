import { PRIVY_APP_ID } from "@allegretto-network/core";
import type { Context } from "hono";
import { problemDetails } from "hono-problem-details";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { PrivyClient } from "@privy-io/node";
import type { Env } from "../env";

// Server-side client for Privy API operations that need the app secret
// (users, wallets). Token verification below does not go through it: the
// SDK's verifyAccessToken enforces the `privy.io` issuer, which rejects the
// CLI device flow's `privy:<app id>` tokens — the only client of the storage
// route — so verification uses jose (the SDK's own JWT library) with both
// issuers accepted.
export function createPrivyClient(appId: string, appSecret: string, apiUrl?: string) {
  return new PrivyClient({ appId, appSecret, apiUrl });
}

// Privy publishes each app's verification keys at
// api.privy.io/v1/apps/<app id>/jwks.json — public, unauthenticated, ES256
// EC JWKs. jose's remote JWKS caches keys per isolate and refetches on
// rotation (a token with an unknown kid triggers a refresh).
const PRIVY_JWKS_URL = `https://api.privy.io/v1/apps/${PRIVY_APP_ID}/jwks.json`;

// Overridable so tests can serve their own JWKS from a local server; the
// default hits the real Privy endpoint.
let jwksUrlOverride: string | null = null;

export function setPrivyJwksUrl(url: string | null): void {
  jwksUrlOverride = url;
}

const jwksByUrl = new Map<string, JWTVerifyGetKey>();

function jwksFor(url: string): JWTVerifyGetKey {
  const cached = jwksByUrl.get(url);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(url));
  jwksByUrl.set(url, jwks);
  return jwks;
}

export type PrivyClaims = { sub: string };

// Signature, algorithm, issuer, audience, and expiry are all checked by jose;
// every failure path returns null so callers answer a single 401.
export async function verifyPrivyToken(
  token: string,
  jwksUrl: string = PRIVY_JWKS_URL,
): Promise<PrivyClaims | null> {
  return jwtVerify(token, jwksFor(jwksUrl), {
    algorithms: ["ES256"],
    // Browser flows issue `privy.io`; the CLI's device flow issues
    // `privy:<app id>` — accept both.
    issuer: ["privy.io", `privy:${PRIVY_APP_ID}`],
    audience: PRIVY_APP_ID,
  })
    .then((result) => (typeof result.payload.sub === "string" ? { sub: result.payload.sub } : null))
    .catch(() => null);
}

/** Answers 401 for anything but a valid Privy access token; returns its user id. */
export async function requirePrivyUser(c: Context<Env>): Promise<string> {
  const token = c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  const claims = token ? await verifyPrivyToken(token, jwksUrlOverride ?? PRIVY_JWKS_URL) : null;
  if (!claims)
    throw problemDetails({
      status: 401,
      title: "Unauthorized",
      detail: "A valid Privy access token is required.",
      type: "Auth",
    });

  return claims.sub;
}
