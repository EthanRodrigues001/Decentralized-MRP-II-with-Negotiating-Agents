import { test } from "node:test";
import assert from "node:assert/strict";
import { explodeBom, grossQty, type BomLineInput } from "./bom-calc.ts";

const line = (over: Partial<BomLineInput>): BomLineInput => ({
  assembly: "Frame",
  materialId: "m1",
  sku: "MAT-X",
  name: "Part",
  unit: "pcs",
  qtyPerUnit: 1,
  scrapPct: 0,
  unitCost: 10,
  sort: 10,
  ...over,
});

test("gross quantity rounds up after scrap", () => {
  assert.equal(grossQty(10, 6, 3), 62); // 61.8
  assert.equal(grossQty(10, 0.5, 2), 6); // 5.1
  assert.equal(grossQty(1, 4, 0), 4);
});

test("float noise does not push an exact quantity up a whole unit", () => {
  assert.equal(grossQty(10, 0.1, 0), 1);
  assert.equal(grossQty(3, 0.1, 0), 1);
});

test("explode builds product, assembly and component rows with costs", () => {
  const { rows, totalCost, unitCost } = explodeBom(
    { sku: "FUR-1", name: "Table" },
    [
      line({ assembly: "Top", sku: "A", qtyPerUnit: 6, scrapPct: 3, unitCost: 42, sort: 10 }),
      line({ assembly: "Frame", sku: "B", qtyPerUnit: 4, unitCost: 18, sort: 20 }),
    ],
    10
  );
  assert.deepEqual(rows.map((r) => r.level), [0, 1, 2, 1, 2]);
  assert.equal(rows[2].grossQty, 62);
  assert.equal(rows[2].extCost, 62 * 42);
  assert.equal(rows[4].extCost, 40 * 18);
  assert.equal(totalCost, 62 * 42 + 40 * 18);
  assert.equal(rows[0].extCost, totalCost);
  assert.equal(unitCost, Number((totalCost / 10).toFixed(2)));
});

test("assembly subtotal equals the sum of its components", () => {
  const { rows } = explodeBom(
    { sku: "F", name: "F" },
    [line({ sku: "A", unitCost: 5, qtyPerUnit: 2, sort: 1 }), line({ sku: "B", unitCost: 7, qtyPerUnit: 1, sort: 2 })],
    3
  );
  assert.equal(rows[1].extCost, rows[2].extCost + rows[3].extCost);
});
