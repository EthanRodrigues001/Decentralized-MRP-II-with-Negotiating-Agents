import { sql } from "@/lib/db";
import { emitEvent } from "@/lib/events";

export interface InventoryRow {
  materialId: string;
  sku: string;
  name: string;
  unit: string;
  reorderPoint: number | null;
  onHand: number;
  reserved: number;
  available: number;
  onOrder: number;
  projected: number;
}

export async function listInventory(): Promise<InventoryRow[]> {
  const rows = (await sql`
    SELECT m.id, m.sku, m.name, m.unit, m.reorder_point,
           b.on_hand, b.reserved, b.on_order
    FROM materials m JOIN inventory_balances b ON b.material_id = m.id
    ORDER BY m.name
  `) as Record<string, string | number | null>[];
  return rows.map((r) => {
    const onHand = Number(r.on_hand);
    const reserved = Number(r.reserved);
    const onOrder = Number(r.on_order);
    return {
      materialId: r.id as string,
      sku: r.sku as string,
      name: r.name as string,
      unit: r.unit as string,
      reorderPoint: r.reorder_point === null ? null : Number(r.reorder_point),
      onHand,
      reserved,
      available: onHand - reserved,
      onOrder,
      projected: onHand - reserved + onOrder,
    };
  });
}

export async function listMovements(limit = 100) {
  return sql`
    SELECT s.id, m.name AS material, s.delta, s.kind, s.ref_type, s.ref_id, s.note, s.created_at
    FROM stock_movements s JOIN materials m ON m.id = s.material_id
    ORDER BY s.created_at DESC LIMIT ${limit}
  `;
}

// Manual correction (cycle count, damage, found stock). Never lets on_hand drop
// below what is already reserved, and always leaves a ledger row.
export async function adjustStock(materialId: string, delta: number, note: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("delta must be a non-zero integer");
  if (!note.trim()) throw new Error("a reason is required for a stock adjustment");
  const rows = await sql`
    WITH upd AS (
      UPDATE inventory_balances
      SET on_hand = on_hand + ${delta}, updated_at = now()
      WHERE material_id = ${materialId} AND on_hand + ${delta} >= reserved
      RETURNING material_id
    )
    INSERT INTO stock_movements (material_id, delta, kind, ref_type, note)
    SELECT material_id, ${delta}, 'adjust', 'manual', ${note.trim()} FROM upd
    RETURNING id
  `;
  if (rows.length === 0) throw new Error("adjustment would take stock below the reserved quantity");
  // Extra stock may satisfy waiting orders.
  if (delta > 0) {
    await emitEvent("stock.adjusted", "material", materialId, { materialId }, `adjusted:${materialId}:${Date.now()}`);
  }
}

// Atomically reserve as much of `qty` as is available. It is one statement, so
// two concurrent callers cannot both take the last units. The remainder is the
// shortfall, published as a stock.shortage event for the purchasing agent.
export async function requestMaterial(materialId: string, qty: number, ref: string) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("qty must be a positive integer");
  const rows = (await sql`
    WITH cur AS (
      SELECT material_id, GREATEST(0, LEAST(${qty}, on_hand - reserved)) AS take
      FROM inventory_balances WHERE material_id = ${materialId} FOR UPDATE
    ),
    upd AS (
      UPDATE inventory_balances b SET reserved = b.reserved + cur.take, updated_at = now()
      FROM cur WHERE b.material_id = cur.material_id RETURNING cur.take AS take
    ),
    mv AS (
      INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
      SELECT ${materialId}::uuid, take, 'reserve', 'request', ${ref} FROM upd WHERE take > 0
    )
    SELECT take FROM upd
  `) as { take: number }[];
  if (rows.length === 0) throw new Error("unknown material");
  const reserved = Number(rows[0].take);
  const shortfall = qty - reserved;
  if (shortfall > 0) {
    await emitEvent(
      "stock.shortage",
      "material",
      materialId,
      { materialId, shortfall, ref },
      `shortage:${ref}:${materialId}`
    );
  }
  return { requested: qty, reserved, shortfall };
}
