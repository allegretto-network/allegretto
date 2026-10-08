import { createServer } from "node:http";
import { expect, test, afterAll } from "vite-plus/test";
import { Challenge } from "mppx";
import { toRequest, prepare, quoteEndpoint, callEndpoint } from "../src/lib/mpp.ts";
import { CliError } from "../src/utils/errors.ts";

test("repeated --query flags append in order", async () => {
  const request = await toRequest("https://api.example.com/v1/search", {
    query: ["b=2", "a=1", "q=hello world"],
  });

  expect(request.url).toBe("https://api.example.com/v1/search?b=2&a=1&q=hello+world");
});

// undici combines duplicate header names per HTTP, so an agent passing the
// same header twice gets one comma-joined value on the wire.
test("repeated --header flags combine instead of overwriting", async () => {
  const request = await toRequest("https://api.example.com/v1", {
    header: ["X-A: 1", "X-A: 2", "X-B: 3"],
  });

  expect(request.init.headers?.get("x-a")).toBe("1, 2");
  expect(request.init.headers?.get("x-b")).toBe("3");
});

test("a body implies POST the way curl does, JSON announcing itself", async () => {
  const json = await toRequest("https://api.example.com/v1", { data: '{"a":1}' });
  expect(json.init.method).toBe("POST");
  expect(json.init.body).toBe('{"a":1}');
  expect(json.init.headers?.get("content-type")).toBe("application/json");

  const text = await toRequest("https://api.example.com/v1", { data: "hello" });
  expect(text.init.method).toBe("POST");
  expect(text.init.headers?.get("content-type")).toBe("text/plain");
});

test("an explicit method survives even without a body", async () => {
  const request = await toRequest("https://api.example.com/v1", { method: "delete" });
  expect(request.init.method).toBe("DELETE");
});

test("--data and --form cannot both carry the body", async () => {
  await expect(
    toRequest("https://api.example.com/v1", { data: "{}", form: ["a=1"] }),
  ).rejects.toMatchObject({ code: "FLAG_CONFLICT" });
});

test("a malformed flag names what was expected", async () => {
  await expect(toRequest("https://api.example.com/v1", { header: ["X-A"] })).rejects.toMatchObject({
    code: "MPP_REQUEST_INVALID",
  });
  await expect(toRequest("ftp://example.com", {})).rejects.toMatchObject({
    code: "MPP_REQUEST_INVALID",
  });
});

// --- the money path: quote, --token selection, and the refusal to pay an
// unquoted currency ---

const pathUSD = "0x20c0000000000000000000000000000000000000";
const usdc = "0x20C000000000000000000000B9537D11C60E8B50";
const unquoted = "0x20c00000000000000000000014f22ca97301eb73";

// One tempo/charge Challenge as a real MPP endpoint raises it: the amount in
// base units of the currency it settles in.
function offer(currency: string, amount: string, id: string) {
  return Challenge.from({
    id,
    realm: "127.0.0.1",
    method: "tempo",
    intent: "charge",
    request: {
      amount,
      currency,
      decimals: 6,
      recipient: "0x0000000000000000000000000000000000000abc",
      description: "one weather reading",
    },
  });
}

// A 402 offering one Challenge per accepted currency, all in the single
// WWW-Authenticate header the Payment scheme merges them into.
const server = createServer((_request, response) => {
  const wwwAuthenticate = [
    Challenge.serialize(offer(pathUSD, "500000", "q-pathusd")),
    Challenge.serialize(offer(usdc, "300000", "q-usdc")),
  ].join(", ");
  response.writeHead(402, { "www-authenticate": wwwAuthenticate });
  response.end();
});

const endpoint = await new Promise<string>((resolve) => {
  server.listen(0, "127.0.0.1", () =>
    resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`),
  );
});
afterAll(() => server.close());

test("quote lists every offered price and pays nothing", async () => {
  const { endpoint: url, quotes } = await quoteEndpoint(endpoint, {});

  expect(url).toBe(`${endpoint}/`);
  expect(quotes.map((quote) => [quote.amount, quote.currency])).toEqual([
    ["500000", pathUSD],
    ["300000", usdc],
  ]);
  // The chain knows these currencies' symbols; the amounts must not move.
  expect(quotes.map((quote) => quote.formatted)).toMatchObject([
    expect.stringMatching(/^0\.5/),
    expect.stringMatching(/^0\.3/),
  ]);
});

test("fetch --token refuses a currency the endpoint does not quote", async () => {
  const error = await callEndpoint(endpoint, { token: unquoted }).catch((error: CliError) => error);
  if (!(error instanceof CliError)) throw new Error("Expected the call to fail.");

  expect(error.code).toBe("MPP_TOKEN_NOT_ACCEPTED");
  expect(error.recovery).toContain("0.5");
  expect(error.recovery).toContain("0.3");
});

// Mixed case on purpose: selection compares currencies lowercased.
test("fetch --token selects the matching Challenge for pay", async () => {
  const { payment } = await prepare(endpoint, { token: usdc });
  expect(payment?.id).toBe("q-usdc");
});

test("without --token the endpoint's own first offer stands", async () => {
  const { payment } = await prepare(endpoint, {});
  expect(payment?.id).toBe("q-pathusd");
});
