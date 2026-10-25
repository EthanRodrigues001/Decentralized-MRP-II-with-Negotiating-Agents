import { sql } from "@/lib/db";
import { addMessage } from "@/lib/negotiation-db";
import { drainEvents } from "@/lib/event-processor";
import { parseChatCommand, type ChatCommand } from "@/lib/chat-command";
import { amendOrder, transitionOrder, PRODUCTION_AGENT, INVENTORY_AGENT } from "@/lib/orders";
import { transitionPurchaseOrder } from "@/lib/purchasing";
import { cancelRequest, heldForRequest, issueRequest } from "@/lib/material-request";
import { matchProduct } from "@/lib/bom";
import { usableContracts, listContractsForMaterial, listContracts } from "@/lib/contracts";
import { emitEvent } from "@/lib/events";
import { unmetDemand } from "@/lib/orders";
import { randomUUID } from "node:crypto";
import { matchMaterial } from "@/lib/material-request";
import { HUMAN_AGENT } from "@/lib/types";

// What happens when you type into an existing chat. The thread is one order (or
// one material request); typed words are instructions about it. Deterministic:
// no LLM decides whether to start production or change a quantity.

interface PoRow {
  id: string;
  status: string;
  qty: number;
  material: string;
  unit: string;
  expected_at: string | null;
  supplier: string | null;
}

// Purchases this chat is waiting on: its own, plus any open purchase for a material it is
// short of (purchasing keeps one open approval per material, covering every chat that needs it).
export async function threadPurchases(thread: string): Promise<PoRow[]> {
  return (await sql`
    SELECT p.id, p.status, p.qty, m.name AS material, m.unit, p.expected_at::text AS expected_at, p.supplier
    FROM purchase_orders p JOIN materials m ON m.id = p.material_id
    WHERE p.status IN ('needs_approval', 'placed')
      AND (p.negotiation_id = ${thread}
        OR p.material_id IN (
          SELECT a.material_id FROM order_allocations a JOIN customer_orders o ON o.id = a.order_id
           WHERE o.negotiation_id = ${thread} AND o.status = 'awaiting_stock' AND a.reserved < a.required
          UNION
          SELECT n.material_id FROM negotiations n WHERE n.id = ${thread} AND n.status = 'in_progress' AND n.material_id IS NOT NULL))
    ORDER BY p.created_at
  `) as PoRow[];
}

async function approveAll(pos: PoRow[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of pos.filter((x) => x.status === "needs_approval" && x.supplier)) {
    try {
      await transitionPurchaseOrder(p.id, "approve");
      out.push(`Approved ${p.qty} ${p.unit} of ${p.material}.`);
    } catch (e) {
      out.push(`Could not approve ${p.material}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

async function receiveAll(thread: string): Promise<string[]> {
  const out: string[] = [];
  for (const p of (await threadPurchases(thread)).filter((x) => x.status === "placed")) {
    try {
      await transitionPurchaseOrder(p.id, "receive");
      out.push(`Received ${p.qty} ${p.unit} of ${p.material} into stock.`);
    } catch (e) {
      out.push(`Could not receive ${p.material}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

function waitingText(pos: PoRow[]): string {
  const placed = pos.filter((p) => p.status === "placed");
  return placed
    .map((p) => `${p.qty} ${p.unit} of ${p.material} on order${p.expected_at ? `, expected ${p.expected_at}` : ""}`)
    .join("; ");
}

async function reply(thread: string, agent: string, ref: string, text: string) {
  await addMessage(thread, "STATUS", agent, HUMAN_AGENT, { ref, status: "reply" }, text);
}

// Materials this chat is still short of.
async function shortMaterials(thread: string): Promise<{ id: string; name: string; unit: string }[]> {
  return (await sql`
    SELECT DISTINCT m.id, m.name, m.unit FROM materials m WHERE m.id IN (
      SELECT a.material_id FROM order_allocations a JOIN customer_orders o ON o.id = a.order_id
       WHERE o.negotiation_id = ${thread} AND o.status = 'awaiting_stock' AND a.reserved < a.required
      UNION
      SELECT n.material_id FROM negotiations n WHERE n.id = ${thread} AND n.status = 'in_progress' AND n.material_id IS NOT NULL)
  `) as { id: string; name: string; unit: string }[];
}

// "Check the contracts again": looks at every contract for what this chat is short of,
// and re-runs purchasing for the ones that can now be bought.
async function contractsCommand(thread: string, agent: string, ref: string) {
  const mats = await shortMaterials(thread);
  if (mats.length === 0) return reply(thread, agent, ref, "This chat is not short of any material, so there is nothing to buy.");
  const lines: string[] = [];
  let retried = 0;
  for (const m of mats) {
    const need = await unmetDemand(m.id);
    const { usable } = await usableContracts(m.id, need);
    if (usable.length > 0) {
      lines.push(`${m.name}: need ${need} ${m.unit}; ${usable[0].supplier} can cover it. Re-running purchasing.`);
      await emitEvent("stock.shortage", "material", m.id, { materialId: m.id, shortfall: need, ref: thread, threadId: thread }, `shortage:recheck:${thread}:${m.id}:${randomUUID()}`);
      retried++;
    } else {
      const all = await listContractsForMaterial(m.id);
      const detail = all.length
        ? all.map((c) => `${c.supplier} ${c.minQty}-${c.maxQty} until ${c.validTo}${c.status !== "active" ? ` (${c.status})` : ""}`).join("; ")
        : "no contracts exist";
      lines.push(`${m.name}: need ${need} ${m.unit}; no contract covers it. Contracts: ${detail}.`);
    }
  }
  await reply(thread, agent, ref, lines.join(" "));
  if (retried > 0) await drainEvents();
}

async function orderCommand(thread: string, cmd: ChatCommand, order: { id: string; ref: string; status: string; qty: number }) {
  const { id, ref, status } = order;
  const done = status === "completed" || status === "cancelled";

  if (cmd.kind === "contracts") return contractsCommand(thread, PRODUCTION_AGENT, ref);

  if (cmd.kind === "amend") {
    if (done || status === "in_production") return reply(thread, PRODUCTION_AGENT, ref, `${ref} is already ${status.replace("_", " ")}, so its quantity can no longer change. Start a new order instead.`);
    if (status === "new") return reply(thread, PRODUCTION_AGENT, ref, `${ref} is still being planned. Try again in a moment.`);
    const target = cmd.mode === "add" ? order.qty + cmd.qty : cmd.qty;
    await amendOrder(id, target);
    await drainEvents();
    return;
  }

  if (cmd.kind === "cancel") {
    if (done || status === "in_production") return reply(thread, PRODUCTION_AGENT, ref, `${ref} is ${status.replace("_", " ")} and cannot be cancelled.`);
    await transitionOrder(id, "cancel");
    await drainEvents();
    return;
  }

  if (cmd.kind === "receive") {
    const lines = await receiveAll(thread);
    if (lines.length === 0) return reply(thread, INVENTORY_AGENT, ref, "Nothing is on order for this chat, so there is no delivery to receive.");
    await reply(thread, INVENTORY_AGENT, ref, lines.join(" "));
    await drainEvents();
    return;
  }

  if (cmd.kind === "finish") {
    if (status === "in_production") return void (await transitionOrder(id, "complete"));
    if (status === "completed") return reply(thread, PRODUCTION_AGENT, ref, `${ref} is already complete.`);
    return reply(thread, PRODUCTION_AGENT, ref, `${ref} has not started production yet (${status.replace("_", " ")}). Say "ok" to start it once it is ready.`);
  }

  if (cmd.kind === "continue") {
    if (status === "ready") return void (await transitionOrder(id, "start"));
    if (status === "in_production") return reply(thread, PRODUCTION_AGENT, ref, `${ref} is in production. Tell me "done" when it is finished and I will consume the materials.`);
    if (done) return reply(thread, PRODUCTION_AGENT, ref, `${ref} is already ${status}.`);
    const pos = await threadPurchases(thread);
    if (pos.some((p) => p.status === "needs_approval" && p.supplier)) {
      const lines = await approveAll(pos);
      const after = await threadPurchases(thread);
      const wait = waitingText(after);
      await reply(thread, PRODUCTION_AGENT, ref, `${lines.join(" ")}${wait ? ` Now waiting for delivery: ${wait}. Say "received" when it arrives and I will add it to stock and continue.` : ""}`);
      return;
    }
    const wait = waitingText(pos);
    if (wait) return reply(thread, PRODUCTION_AGENT, ref, `Still waiting for delivery: ${wait}. Say "received" when it arrives.`);
    return reply(thread, PRODUCTION_AGENT, ref, `${ref} is ${status.replace("_", " ")} and nothing is on order yet. Purchasing may still be working on it.`);
  }

  // status
  const pos = await threadPurchases(thread);
  const wait = waitingText(pos);
  const approvals = pos.filter((p) => p.status === "needs_approval" && p.supplier).length;
  const blocked = pos.filter((p) => p.status === "needs_approval" && !p.supplier).map((p) => p.material);
  return reply(
    thread, PRODUCTION_AGENT, ref,
    `${ref} is ${status.replace("_", " ")}.${approvals ? ` ${approvals} purchase${approvals > 1 ? "s" : ""} awaiting your approval (say "ok").` : ""}${wait ? ` On order: ${wait}.` : ""}${blocked.length ? ` Purchasing cannot buy ${blocked.join(", ")} yet: no valid supplier contract covers it (see Contracts).` : ""}`
  );
}

async function requestCommand(thread: string, cmd: ChatCommand, req: { status: string; quantity: number; name: string; unit: string }) {
  const ref = "REQ";
  const open = req.status === "in_progress";
  if (!open) return reply(thread, INVENTORY_AGENT, ref, `This request is already ${req.status}. Describe a new one to start another.`);

  if (cmd.kind === "cancel") {
    await cancelRequest(thread);
    await reply(thread, INVENTORY_AGENT, ref, "Request cancelled. Anything reserved is back in free stock.");
    await drainEvents();
    return;
  }
  if (cmd.kind === "contracts") return contractsCommand(thread, INVENTORY_AGENT, ref);
  if (cmd.kind === "amend") return reply(thread, INVENTORY_AGENT, ref, "A request cannot change quantity. Cancel it and ask again, or start another request for the extra units.");
  if (cmd.kind === "receive") {
    const lines = await receiveAll(thread);
    if (lines.length === 0) return reply(thread, INVENTORY_AGENT, ref, "Nothing is on order for this request.");
    await reply(thread, INVENTORY_AGENT, ref, lines.join(" "));
    await drainEvents();
    return;
  }

  const pos = await threadPurchases(thread);
  if (cmd.kind === "status" || (cmd.kind !== "finish" && pos.some((p) => p.status === "needs_approval" && p.supplier))) {
    if (cmd.kind !== "status") {
      const lines = await approveAll(pos);
      const wait = waitingText(await threadPurchases(thread));
      return reply(thread, INVENTORY_AGENT, ref, `${lines.join(" ")}${wait ? ` Waiting for delivery: ${wait}. Say "received" when it arrives.` : ""}`);
    }
    const held = await heldForRequest(thread);
    const wait = waitingText(pos);
    return reply(thread, INVENTORY_AGENT, ref, `${held} of ${req.quantity} ${req.unit} of ${req.name} reserved.${wait ? ` On order: ${wait}.` : ""}`);
  }

  const held = await heldForRequest(thread);
  if (held >= req.quantity) {
    const { issued } = await issueRequest(thread);
    return reply(thread, INVENTORY_AGENT, ref, issued > 0 ? `Issued ${issued} ${req.unit} of ${req.name}. Request complete.` : "That request changed while I was working. Try again.");
  }
  const wait = waitingText(pos);
  return reply(thread, INVENTORY_AGENT, ref, `Only ${held} of ${req.quantity} ${req.unit} are reserved.${wait ? ` Waiting for delivery: ${wait}. Say "received" when it arrives.` : " Purchasing is working on the rest."}`);
}

/**
 * Returns handled=false when the text is really a new order (so the caller
 * creates one); otherwise runs it as an instruction on this thread.
 */
export async function handleChatMessage(thread: string, text: string): Promise<{ handled: boolean }> {
  const rows = (await sql`
    SELECT n.status AS n_status, n.quantity, n.item_category, n.material_id,
           o.id AS order_id, o.ref, o.status AS order_status, o.qty,
           m.name AS mat_name, m.unit AS mat_unit
    FROM negotiations n
    LEFT JOIN customer_orders o ON o.negotiation_id = n.id
    LEFT JOIN materials m ON m.id = n.material_id
    WHERE n.id = ${thread}
  `) as Record<string, unknown>[];
  const t = rows[0];
  if (!t || (!t.order_id && !t.material_id)) return { handled: false };

  let cmd = parseChatCommand(text);
  // Naming a supplier ("Delta Logistics is there") is about its contracts.
  if (cmd.kind === "none") {
    const lower = text.toLowerCase();
    const suppliers = new Set((await listContracts()).map((c) => c.supplier.replace(/_/g, " ").toLowerCase()));
    if ([...suppliers].some((s) => lower.includes(s))) cmd = { kind: "contracts" };
  }
  const startsNew = /^\s*new\b/i.test(text);
  if (startsNew) return { handled: false };
  // A message naming a product or material with no instruction in it is a new request.
  if (cmd.kind === "none" && ((await matchProduct(text)) || (await matchMaterial(text)))) return { handled: false };

  const agent = t.order_id ? PRODUCTION_AGENT : INVENTORY_AGENT;
  await addMessage(thread, "SAY", HUMAN_AGENT, agent, { text: text.trim().slice(0, 500) }, null);

  if (cmd.kind === "none") {
    await reply(
      thread, agent, String(t.ref ?? "REQ"),
      `I did not understand that. In this chat you can say "ok" to continue, "received" when a delivery arrives, "done" when production is finished, "add one more", "make it 15", or "cancel". To start something new, describe it, e.g. "5 lounge chairs".`
    );
    return { handled: true };
  }

  if (t.order_id) {
    await orderCommand(thread, cmd, { id: String(t.order_id), ref: String(t.ref), status: String(t.order_status), qty: Number(t.qty) });
  } else {
    await requestCommand(thread, cmd, {
      status: String(t.n_status), quantity: Number(t.quantity), name: String(t.mat_name), unit: String(t.mat_unit),
    });
  }
  return { handled: true };
}
