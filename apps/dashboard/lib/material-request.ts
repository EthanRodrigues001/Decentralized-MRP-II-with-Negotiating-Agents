import { sql } from "@/lib/db";
import { addMessage } from "@/lib/negotiation-db";
import { emitEvent } from "@/lib/events";
import { startRun, addStep, finishRun } from "@/lib/agent-log";
import { HUMAN_AGENT } from "@/lib/types";
import { unmetDemand } from "@/lib/orders";

// A chat that asks for one raw material ("3 foam padding") rather than a product.
// The inventory agent reserves what is free; the purchasing agent covers the rest
// under a contract. Held stock is read back from the ledger, so no extra table.

export const REQUEST_AGENT = "InventoryAgent";

export interface MaterialRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

export async function listMaterials(): Promise<MaterialRow[]> {
  return (await sql`SELECT id, sku, name, unit FROM materials ORDER BY name`) as MaterialRow[];
}

const STOP = new Set(["with", "from", "unit", "units", "some", "raw", "material", "materials", "box", "boxes", "wood"]);

function stem(w: string) {
  return w.replace(/(es|s)$/, "");
}

/** "3 foam padding" -> the foam material. Words of the name found in the text score; ties go to the longer word. */
export function matchMaterialIn(text: string, materials: MaterialRow[]): MaterialRow | null {
  const words = new Set(text.toLowerCase().match(/[a-z]+/g)?.map(stem) ?? []);
  let best: { m: MaterialRow; score: number; len: number } | null = null;
  for (const m of materials) {
    const parts = (m.name.toLowerCase().match(/[a-z]+/g) ?? []).filter((p) => p.length >= 3).map(stem);
    const hits = parts.filter((p) => words.has(p));
    if (words.has(m.sku.toLowerCase())) hits.push(m.sku);
    if (hits.length === 0) continue;
    // A generic word alone (e.g. "wood") is not enough to pick a material.
    const strong = hits.filter((h) => !STOP.has(h));
    if (strong.length === 0) continue;
    const score = strong.length;
    const len = Math.max(...strong.map((h) => h.length));
    if (!best || score > best.score || (score === best.score && len > best.len)) best = { m, score, len };
  }
  return best?.m ?? null;
}

export async function matchMaterial(text: string): Promise<MaterialRow | null> {
  return matchMaterialIn(text, await listMaterials());
}

export async function heldForRequest(threadId: string): Promise<number> {
  const rows = (await sql`
    SELECT coalesce(sum(delta), 0)::int AS held FROM stock_movements
    WHERE ref_type = 'request' AND ref_id = ${threadId} AND kind IN ('reserve', 'release')
  `) as { held: number }[];
  return Number(rows[0].held);
}

// Takes up to `want` free units in one statement, so two requests cannot over-reserve.
async function reserve(materialId: string, want: number, threadId: string) {
  const rows = (await sql`
    WITH cur AS (
      SELECT material_id, GREATEST(0, LEAST(${want}, on_hand - reserved)) AS take
      FROM inventory_balances WHERE material_id = ${materialId} FOR UPDATE
    ),
    upd AS (
      UPDATE inventory_balances b SET reserved = b.reserved + cur.take, updated_at = now()
      FROM cur WHERE b.material_id = cur.material_id RETURNING cur.take AS take
    ),
    mv AS (
      INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
      SELECT ${materialId}::uuid, take, 'reserve', 'request', ${threadId} FROM upd WHERE take > 0
    )
    SELECT take FROM upd
  `) as { take: number }[];
  return Number(rows[0]?.take ?? 0);
}

export async function createMaterialRequest(input: { materialId: string; qty: number; dueInDays: number }) {
  const { materialId, qty, dueInDays } = input;
  if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) throw new Error("qty must be a whole number");
  const mat = (await sql`SELECT name, unit FROM materials WHERE id = ${materialId}`) as { name: string; unit: string }[];
  if (mat.length === 0) throw new Error("unknown material");
  const { name, unit } = mat[0];

  const t = (await sql`
    INSERT INTO negotiations (item_category, quantity, due_in_days, status, material_id)
    VALUES (${name}, ${qty}, ${dueInDays}, 'in_progress', ${materialId})
    RETURNING id
  `) as { id: string }[];
  const thread = t[0].id;

  await addMessage(thread, "STATUS", HUMAN_AGENT, REQUEST_AGENT, { ref: "REQ", status: "requested" }, `Requested ${qty} ${unit} of ${name}, needed within ${dueInDays} days.`);

  const run = await startRun(REQUEST_AGENT, `Reserve ${qty} ${unit} of ${name}`, undefined, thread);
  await addStep(run, "thinking", null, undefined, {
    text: `This is a direct request for ${qty} ${unit} of ${name}. I reserve what is free; anything short goes to the purchasing agent, which buys under a supplier contract.`,
  });
  const took = await reserve(materialId, qty, thread);
  const short = qty - took;
  await addStep(run, "tool", "reserve_stock", { material: name, qty }, { reserved: took, short });
  await addMessage(
    thread, "STATUS", REQUEST_AGENT, HUMAN_AGENT, { ref: "REQ", status: short === 0 ? "reserved" : "short" },
    short === 0
      ? `Reserved ${took} ${unit} of ${name}. Say "ok" to issue it.`
      : `Reserved ${took} of ${qty} ${unit}. ${short} ${unit} are short, so purchasing is checking supplier contracts.`
  );
  if (short > 0) {
    await emitEvent(
      "stock.shortage", "material", materialId,
      { materialId, shortfall: await unmetDemand(materialId), ref: thread, threadId: thread, dueInDays },
      `shortage:request:${thread}:${materialId}`
    );
  }
  await addStep(run, "result", "reserved", undefined, { reserved: took, short });
  await finishRun(run, "done");
  return { negotiationId: thread, reserved: took, short };
}

// Delivery or release made stock free: top up requests still waiting, oldest first.
export async function topUpRequests(materialId: string) {
  const waiting = (await sql`
    SELECT n.id, n.quantity, n.item_category,
           (SELECT coalesce(sum(delta), 0)::int FROM stock_movements
             WHERE ref_type = 'request' AND ref_id = n.id::text AND kind IN ('reserve', 'release')) AS held
    FROM negotiations n WHERE n.material_id = ${materialId} AND n.status = 'in_progress' AND n.settled_at IS NULL
    ORDER BY n.created_at
  `) as { id: string; quantity: number; item_category: string; held: number }[];
  for (const w of waiting) {
    const missing = Number(w.quantity) - Number(w.held);
    if (missing <= 0) continue;
    const take = await reserve(materialId, missing, w.id);
    if (take <= 0) continue;
    const run = await startRun(REQUEST_AGENT, `Top up ${w.item_category} request`, undefined, w.id);
    await addStep(run, "tool", "reserve_stock", { material: w.item_category, wanted: missing }, { reserved: take, stillShort: missing - take });
    await addMessage(
      w.id, "STATUS", REQUEST_AGENT, HUMAN_AGENT, { ref: "REQ", status: take === missing ? "reserved" : "short" },
      take === missing ? `Stock arrived. All ${w.quantity} are reserved now. Say "ok" to issue it.` : `Reserved ${take} more; ${missing - take} still short.`
    );
    await finishRun(run, "done");
  }
}

/** Hands the reserved stock out: it leaves on_hand for good and the request is complete. */
export async function issueRequest(threadId: string): Promise<{ issued: number }> {
  const rows = (await sql`
    WITH n AS (
      UPDATE negotiations SET status = 'completed'
      WHERE id = ${threadId} AND material_id IS NOT NULL AND status = 'in_progress'
        AND quantity = (SELECT coalesce(sum(delta), 0) FROM stock_movements
                         WHERE ref_type = 'request' AND ref_id = ${threadId} AND kind IN ('reserve', 'release'))
      RETURNING id, material_id, quantity
    ),
    bal AS (
      UPDATE inventory_balances b SET on_hand = b.on_hand - n.quantity, reserved = b.reserved - n.quantity, updated_at = now()
      FROM n WHERE b.material_id = n.material_id RETURNING b.material_id
    ),
    mv AS (
      INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
      SELECT material_id, -quantity, 'consume', 'request', ${threadId} FROM n
    )
    SELECT quantity FROM n
  `) as { quantity: number }[];
  return { issued: Number(rows[0]?.quantity ?? 0) };
}

/** Cancels an open request and frees whatever it was holding. */
export async function cancelRequest(threadId: string): Promise<boolean> {
  const held = await heldForRequest(threadId);
  const rows = (await sql`
    WITH n AS (
      UPDATE negotiations SET status = 'cancelled'
      WHERE id = ${threadId} AND material_id IS NOT NULL AND status = 'in_progress'
      RETURNING id, material_id
    ),
    bal AS (
      UPDATE inventory_balances b SET reserved = b.reserved - ${held}::int, updated_at = now()
      FROM n WHERE b.material_id = n.material_id AND ${held}::int > 0 RETURNING b.material_id
    ),
    mv AS (
      INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
      SELECT material_id, -${held}::int, 'release', 'request', ${threadId} FROM n WHERE ${held}::int > 0
    )
    SELECT material_id FROM n
  `) as { material_id: string }[];
  if (rows.length === 0) return false;
  if (held > 0) {
    await emitEvent("stock.released", "material", rows[0].material_id, { materialId: rows[0].material_id }, `released:request:${threadId}`);
  }
  return true;
}
