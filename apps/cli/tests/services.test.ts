import { expect, test } from "vite-plus/test";
import { formatPrice } from "../src/lib/services.ts";

// The payment fields formatPrice ignores; every catalog entry carries them.
const base = { intent: "charge", method: "tempo/charge", currency: "0x1", decimals: 6 };

// Catalog prices are advisory dollars: every MPP currency is a USD stablecoin.
test("catalog prices read as dollars, free endpoints say so", () => {
  expect(formatPrice(null)).toBe("free");
  expect(formatPrice(undefined)).toBe("free");

  expect(formatPrice({ ...base, amount: "50000" })).toBe("$0.05");
  expect(formatPrice({ ...base, amount: "50000", unitType: "request" })).toBe("$0.05/request");
});

test("metered endpoints show their hint or just say metered", () => {
  expect(formatPrice({ ...base, dynamic: true })).toBe("metered");
  expect(formatPrice({ ...base, dynamic: true, amountHint: "$0.001-$0.01/token" })).toBe(
    "$0.001-$0.01/token",
  );
});
