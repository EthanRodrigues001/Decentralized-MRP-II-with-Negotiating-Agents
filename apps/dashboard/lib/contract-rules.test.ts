import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContract, contractHealth, type ContractTerms } from "./contract-rules.ts";

const c: ContractTerms = {
  id: "c1",
  supplier: "Alpha_Inc",
  unitPrice: 10,
  minQty: 10,
  maxQty: 500,
  leadTimeDays: 7,
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  status: "active",
};

test("valid contract passes", () => {
  assert.deepEqual(checkContract(c, 100, "2026-10-24"), { ok: true });
});

test("boundaries are inclusive", () => {
  assert.equal(checkContract(c, 10, "2026-01-01").ok, true);
  assert.equal(checkContract(c, 500, "2026-12-31").ok, true);
});

test("expired, not yet valid and terminated are rejected with a reason", () => {
  assert.match((checkContract(c, 100, "2027-01-01") as { reason: string }).reason, /expired/);
  assert.match((checkContract(c, 100, "2025-12-31") as { reason: string }).reason, /not valid until/);
  assert.match((checkContract({ ...c, status: "terminated" }, 100, "2026-10-24") as { reason: string }).reason, /terminated/);
});

test("quantity outside the contract range is rejected", () => {
  assert.match((checkContract(c, 501, "2026-10-24") as { reason: string }).reason, /above the contract maximum/);
  assert.match((checkContract(c, 9, "2026-10-24") as { reason: string }).reason, /below the contract minimum/);
});

test("health flags expiring contracts within 30 days", () => {
  assert.equal(contractHealth(c, "2026-10-24"), "active");
  assert.equal(contractHealth(c, "2026-12-10"), "expiring");
  assert.equal(contractHealth(c, "2027-01-02"), "expired");
});
