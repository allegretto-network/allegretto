import { expect, test } from "vite-plus/test";
import { assertWithinMaxAmount, toRequest } from "../src/lib/mpp.ts";
import { CliError } from "../src/utils/errors.ts";

// The shape describeChallenge returns; only the fields the amount guard reads
// are ever populated.
const challenge = {
  amount: "50000", // 0.05 at 6 decimals
  formatted: "0.05 USDC",
  decimals: 6,
  symbol: "USDC",
} as Parameters<typeof assertWithinMaxAmount>[0];

test("--max-amount admits a challenge at or under the ceiling", () => {
  expect(() => assertWithinMaxAmount(challenge, "0.05")).not.toThrow();
  expect(() => assertWithinMaxAmount(challenge, "1")).not.toThrow();
  expect(() => assertWithinMaxAmount(challenge, undefined)).not.toThrow();
});

test("--max-amount refuses a challenge over the ceiling", () => {
  try {
    assertWithinMaxAmount(challenge, "0.049999");
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe("MPP_AMOUNT_EXCEEDED");
  }
});

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
