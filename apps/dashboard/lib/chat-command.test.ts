import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChatCommand, parsePriority } from "./chat-command.ts";

test("confirmations continue the order", () => {
  for (const t of ["ok", "OK.", "yes", "continue", "go ahead", "start production", "start", "approve"]) {
    assert.deepEqual(parseChatCommand(t), { kind: "continue" }, t);
  }
});

test("quantity changes", () => {
  assert.deepEqual(parseChatCommand("add one more table"), { kind: "amend", mode: "add", qty: 1 });
  assert.deepEqual(parseChatCommand("add 5 more"), { kind: "amend", mode: "add", qty: 5 });
  assert.deepEqual(parseChatCommand("3 more please"), { kind: "amend", mode: "add", qty: 3 });
  assert.deepEqual(parseChatCommand("make it 15"), { kind: "amend", mode: "set", qty: 15 });
  assert.deepEqual(parseChatCommand("change the quantity to 8"), { kind: "amend", mode: "set", qty: 8 });
});

test("finish, cancel, receive, status", () => {
  assert.deepEqual(parseChatCommand("production is done"), { kind: "finish" });
  assert.deepEqual(parseChatCommand("finished"), { kind: "finish" });
  assert.deepEqual(parseChatCommand("cancel this order"), { kind: "cancel" });
  assert.deepEqual(parseChatCommand("the delivery arrived"), { kind: "receive" });
  assert.deepEqual(parseChatCommand("what's the status"), { kind: "status" });
});

test("a plain new order is not a command", () => {
  assert.deepEqual(parseChatCommand("10 dining tables for Acme due in 14 days"), { kind: "none" });
  assert.deepEqual(parseChatCommand("3 foam padding"), { kind: "none" });
});

test("priority", () => {
  assert.equal(parsePriority("5 chairs urgent"), 2);
  assert.equal(parsePriority("5 chairs"), 0);
});
