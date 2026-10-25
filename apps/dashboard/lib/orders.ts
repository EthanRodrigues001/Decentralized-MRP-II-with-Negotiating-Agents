import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { buildBomDocument, getProduct } from "@/lib/bom";
import { addMessage } from "@/lib/negotiation-db";
import { emitEvent, type DomainEvent } from "@/lib/events";
import { startRun, addStep, finishRun } from "@/lib/agent-log";
import { HUMAN_AGENT } from "@/lib/types";
import { getSettings } from "@/lib/settings";
import { pickOrdersToStart } from "@/lib/schedule-rules";

export const PLANNING_AGENT = "PlanningAgent";
export const INVENTORY_AGENT = "InventoryAgent";
export const PRODUCTION_AGENT = "ProductionAgent";

// Rank used everywhere an order is compared with another one (backlog fairness):
// higher priority first, then earlier due date, then first come first served.

export interface OrderInput {
  customer?: string;
  productId: string;
  qty: number;
  dueInDays: number;
  priority?: number;
}

export function validateOrder(input: unknown): Required<OrderInput> {
  if (typeof input !== "object" || input === null) throw new Error("body must be an object");
  const o = input as Record<string, unknown>;
  const qty = Number(o.qty);
  const dueInDays = Number(o.dueInDays);
  const priority = Number(o.priority ?? 0);
  if (!String(o.productId ?? "")) throw new Error("productId is required");
  if (!Number.isInteger(qty) || qty < 1 || qty > 100_000) throw new Error("qty must be a whole number between 1 and 100000");
  if (!Number.isInteger(dueInDays) || dueInDays < 1 || dueInDays > 730) throw new Error("dueInDays must be a whole number between 1 and 730");
  if (![0, 1, 2].includes(priority)) throw new Error("priority must be 0, 1 or 2");
  const customer = typeof o.customer === "string" && o.customer.trim() ? o.customer.trim().slice(0, 80) : "Walk-in";
  return { customer, productId: String(o.productId), qty, dueInDays, priority };
}

export async function createOrder(input: Required<OrderInput>, recurringId?: string) {
  const product = await getProduct(input.productId);
  if (!product) throw new Error("unknown product");

  const thread = (await sql`
    INSERT INTO negotiations (item_category, quantity, due_in_days, status)
    VALUES (${product.name}, ${input.qty}, ${input.dueInDays}, 'in_progress')
    RETURNING id
  `) as { id: string }[];
  const negotiationId = thread[0].id;

  const rows = (await sql`
    INSERT INTO customer_orders (customer, product_id, qty, due_date, priority, negotiation_id, recurring_id)
    VALUES (${input.customer}, ${input.productId}, ${input.qty}, current_date + ${input.dueInDays}::int,
            ${input.priority}, ${negotiationId}, ${recurringId ?? null})
    RETURNING id, ref, due_date::text AS due_date
  `) as { id: string; ref: string; due_date: string }[];
  const order = rows[0];

  await addMessage(
    negotiationId,
    "ORDER",
    HUMAN_AGENT,
    PLANNING_AGENT,
    {
      ref: order.ref,
      customer: input.customer,
      product: product.name,
      sku: product.sku,
      qty: input.qty,
      dueDate: order.due_date,
      priority: input.priority,
      recurring: recurringId != null,
    },
    null
  );
  await emitEvent("order.created", "customer_order", order.id, { orderId: order.id }, `order.created:${order.id}`);
  return { orderId: order.id, ref: order.ref, negotiationId };
}

// Takes up to `want` units of a material, never touching stock that earlier
// (better ranked) waiting orders are queued for. One statement, so it is atomic.
async function reserveCapped(materialId: string, want: number, queueAhead: number, orderId: string) {
  const rows = (await sql`
    WITH cur AS (
      SELECT material_id, GREATEST(0, LEAST(${want}, on_hand - reserved - ${queueAhead})) AS take
      FROM inventory_balances WHERE material_id = ${materialId} FOR UPDATE
    ),
    upd AS (
      UPDATE inventory_balances b SET reserved = b.reserved + cur.take, updated_at = now()
      FROM cur WHERE b.material_id = cur.material_id RETURNING cur.take AS take
    ),
    mv AS (
      INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
      SELECT ${materialId}::uuid, take, 'reserve', 'order', ${orderId} FROM upd WHERE take > 0
    )
    SELECT take FROM upd
  `) as { take: number }[];
  return Number(rows[0]?.take ?? 0);
}

// Everything still missing for a material: waiting orders plus open single-material requests.
export async function unmetDemand(materialId: string): Promise<number> {
  const rows = (await sql`
    SELECT
      (SELECT coalesce(sum(a.required - a.reserved), 0)
         FROM order_allocations a JOIN customer_orders o ON o.id = a.order_id
        WHERE a.material_id = ${materialId} AND o.status = 'awaiting_stock')::int
      +
      (SELECT coalesce(sum(n.quantity - coalesce((
                SELECT sum(delta) FROM stock_movements
                 WHERE ref_type = 'request' AND ref_id = n.id::text AND kind IN ('reserve', 'release')), 0)), 0)
         FROM negotiations n WHERE n.material_id = ${materialId} AND n.status = 'in_progress')::int AS short
  `) as { short: number }[];
  return Number(rows[0].short);
}

interface AllocationView {
  materialId: string;
  sku: string;
  name: string;
  unit: string;
  required: number;
  reserved: number;
  short: number;
}

async function allocationView(orderId: string): Promise<AllocationView[]> {
  const rows = (await sql`
    SELECT a.material_id, m.sku, m.name, m.unit, a.required, a.reserved
    FROM order_allocations a JOIN materials m ON m.id = a.material_id
    WHERE a.order_id = ${orderId} ORDER BY m.name
  `) as Record<string, string | number>[];
  return rows.map((r) => ({
    materialId: String(r.material_id),
    sku: String(r.sku),
    name: String(r.name),
    unit: String(r.unit),
    required: Number(r.required),
    reserved: Number(r.reserved),
    short: Number(r.required) - Number(r.reserved),
  }));
}

// order.created: explode the BOM, post it to the chat, reserve what is free and
// publish a shortage for the rest.
export async function planOrder(event: DomainEvent) {
  const orderId = String(event.payload.orderId);
  const claimed = (await sql`
    UPDATE customer_orders SET status = 'awaiting_stock' WHERE id = ${orderId} AND status = 'new'
    RETURNING id, product_id, qty, priority, due_date::text AS due_date, created_at::text AS created_at,
              negotiation_id, ref, (due_date - current_date)::int AS days_left
  `) as Record<string, string | number>[];
  if (claimed.length === 0) return; // already planned (retry) or cancelled
  const o = claimed[0];
  const thread = String(o.negotiation_id);

  const runId = await startRun("PlanningAgent", `Plan ${o.ref}`, event.id, thread);
  let invRun: string | null = null;
  try {
    await addStep(runId, "thinking", null, undefined, {
      text: `New order ${o.ref}: ${o.qty} units, due in ${o.days_left} days, priority ${o.priority}. I need its bill of materials first, then I reserve free stock without taking units that better-ranked waiting orders are queued for.`,
    });
    const doc = await buildBomDocument(String(o.product_id), Number(o.qty));
    await addStep(runId, "tool", "explode_bom", { product: doc.product.sku, qty: o.qty }, { lines: doc.rows.length, totalCost: doc.totalCost });
    await addMessage(thread, "BOM", PLANNING_AGENT, HUMAN_AGENT, { ref: o.ref, document: doc }, null);
    await addStep(runId, "result", "bom_posted", undefined, { components: doc.rows.filter((r) => r.level === 2).length, totalCost: doc.totalCost });
    await finishRun(runId, "done");

    // Reserving stock is the inventory agent's job, so it gets its own run.
    invRun = await startRun(INVENTORY_AGENT, `Allocate stock for ${o.ref}`, event.id, thread);
    await addStep(invRun, "thinking", null, undefined, {
      text: `Received the bill of materials for ${o.ref}. For each component I reserve what is free, leaving alone units that better-ranked waiting orders are queued for, and report anything short.`,
    });

    const components = doc.rows.filter((r) => r.level === 2 && r.materialId);
    for (const c of components) {
      const materialId = c.materialId as string;
      const required = c.grossQty as number;
      const ahead = (await sql`
        SELECT coalesce(sum(a.required - a.reserved), 0)::int AS q
        FROM order_allocations a JOIN customer_orders o ON o.id = a.order_id
        WHERE a.material_id = ${materialId} AND o.id <> ${orderId} AND o.status = 'awaiting_stock'
          AND (o.priority > ${Number(o.priority)}
               OR (o.priority = ${Number(o.priority)}
                   AND (o.due_date < ${String(o.due_date)}::date
                        OR (o.due_date = ${String(o.due_date)}::date AND o.created_at < ${String(o.created_at)}::timestamptz))))
      `) as { q: number }[];
      const queueAhead = Number(ahead[0].q);
      const take = await reserveCapped(materialId, required, queueAhead, orderId);
      await sql`
        INSERT INTO order_allocations (order_id, material_id, required, reserved)
        VALUES (${orderId}, ${materialId}, ${required}, ${take})
        ON CONFLICT (order_id, material_id) DO NOTHING
      `;
      await addStep(invRun, "thinking", null, undefined, {
        text: `${c.description}: need ${required}. ${queueAhead > 0 ? `${queueAhead} are already promised to waiting orders ahead of this one. ` : ""}Reserving what is free.`,
      });
      await addStep(invRun, "tool", "reserve_stock", { material: c.partNo, required, queueAhead }, { reserved: take, short: required - take });
    }

    const view = await allocationView(orderId);
    const short = view.filter((v) => v.short > 0);
    const ready = short.length === 0;
    if (ready) await sql`UPDATE customer_orders SET status = 'ready' WHERE id = ${orderId} AND status = 'awaiting_stock'`;
    await addMessage(thread, "ALLOCATION", INVENTORY_AGENT, HUMAN_AGENT, { ref: o.ref, rows: view, ready }, null);

    for (const s of short) {
      await emitEvent(
        "stock.shortage",
        "material",
        s.materialId,
        {
          materialId: s.materialId,
          shortfall: await unmetDemand(s.materialId),
          ref: orderId,
          orderId,
          dueInDays: Math.max(1, Number(o.days_left)),
        },
        // event.id changes when the order is re-planned after an amendment; a retry of the same event keeps it.
        `shortage:${orderId}:${s.materialId}:${event.id}`
      );
    }
    await addStep(invRun, "result", "allocation", undefined, { ready, shortMaterials: short.length });
    await finishRun(invRun, "done");
    if (ready) await runDailySchedule();
  } catch (err) {
    const failed = invRun ?? runId;
    await addStep(failed, "result", "error", undefined, { message: err instanceof Error ? err.message : String(err) });
    await finishRun(failed, "failed");
    throw err;
  }
}

// Stock became free (delivery, cancellation, upward adjustment): give it to the
// waiting orders in rank order and mark the ones that are now complete as ready.
export async function reallocate(materialId: string) {
  const waiting = (await sql`
    SELECT a.order_id, (a.required - a.reserved)::int AS short, o.negotiation_id, o.ref
    FROM order_allocations a JOIN customer_orders o ON o.id = a.order_id
    WHERE a.material_id = ${materialId} AND o.status = 'awaiting_stock' AND a.reserved < a.required
    ORDER BY o.priority DESC, o.due_date ASC, o.created_at ASC
  `) as { order_id: string; short: number; negotiation_id: string; ref: string }[];

  const mat = (await sql`SELECT name, unit FROM materials WHERE id = ${materialId}`) as { name: string; unit: string }[];
  const matName = mat[0]?.name ?? "material";

  const touched = new Map<string, { thread: string; ref: string; wanted: number; took: number }>();
  for (const w of waiting) {
    const take = await reserveCapped(materialId, Number(w.short), 0, w.order_id);
    if (take > 0) {
      await sql`UPDATE order_allocations SET reserved = reserved + ${take} WHERE order_id = ${w.order_id} AND material_id = ${materialId}`;
      touched.set(w.order_id, { thread: w.negotiation_id, ref: w.ref, wanted: Number(w.short), took: take });
    }
  }

  for (const [orderId, t] of touched) {
    const run = await startRun(INVENTORY_AGENT, `Re-allocate ${matName} to ${t.ref}`, undefined, t.thread);
    await addStep(run, "thinking", null, undefined, {
      text: `${matName} stock became free (delivery, release or adjustment). ${t.ref} was waiting for ${t.wanted}, so it is next in rank order.`,
    });
    await addStep(run, "tool", "reserve_stock", { material: matName, wanted: t.wanted }, { reserved: t.took, stillShort: t.wanted - t.took });
    const view = await allocationView(orderId);
    const ready = view.every((v) => v.short === 0);
    if (ready) await sql`UPDATE customer_orders SET status = 'ready' WHERE id = ${orderId} AND status = 'awaiting_stock'`;
    await addMessage(t.thread, "ALLOCATION", INVENTORY_AGENT, HUMAN_AGENT, { ref: t.ref, rows: view, ready, update: true }, null);
    await addStep(run, "result", "allocation", undefined, { ready });
    await finishRun(run, "done");
    if (ready) await runDailySchedule();
  }
}

// The production agent starts ready orders on its own: urgent ones immediately, the rest in
// rank order until the day's order limit (Settings) is used up. Runs after an order becomes
// ready and on every tick, so a new day's limit refills by itself.
export async function runDailySchedule(): Promise<number> {
  const { dailyOrderLimit } = await getSettings();
  const started = (await sql`SELECT count(*)::int AS n FROM customer_orders WHERE started_at::date = current_date`) as { n: number }[];
  let startedToday = Number(started[0].n);
  const ready = (await sql`
    SELECT id, priority, negotiation_id, ref FROM customer_orders WHERE status = 'ready'
    ORDER BY priority DESC, due_date ASC, created_at ASC
  `) as { id: string; priority: number; negotiation_id: string; ref: string }[];
  const chosen = new Set(pickOrdersToStart(ready.map((r) => ({ id: r.id, priority: Number(r.priority) })), dailyOrderLimit, startedToday));
  let n = 0;
  for (const o of ready) {
    if (!chosen.has(o.id)) continue;
    const urgent = Number(o.priority) >= 2;
    startedToday++;
    await addMessage(
      o.negotiation_id, "STATUS", PRODUCTION_AGENT, HUMAN_AGENT, { ref: o.ref, status: "auto_start" },
      urgent
        ? "High priority and fully reserved, so I am starting production without waiting."
        : `Fully reserved and within today's limit (${startedToday} of ${dailyOrderLimit}), so I am starting production.`
    );
    try {
      await transitionOrder(o.id, "start");
      n++;
    } catch {
      // Cancelled or started by someone else in the meantime.
    }
  }
  return n;
}

/**
 * Changes the quantity of an order that has not started production: releases
 * what it holds, resets it and plans it again, so the BOM, allocation and any
 * purchase are recalculated for the new quantity.
 */
export async function amendOrder(id: string, newQty: number): Promise<{ ref: string; oldQty: number; thread: string }> {
  if (!Number.isInteger(newQty) || newQty < 1 || newQty > 100_000) throw new Error("quantity must be a whole number between 1 and 100000");
  const held = (await sql`SELECT material_id FROM order_allocations WHERE order_id = ${id} AND reserved > 0`) as { material_id: string }[];
  const rows = (await sql`
    WITH old AS (
      SELECT id, qty FROM customer_orders WHERE id = ${id} AND status IN ('awaiting_stock', 'ready') FOR UPDATE
    ),
    o AS (
      UPDATE customer_orders c SET qty = ${newQty}, status = 'new' FROM old WHERE c.id = old.id
      RETURNING c.id, c.negotiation_id, c.ref, old.qty AS old_qty
    ),
    a AS (SELECT al.material_id, al.reserved FROM order_allocations al JOIN o ON o.id = al.order_id),
    bal AS (
      UPDATE inventory_balances b SET reserved = b.reserved - a.reserved, updated_at = now()
      FROM a WHERE b.material_id = a.material_id RETURNING b.material_id
    ),
    mv AS (
      INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
      SELECT material_id, -reserved, 'release', 'order', ${id}::text FROM a WHERE reserved > 0
    ),
    del AS (DELETE FROM order_allocations al USING o WHERE al.order_id = o.id),
    po AS (
      UPDATE purchase_orders p SET status = 'cancelled'
      FROM o WHERE p.negotiation_id = o.negotiation_id AND p.status = 'needs_approval'
    )
    SELECT id, negotiation_id, ref, old_qty FROM o
  `) as { negotiation_id: string; ref: string; old_qty: number }[];
  if (rows.length === 0) throw new Error("this order can only be changed before production starts");
  const r = rows[0];
  await sql`UPDATE negotiations SET quantity = ${newQty} WHERE id = ${r.negotiation_id}`;
  await addMessage(r.negotiation_id, "STATUS", PLANNING_AGENT, HUMAN_AGENT, { ref: r.ref, status: "amended" }, `Quantity changed from ${r.old_qty} to ${newQty}. Re-planning the bill of materials and stock.`);
  // Freed stock goes to other waiting orders first; then this order is planned again.
  for (const h of held) {
    await emitEvent("stock.released", "material", h.material_id, { materialId: h.material_id }, `released:amend:${id}:${h.material_id}:${randomUUID()}`);
  }
  await emitEvent("order.created", "customer_order", id, { orderId: id }, `order.created:${id}:${randomUUID()}`);
  return { ref: r.ref, oldQty: Number(r.old_qty), thread: r.negotiation_id };
}

export type OrderAction = "start" | "complete" | "cancel";

// The production agent acts on your clicks (start, complete, cancel); log each as a run.
async function logProduction(thread: string, title: string, tool: string, thought: string, result: Record<string, unknown>) {
  const run = await startRun(PRODUCTION_AGENT, title, undefined, thread);
  await addStep(run, "thinking", null, undefined, { text: thought });
  await addStep(run, "tool", tool, undefined, result);
  await finishRun(run, "done");
}

export async function transitionOrder(id: string, action: OrderAction) {
  if (action === "start") {
    const rows = (await sql`
      UPDATE customer_orders SET status = 'in_production', started_at = now() WHERE id = ${id} AND status = 'ready'
      RETURNING negotiation_id, ref
    `) as { negotiation_id: string; ref: string }[];
    if (rows.length === 0) throw new Error("order is not ready for production");
    await addMessage(rows[0].negotiation_id, "STATUS", PRODUCTION_AGENT, HUMAN_AGENT, { ref: rows[0].ref, status: "in_production" }, "Production started. Reserved materials are now in use.");
    await logProduction(rows[0].negotiation_id, `Start production ${rows[0].ref}`, "start_production", "All materials are reserved, so production can begin. They stay reserved until you mark it complete.", { status: "in_production" });
    return;
  }

  if (action === "complete") {
    const rows = (await sql`
      WITH o AS (
        UPDATE customer_orders SET status = 'completed', completed_at = now()
        WHERE id = ${id} AND status = 'in_production' RETURNING id, negotiation_id, ref
      ),
      a AS (SELECT al.material_id, al.reserved FROM order_allocations al JOIN o ON o.id = al.order_id),
      bal AS (
        UPDATE inventory_balances b
        SET on_hand = b.on_hand - a.reserved, reserved = b.reserved - a.reserved, updated_at = now()
        FROM a WHERE b.material_id = a.material_id RETURNING b.material_id
      ),
      mv AS (
        INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
        SELECT material_id, -reserved, 'consume', 'order', ${id}::text FROM a WHERE reserved > 0
      )
      SELECT id, negotiation_id, ref FROM o
    `) as { negotiation_id: string; ref: string }[];
    if (rows.length === 0) throw new Error("order is not in production");
    await addMessage(rows[0].negotiation_id, "STATUS", PRODUCTION_AGENT, HUMAN_AGENT, { ref: rows[0].ref, status: "completed" }, "Production complete. Materials consumed from stock.");
    await logProduction(rows[0].negotiation_id, `Complete production ${rows[0].ref}`, "consume_stock", "Production is finished, so the reserved materials leave stock for good.", { status: "completed" });
    await sql`UPDATE negotiations SET status = 'completed' WHERE id = ${rows[0].negotiation_id}`;
    return;
  }

  const held = (await sql`
    SELECT material_id FROM order_allocations WHERE order_id = ${id} AND reserved > 0
  `) as { material_id: string }[];
  const rows = (await sql`
    WITH o AS (
      UPDATE customer_orders SET status = 'cancelled'
      WHERE id = ${id} AND status IN ('new', 'awaiting_stock', 'ready') RETURNING id, negotiation_id, ref
    ),
    a AS (SELECT al.material_id, al.reserved FROM order_allocations al JOIN o ON o.id = al.order_id),
    bal AS (
      UPDATE inventory_balances b SET reserved = b.reserved - a.reserved, updated_at = now()
      FROM a WHERE b.material_id = a.material_id RETURNING b.material_id
    ),
    mv AS (
      INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
      SELECT material_id, -reserved, 'release', 'order', ${id}::text FROM a WHERE reserved > 0
    ),
    del AS (DELETE FROM order_allocations al USING o WHERE al.order_id = o.id)
    SELECT id, negotiation_id, ref FROM o
  `) as { negotiation_id: string; ref: string }[];
  if (rows.length === 0) throw new Error("order cannot be cancelled in its current state");
  await addMessage(rows[0].negotiation_id, "STATUS", PRODUCTION_AGENT, HUMAN_AGENT, { ref: rows[0].ref, status: "cancelled" }, "Order cancelled. Reserved materials were released.");
  await logProduction(rows[0].negotiation_id, `Cancel ${rows[0].ref}`, "release_stock", "The order is cancelled before production, so its reserved materials go back to free stock for waiting orders.", { released: held.length });
  await sql`UPDATE negotiations SET status = 'cancelled' WHERE id = ${rows[0].negotiation_id}`;
  for (const h of held) {
    await emitEvent("stock.released", "material", h.material_id, { materialId: h.material_id }, `released:${id}:${h.material_id}`);
  }
}

export async function listOrders(limit = 100) {
  const rows = (await sql`
    SELECT o.id, o.ref, o.customer, o.qty, o.due_date::text AS due_date, o.priority, o.status,
           o.negotiation_id, o.created_at, p.name AS product, p.sku AS product_sku,
           coalesce((
             SELECT json_agg(json_build_object(
               'materialId', a.material_id, 'sku', m.sku, 'name', m.name, 'unit', m.unit,
               'required', a.required, 'reserved', a.reserved) ORDER BY m.name)
             FROM order_allocations a JOIN materials m ON m.id = a.material_id WHERE a.order_id = o.id
           ), '[]'::json) AS allocations
    FROM customer_orders o JOIN products p ON p.id = o.product_id
    ORDER BY o.created_at DESC LIMIT ${limit}
  `) as Record<string, unknown>[];
  return rows;
}
