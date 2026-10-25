import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, formatCompact } from "./currency.ts";

const usd = { currency: "USD" as const, usdToInr: 83 };
const inr = { currency: "INR" as const, usdToInr: 83 };

test("dollars", () => {
  assert.equal(formatMoney(1234.5, usd), "$1,234.50");
  assert.equal(formatMoney(null, usd), "-");
});

test("rupees convert and group the Indian way", () => {
  assert.equal(formatMoney(10, inr), "₹830.00");
  assert.equal(formatMoney(15000, inr), "₹12,45,000.00");
});

test("compact", () => {
  assert.equal(formatCompact(1500, usd), "$1.5K");
  assert.equal(formatCompact(1500, inr), "₹1.2L");
  assert.equal(formatCompact(-2_000_000, usd), "-$2M");
});
