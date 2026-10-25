import { sql } from "@/lib/db";
import { getSupplierStats } from "@/lib/supplier-stats";
import { computeBidOrRefusal, scoreProposals } from "@/lib/bidding";
import { decidePurchase } from "@/lib/auto-buy";
import { getSettings } from "@/lib/settings";
import { addStep, finishRun, startRun } from "@/lib/agent-log";
import { emitEvent, type DomainEvent } from "@/lib/events";
import { usableContracts } from "@/lib/contracts";
import { addMessage } from "@/lib/negotiation-db";
import { HUMAN_AGENT, type ProposePayload } from "@/lib/types";

const DEFAULT_DUE_IN_DAYS = 14;
const MAX_OPTIMISTIC_RETRIES = 3;
export const PURCHASING_AGENT = "PurchasingAgent";

// SQL fragment text (not a query) kept in one place: a contract must be active,
// in date, and cover the quantity at the moment the purchase is committed.
// Re-checked inside the committing statement so a contract that expires or is
// terminated while a decision is being made cannot be used.

async function threadForOrder(orderId: unknown): Promise<string | null> {
  if (typeof orderId !== "string") return null;
  const rows = (await sql`SELECT negotiation_id FROM customer_orders WHERE id = ${orderId}`) as { negotiation_id: string | null }[];
  return rows[0]?.negotiation_id ?? null;
}

// Deterministic purchasing agent. It reacts to stock.shortage, buys only under
// a valid supplier contract, applies the threshold rule, and either places the
// order or parks it for approval. The LLM is not involved.
export async function handleShortage(event: DomainEvent) {
  const materialId = String(event.payload.materialId);
  const shortfall = Number(event.payload.shortfall);
  const dueInDays = Math.max(1, Number(event.payload.dueInDays ?? DEFAULT_DUE_IN_DAYS));
  const thread = (await threadForOrder(event.payload.orderId)) ?? (typeof event.payload.threadId === "string" ? event.payload.threadId : null);

  const mat = (await sql`SELECT name, unit FROM materials WHERE id = ${materialId}`) as { name: string; unit: string }[];
  if (mat.length === 0) throw new Error(`unknown material ${materialId}`);
  const { name, unit } = mat[0];

  const runId = await startRun(PURCHASING_AGENT, `Shortage: ${shortfall} ${unit} of ${name}`, event.id, thread);
  const say = async (payload: Record<string, unknown>, narration: string) => {
    if (thread) await addMessage(thread, "PURCHASE", PURCHASING_AGENT, HUMAN_AGENT, { material: name, unit, ...payload }, narration);
  };

  try {
    await addStep(runId, "thinking", null, undefined, {
      text: `${name} is short by ${shortfall} ${unit}. Checking stock already on order, supplier contracts, then the auto-buy rule.`,
    });

    for (let attempt = 0; attempt < MAX_OPTIMISTIC_RETRIES; attempt++) {
      const bal = (await sql`SELECT on_order FROM inventory_balances WHERE material_id = ${materialId}`) as { on_order: number }[];
      const onOrder = Number(bal[0]?.on_order ?? 0);
      const settings = await getSettings();
      await addStep(runId, "tool", "read_settings", undefined, { ...settings, onOrder });

      const net = Math.max(0, shortfall - onOrder);
      if (net === 0) {
        const d = decidePurchase({
          shortfall, onOrder, threshold: settings.autoBuyThreshold, autoBuyEnabled: settings.autoBuyEnabled,
          estimatedCost: 0, spentTodayAuto: 0, maxAutoSpendPerDay: settings.maxAutoSpendPerDay,
        });
        await addStep(runId, "result", "decision", undefined, d);
        await say({ decision: "covered", qty: 0, reason: d.reason }, `No purchase needed: ${d.reason}.`);
        await finishRun(runId, "done");
        return;
      }

      const { usable, excluded } = await usableContracts(materialId, net);
      await addStep(runId, "tool", "check_contracts", { materialId, qty: net }, {
        usable: usable.map((c) => ({ supplier: c.supplier, unitPrice: c.unitPrice, leadTimeDays: c.leadTimeDays })),
        excluded,
      });

      const proposals: ProposePayload[] = [];
      const contractBySupplier = new Map<string, string>();
      for (const c of usable) {
        if (contractBySupplier.has(c.supplier)) continue; // cheapest contract per supplier (list is price-sorted)
        const stats = await getSupplierStats(c.supplier);
        // A contract up to its maximum is the supplier's commitment, so "bigger than anything it has
        // shipped before" must not veto a quantity the contract explicitly covers.
        const result = computeBidOrRefusal({ ...stats, maxHistoricalQuantity: Math.max(stats.maxHistoricalQuantity, c.maxQty) }, net, dueInDays);
        if ("propose" in result) {
          // The contract, not the supplier's historical average, sets price and lead time.
          proposals.push({
            ...result.propose,
            unitPrice: c.unitPrice,
            totalPrice: Number((c.unitPrice * net).toFixed(2)),
            leadTimeDays: c.leadTimeDays,
          });
          contractBySupplier.set(c.supplier, c.id);
        } else {
          await addStep(runId, "tool", "request_bid", { supplier: c.supplier, qty: net }, { refused: result.refuse.reason });
        }
      }
      const best = scoreProposals(proposals, dueInDays).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
      if (best) {
        await addStep(runId, "tool", "rank_bids", { candidates: proposals.length }, {
          best: best.supplier, unitPrice: best.unitPrice, leadTimeDays: best.leadTimeDays, score: best.score,
        });
      }
      const contractId = best ? contractBySupplier.get(best.supplier) ?? null : null;

      const spent = (await sql`
        SELECT coalesce(sum(total_price), 0) AS s FROM purchase_orders
        WHERE source = 'auto' AND status <> 'cancelled' AND created_at::date = current_date
      `) as { s: string }[];

      const noContractReason = best
        ? null
        : usable.length === 0
          ? `no valid contract covers ${net} ${unit} of ${name}${excluded.length ? ` (${excluded.map((e) => `${e.supplier.replace(/_/g, " ")}: ${e.reason}`).join("; ")})` : ""}`
          : "no contracted supplier returned a usable bid";

      const decision = best
        ? decidePurchase({
            shortfall, onOrder, threshold: settings.autoBuyThreshold, autoBuyEnabled: settings.autoBuyEnabled,
            estimatedCost: best.totalPrice, spentTodayAuto: Number(spent[0].s), maxAutoSpendPerDay: settings.maxAutoSpendPerDay,
          })
        : ({ action: "needs_approval", qty: net, reason: noContractReason as string } as const);
      await addStep(runId, "result", "decision", undefined, { ...decision, supplier: best?.supplier ?? null });

      if (decision.action === "auto" && best && contractId) {
        // Optimistic guard on on_order plus a live contract check, all in the
        // statement that commits the purchase.
        const rows = await sql`
          WITH upd AS (
            UPDATE inventory_balances SET on_order = on_order + ${decision.qty}, updated_at = now()
            WHERE material_id = ${materialId} AND on_order = ${onOrder}
              AND EXISTS (
                SELECT 1 FROM contracts c WHERE c.id = ${contractId} AND c.status = 'active'
                  AND current_date BETWEEN c.valid_from AND c.valid_to
                  AND ${decision.qty} BETWEEN c.min_qty AND c.max_qty)
            RETURNING material_id
          )
          INSERT INTO purchase_orders
            (material_id, supplier, qty, unit_price, total_price, lead_time_days, source, status,
             threshold_used, reason, expected_at, contract_id, negotiation_id)
          SELECT material_id, ${best.supplier}, ${decision.qty}, ${best.unitPrice},
                 ${Number((best.unitPrice * decision.qty).toFixed(2))}, ${best.leadTimeDays},
                 'auto', 'placed', ${settings.autoBuyThreshold}, ${decision.reason},
                 current_date + ${best.leadTimeDays}::int, ${contractId}, ${thread}
          FROM upd
          RETURNING id, expected_at::text AS expected_at
        `;
        if (rows.length === 0) {
          await addStep(runId, "thinking", null, undefined, { text: "On-order or the contract changed while deciding. Re-checking." });
          continue;
        }
        const po = rows[0] as { id: string; expected_at: string };
        await emitEvent("purchase.placed", "purchase_order", po.id, { poId: po.id, materialId, qty: decision.qty });
        await addStep(runId, "result", "purchase_order_placed", undefined, { poId: po.id, supplier: best.supplier, qty: decision.qty });
        await say(
          {
            decision: "auto", poId: po.id, status: "placed", qty: decision.qty, supplier: best.supplier,
            unitPrice: best.unitPrice, total: Number((best.unitPrice * decision.qty).toFixed(2)),
            leadTimeDays: best.leadTimeDays, expectedAt: po.expected_at, reason: decision.reason,
            contract: { id: contractId, validTo: usable.find((c) => c.id === contractId)?.validTo },
          },
          `Auto-purchased ${decision.qty} ${unit} from ${best.supplier.replace(/_/g, " ")} under contract.`
        );
        await finishRun(runId, "done");
        return;
      }

      if (decision.action === "needs_approval") {
        const total = best ? Number((best.unitPrice * decision.qty).toFixed(2)) : null;
        const existing = (await sql`
          SELECT id FROM purchase_orders WHERE material_id = ${materialId} AND status = 'needs_approval' LIMIT 1
        `) as { id: string }[];
        let poId: string;
        if (existing.length) {
          poId = existing[0].id;
          // Keep one open approval per material: refresh it to the current need instead of stacking duplicates.
          await sql`
            UPDATE purchase_orders SET qty = ${decision.qty}, reason = ${decision.reason},
              supplier = ${best?.supplier ?? null}, unit_price = ${best?.unitPrice ?? null}, total_price = ${total},
              lead_time_days = ${best?.leadTimeDays ?? null}, contract_id = ${contractId},
              negotiation_id = coalesce(negotiation_id, ${thread})
            WHERE id = ${poId}
          `;
        } else {
          const rows = await sql`
            INSERT INTO purchase_orders
              (material_id, supplier, qty, unit_price, total_price, lead_time_days, source, status,
               threshold_used, reason, contract_id, negotiation_id)
            VALUES (${materialId}, ${best?.supplier ?? null}, ${decision.qty}, ${best?.unitPrice ?? null}, ${total},
                    ${best?.leadTimeDays ?? null}, 'negotiated', 'needs_approval', ${settings.autoBuyThreshold},
                    ${decision.reason}, ${contractId}, ${thread})
            RETURNING id
          `;
          poId = (rows[0] as { id: string }).id;
        }
        await emitEvent("purchase.needs_approval", "purchase_order", poId, { poId, materialId, qty: decision.qty });
        await addStep(runId, "result", "approval_requested", undefined, { poId, reason: decision.reason });
        await say(
          {
            decision: "needs_approval", poId, status: "needs_approval", qty: decision.qty, supplier: best?.supplier ?? null,
            unitPrice: best?.unitPrice ?? null, total, leadTimeDays: best?.leadTimeDays ?? null, reason: decision.reason,
            excluded,
          },
          best ? `Needs your approval: ${decision.reason}.` : `Cannot buy yet: ${decision.reason}.`
        );
      }
      await finishRun(runId, "done");
      return;
    }
    throw new Error("could not settle the purchase after retries");
  } catch (err) {
    await addStep(runId, "result", "error", undefined, { message: err instanceof Error ? err.message : String(err) });
    await finishRun(runId, "failed");
    throw err;
  }
}

export async function listPurchaseOrders(limit = 100) {
  return sql`
    SELECT p.id, m.name AS material, m.unit, p.supplier, p.qty, p.unit_price, p.total_price,
           p.lead_time_days, p.source, p.status, p.threshold_used, p.reason, p.expected_at,
           p.created_at, p.received_at, p.contract_id, p.negotiation_id
    FROM purchase_orders p JOIN materials m ON m.id = p.material_id
    ORDER BY p.created_at DESC LIMIT ${limit}
  `;
}

export type PurchaseOrderAction = "approve" | "receive" | "cancel";

async function tell(poId: string, status: string, narration: string) {
  const rows = (await sql`
    SELECT p.negotiation_id, p.qty, p.supplier, m.name, m.unit
    FROM purchase_orders p JOIN materials m ON m.id = p.material_id WHERE p.id = ${poId}
  `) as { negotiation_id: string | null; qty: number; supplier: string | null; name: string; unit: string }[];
  const r = rows[0];
  if (!r?.negotiation_id) return;
  await addMessage(r.negotiation_id, "PURCHASE", PURCHASING_AGENT, HUMAN_AGENT, {
    decision: "update", poId, status, material: r.name, unit: r.unit, qty: r.qty, supplier: r.supplier,
  }, narration);
}

// Each transition is one statement guarded by the current status, so a double
// click or a retry cannot apply twice.
export async function transitionPurchaseOrder(id: string, action: PurchaseOrderAction) {
  if (action === "approve") {
    const rows = await sql`
      WITH po AS (
        UPDATE purchase_orders p
        SET status = 'placed', expected_at = current_date + coalesce(p.lead_time_days, 0)
        WHERE p.id = ${id} AND p.status = 'needs_approval' AND p.supplier IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM contracts c WHERE c.id = p.contract_id AND c.status = 'active'
              AND current_date BETWEEN c.valid_from AND c.valid_to AND p.qty BETWEEN c.min_qty AND c.max_qty)
        RETURNING material_id, qty
      )
      UPDATE inventory_balances b SET on_order = b.on_order + po.qty, updated_at = now()
      FROM po WHERE b.material_id = po.material_id
      RETURNING b.material_id
    `;
    if (rows.length === 0) throw new Error("order is not awaiting approval, or its contract is no longer valid for this quantity");
    await emitEvent("purchase.placed", "purchase_order", id, { poId: id });
    await tell(id, "placed", "Approved and placed with the supplier.");
    return;
  }
  if (action === "receive") {
    const rows = (await sql`
      WITH po AS (
        UPDATE purchase_orders SET status = 'received', received_at = now()
        WHERE id = ${id} AND status = 'placed'
        RETURNING material_id, qty
      ),
      bal AS (
        UPDATE inventory_balances b
        SET on_hand = b.on_hand + po.qty, on_order = GREATEST(0, b.on_order - po.qty), updated_at = now()
        FROM po WHERE b.material_id = po.material_id
        RETURNING b.material_id
      ),
      mv AS (
        INSERT INTO stock_movements (material_id, delta, kind, ref_type, ref_id)
        SELECT material_id, qty, 'receipt', 'purchase_order', ${id}::text FROM po
      )
      SELECT material_id FROM bal
    `) as { material_id: string }[];
    if (rows.length === 0) throw new Error("order is not in a placed state");
    await emitEvent("delivery.received", "purchase_order", id, { poId: id, materialId: rows[0].material_id });
    await tell(id, "received", "Delivery received into stock.");
    return;
  }
  const rows = await sql`
    WITH old AS (
      SELECT id, material_id, qty, status FROM purchase_orders
      WHERE id = ${id} AND status IN ('needs_approval', 'placed') FOR UPDATE
    ),
    po AS (
      UPDATE purchase_orders p SET status = 'cancelled' FROM old WHERE p.id = old.id
      RETURNING old.material_id, old.qty, old.status AS prev
    ),
    bal AS (
      UPDATE inventory_balances b SET on_order = GREATEST(0, b.on_order - po.qty), updated_at = now()
      FROM po WHERE b.material_id = po.material_id AND po.prev = 'placed'
      RETURNING b.material_id
    )
    SELECT material_id FROM po
  `;
  if (rows.length === 0) throw new Error("order cannot be cancelled in its current state");
  await tell(id, "cancelled", "Purchase cancelled.");
}
