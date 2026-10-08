import http from "node:http";
import { expect, test } from "vite-plus/test";
import { PRIVY_APP_ID } from "@allegretto-network/core";
import { verifyPrivyToken, type PrivyClaims } from "../src/lib/privy.ts";

// Real local HTTP server stands in for Privy's JWKS endpoint: jose's remote
// JWKS fetch runs for real, only the remote end is ours.
async function withJwksServer<T>(keys: unknown[], run: (url: string) => Promise<T>): Promise<T> {
  const server = http.createServer((request, response) => {
    if (request.url === "/jwks") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ keys }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");

  try {
    return await run(`http://127.0.0.1:${address.port}/jwks`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// WebCrypto only, so the tests run under Node and workerd alike. generateKey
// and exportKey return unions in @types/node, so the helper narrows to the
// shapes the test actually uses.
async function makeSigningKey(kid: string) {
  const generated = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  if (!("publicKey" in generated)) throw new Error("expected a key pair");

  const exported = await crypto.subtle.exportKey("jwk", generated.publicKey);
  const jwk = exported instanceof ArrayBuffer ? null : exported;
  if (jwk === null || jwk.x === undefined || jwk.y === undefined)
    throw new Error("expected a jwk export");

  return {
    privateKey: generated.privateKey,
    jwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, kid, alg: "ES256" },
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signToken(privateKey: CryptoKey, claims: Record<string, unknown>, kid: string) {
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid })));
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  // JOSE ES256 signatures are raw r||s, which is what WebCrypto emits and
  // jose accepts directly.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );

  return `${header}.${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function verify(token: string, keys: unknown[]): Promise<PrivyClaims | null> {
  let result: PrivyClaims | null = null;
  await withJwksServer(keys, async (url) => {
    result = await verifyPrivyToken(token, url);
  });
  return result;
}

// The CLI device flow is the storage route's only client, and its tokens carry
// the `privy:<app id>` issuer — the case the official SDK's verifier rejects
// with its strict `privy.io` issuer check.
test("accepts a CLI-style token: privy:<app id> issuer, app audience", async () => {
  const pair = await makeSigningKey("test-key");
  const token = await signToken(
    pair.privateKey,
    {
      sub: "did:privy:user-1",
      exp: Math.floor(Date.now() / 1000) + 60,
      iss: `privy:${PRIVY_APP_ID}`,
      aud: PRIVY_APP_ID,
    },
    pair.jwk.kid,
  );

  await expect(verify(token, [pair.jwk])).resolves.toMatchObject({
    sub: "did:privy:user-1",
  });
});

test("accepts a browser-style token with the privy.io issuer", async () => {
  const pair = await makeSigningKey("test-key");
  const token = await signToken(
    pair.privateKey,
    {
      sub: "user-2",
      exp: Math.floor(Date.now() / 1000) + 60,
      iss: "privy.io",
      aud: [PRIVY_APP_ID],
    },
    pair.jwk.kid,
  );

  await expect(verify(token, [pair.jwk])).resolves.toMatchObject({ sub: "user-2" });
});

test("selects the matching key from a multi-key JWKS", async () => {
  const other = await makeSigningKey("other-key");
  const pair = await makeSigningKey("test-key");
  const token = await signToken(
    pair.privateKey,
    {
      sub: "user-3",
      exp: Math.floor(Date.now() / 1000) + 60,
      iss: "privy.io",
      aud: PRIVY_APP_ID,
    },
    pair.jwk.kid,
  );

  await expect(verify(token, [other.jwk, pair.jwk])).resolves.toMatchObject({ sub: "user-3" });
});

test("rejects an expired token", async () => {
  const pair = await makeSigningKey("test-key");
  const token = await signToken(
    pair.privateKey,
    {
      sub: "user",
      exp: Math.floor(Date.now() / 1000) - 10,
      iss: "privy.io",
      aud: PRIVY_APP_ID,
    },
    pair.jwk.kid,
  );

  await expect(verify(token, [pair.jwk])).resolves.toBeNull();
});

test("rejects a token whose kid is not in the JWKS", async () => {
  const pair = await makeSigningKey("test-key");
  const token = await signToken(
    pair.privateKey,
    {
      sub: "user",
      exp: Math.floor(Date.now() / 1000) + 60,
      iss: "privy.io",
      aud: PRIVY_APP_ID,
    },
    "unknown-kid",
  );

  await expect(verify(token, [pair.jwk])).resolves.toBeNull();
});

test("rejects a token whose payload was tampered with", async () => {
  const pair = await makeSigningKey("test-key");
  const token = await signToken(
    pair.privateKey,
    {
      sub: "user",
      exp: Math.floor(Date.now() / 1000) + 60,
      iss: "privy.io",
      aud: PRIVY_APP_ID,
    },
    pair.jwk.kid,
  );
  const [header, , signature] = token.split(".");
  const forgedPayload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: "attacker",
        exp: Math.floor(Date.now() / 1000) + 60,
        iss: "privy.io",
        aud: PRIVY_APP_ID,
      }),
    ),
  );

  await expect(verify(`${header}.${forgedPayload}.${signature}`, [pair.jwk])).resolves.toBeNull();
});

test("rejects a token issued for a different app", async () => {
  const pair = await makeSigningKey("test-key");
  const token = await signToken(
    pair.privateKey,
    {
      sub: "user",
      exp: Math.floor(Date.now() / 1000) + 60,
      iss: "privy.io",
      aud: "someone-elses-app",
    },
    pair.jwk.kid,
  );

  await expect(verify(token, [pair.jwk])).resolves.toBeNull();
});

test("rejects a token with a foreign issuer", async () => {
  const pair = await makeSigningKey("test-key");
  const token = await signToken(
    pair.privateKey,
    {
      sub: "user",
      exp: Math.floor(Date.now() / 1000) + 60,
      iss: "attacker.example",
      aud: PRIVY_APP_ID,
    },
    pair.jwk.kid,
  );

  await expect(verify(token, [pair.jwk])).resolves.toBeNull();
});

test("rejects a malformed token string", async () => {
  const pair = await makeSigningKey("test-key");

  await expect(verify("not-a-jwt", [pair.jwk])).resolves.toBeNull();
  await expect(verify("", [pair.jwk])).resolves.toBeNull();
});
