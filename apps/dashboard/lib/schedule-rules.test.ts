import { test } from "node:test";
import assert from "node:assert/strict";
import { pickOrdersToStart } from "./schedule-rules.ts";

const q = [
  { id: "a", priority: 0 },
  { id: "b", priority: 0 },
  { id: "c", priority: 0 },
];

test("fills the days remaining slots in order", () => {
  assert.deepEqual(pickOrdersToStart(q, 2, 0), ["a", "b"]);
  assert.deepEqual(pickOrdersToStart(q, 2, 1), ["a"]);
  assert.deepEqual(pickOrdersToStart(q, 2, 2), []);
});

test("limit 0 starts nothing except urgent orders", () => {
  assert.deepEqual(pickOrdersToStart(q, 0, 0), []);
  assert.deepEqual(pickOrdersToStart([{ id: "u", priority: 2 }, ...q], 0, 0), ["u"]);
});

test("urgent orders use up slots", () => {
  assert.deepEqual(pickOrdersToStart([{ id: "u", priority: 2 }, ...q], 2, 0), ["u", "a"]);
});
