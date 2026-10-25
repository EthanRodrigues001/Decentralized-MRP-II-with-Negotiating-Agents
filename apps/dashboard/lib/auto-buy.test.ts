import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePurchase, type PurchaseDecisionInput } from "./auto-buy.ts";

const base: PurchaseDecisionInput = {
  shortfall: 150,
  onOrder: 0,
  threshold: 200,
  autoBuyEnabled: true,
  estimatedCost: 1000,
  spentTodayAuto: 0,
  maxAutoSpendPerDay: 50000,
};

test("shortfall at or below threshold auto-buys", () => {
  assert.equal(decidePurchase(base).action, "auto");
  assert.equal(decidePurchase({ ...base, shortfall: 200 }).action, "auto");
});

test("shortfall above threshold needs approval", () => {
  const d = decidePurchase({ ...base, shortfall: 201 });
  assert.equal(d.action, "needs_approval");
  assert.equal(d.qty, 201);
});

test("stock already on order counts as supply (no double buy)", () => {
  const d = decidePurchase({ ...base, shortfall: 150, onOrder: 150 });
  assert.equal(d.action, "none");
  const partial = decidePurchase({ ...base, shortfall: 150, onOrder: 100 });
  assert.equal(partial.action, "auto");
  assert.equal(partial.qty, 50);
});

test("on-order can bring an oversized shortfall under the threshold", () => {
  const d = decidePurchase({ ...base, shortfall: 300, onOrder: 150 });
  assert.equal(d.action, "auto");
  assert.equal(d.qty, 150);
});

test("disabled auto-buy always needs approval", () => {
  assert.equal(decidePurchase({ ...base, autoBuyEnabled: false }).action, "needs_approval");
});

test("daily spend cap forces approval", () => {
  const d = decidePurchase({ ...base, spentTodayAuto: 49500, estimatedCost: 1000 });
  assert.equal(d.action, "needs_approval");
});

test("no shortfall does nothing", () => {
  assert.equal(decidePurchase({ ...base, shortfall: 0 }).action, "none");
});

test("threshold is configurable", () => {
  assert.equal(decidePurchase({ ...base, shortfall: 300, threshold: 500 }).action, "auto");
});
