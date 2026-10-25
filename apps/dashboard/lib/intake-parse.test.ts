import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCustomer, parseRecurrence } from "./intake-parse.ts";

test("recurrence phrases map to days", () => {
  assert.equal(parseRecurrence("10 dining tables every 2 weeks"), 14);
  assert.equal(parseRecurrence("5 chairs every week"), 7);
  assert.equal(parseRecurrence("order weekly"), 7);
  assert.equal(parseRecurrence("every 3 days"), 3);
  assert.equal(parseRecurrence("monthly delivery"), 30);
  assert.equal(parseRecurrence("every 1 month"), 30);
});

test("no recurrence when none is stated", () => {
  assert.equal(parseRecurrence("10 dining tables due in 14 days"), null);
  assert.equal(parseRecurrence("every 400 days"), null);
});

test("customer needs a capitalised name after 'for'", () => {
  assert.equal(parseCustomer("25 bookshelves for Acme Corp due in 12 days"), "Acme Corp");
  assert.equal(parseCustomer("chairs for Northwind"), "Northwind");
  assert.equal(parseCustomer("10 tables for next week"), null);
});
