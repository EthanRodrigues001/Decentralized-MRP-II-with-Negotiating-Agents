import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";

// Everything in USD; the UI converts for display. Profit is measured on completed
// orders: revenue is quantity times the product selling price, cost is the bill of
// materials at standard cost. Vendor comparison uses the contracts valid today.

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function getAnalytics() {
  const settings = await getSettings();

  const orderMoney = (await sql`
    WITH cost AS (
      SELECT b.product_id, sum(b.qty_per_unit * (1 + b.scrap_pct / 100) * m.std_cost) AS unit_cost
      FROM bom_lines b JOIN materials m ON m.id = b.material_id GROUP BY b.product_id
    )
    SELECT o.id, o.status, o.qty, o.priority, o.created_at, o.completed_at, o.started_at, o.customer,
           p.name AS product, coalesce(p.sale_price, 0) AS price, coalesce(c.unit_cost, 0) AS unit_cost
    FROM customer_orders o JOIN products p ON p.id = o.product_id LEFT JOIN cost c ON c.product_id = o.product_id
  `) as Row[];

  const done = orderMoney.filter((o) => o.status === "completed");
  const open = orderMoney.filter((o) => ["awaiting_stock", "ready", "in_production", "new"].includes(String(o.status)));
  const revenue = done.reduce((s, o) => s + n(o.qty) * n(o.price), 0);
  const cogs = done.reduce((s, o) => s + n(o.qty) * n(o.unit_cost), 0);
  const pipelineRevenue = open.reduce((s, o) => s + n(o.qty) * n(o.price), 0);
  const pipelineCost = open.reduce((s, o) => s + n(o.qty) * n(o.unit_cost), 0);

  const byStatus: Record<string, number> = {};
  for (const o of orderMoney) byStatus[String(o.status)] = (byStatus[String(o.status)] ?? 0) + 1;

  // Per day for the last 14 days, by completion day.
  const days: { day: string; revenue: number; cost: number; profit: number; orders: number }[] = [];
  for (let i = 13; i >= 0; i--) days.push({ day: isoDay(new Date(Date.now() - i * 86400000)), revenue: 0, cost: 0, profit: 0, orders: 0 });
  for (const o of done) {
    const slot = o.completed_at ? days.find((d) => d.day === isoDay(new Date(String(o.completed_at)))) : undefined;
    if (!slot) continue;
    const r = n(o.qty) * n(o.price);
    const c = n(o.qty) * n(o.unit_cost);
    slot.revenue += r;
    slot.cost += c;
    slot.profit += r - c;
    slot.orders += 1;
  }

  const byProduct = new Map<string, { product: string; orders: number; units: number; revenue: number; profit: number }>();
  for (const o of done) {
    const k = String(o.product);
    const cur = byProduct.get(k) ?? { product: k, orders: 0, units: 0, revenue: 0, profit: 0 };
    cur.orders += 1;
    cur.units += n(o.qty);
    cur.revenue += n(o.qty) * n(o.price);
    cur.profit += n(o.qty) * (n(o.price) - n(o.unit_cost));
    byProduct.set(k, cur);
  }

  const today = isoDay(new Date());
  const startedToday = orderMoney.filter((o) => o.started_at && isoDay(new Date(String(o.started_at))) === today).length;

  // Purchases, with the vendor alternatives that exist under today's contracts.
  const pos = (await sql`
    SELECT p.id, p.supplier, p.qty, p.unit_price, p.total_price, p.status, p.source, p.lead_time_days, m.name AS material,
      (SELECT avg(c.unit_price) FROM contracts c WHERE c.material_id = p.material_id AND c.supplier <> p.supplier
         AND c.status = 'active' AND current_date BETWEEN c.valid_from AND c.valid_to AND p.qty BETWEEN c.min_qty AND c.max_qty) AS alt_avg,
      (SELECT min(c.unit_price) FROM contracts c WHERE c.material_id = p.material_id
         AND c.status = 'active' AND current_date BETWEEN c.valid_from AND c.valid_to AND p.qty BETWEEN c.min_qty AND c.max_qty) AS best_price,
      (SELECT c.supplier FROM contracts c WHERE c.material_id = p.material_id
         AND c.status = 'active' AND current_date BETWEEN c.valid_from AND c.valid_to AND p.qty BETWEEN c.min_qty AND c.max_qty
       ORDER BY c.unit_price LIMIT 1) AS best_supplier
    FROM purchase_orders p JOIN materials m ON m.id = p.material_id
    WHERE p.status <> 'cancelled'
  `) as Row[];

  const committed = pos.filter((p) => p.status === "placed" || p.status === "received");
  const spend = committed.reduce((s, p) => s + n(p.total_price), 0);
  const pendingValue = pos.filter((p) => p.status === "needs_approval").reduce((s, p) => s + n(p.total_price), 0);
  // Saved against what the other contracted vendors would have charged on average.
  const savedVsOthers = committed.reduce((s, p) => (p.alt_avg != null ? s + (n(p.alt_avg) - n(p.unit_price)) * n(p.qty) : s), 0);
  // Left on the table: chosen price above the cheapest vendor that could have supplied that quantity.
  const missed = committed.reduce((s, p) => (p.best_price != null && n(p.unit_price) > n(p.best_price) ? s + (n(p.unit_price) - n(p.best_price)) * n(p.qty) : s), 0);

  const vendors = new Map<string, { supplier: string; pos: number; qty: number; spend: number; lead: number; leadN: number }>();
  for (const p of committed) {
    const k = String(p.supplier ?? "unknown");
    const cur = vendors.get(k) ?? { supplier: k, pos: 0, qty: 0, spend: 0, lead: 0, leadN: 0 };
    cur.pos += 1;
    cur.qty += n(p.qty);
    cur.spend += n(p.total_price);
    if (p.lead_time_days != null) {
      cur.lead += n(p.lead_time_days);
      cur.leadN += 1;
    }
    vendors.set(k, cur);
  }

  const betterVendor = committed
    .filter((p) => p.best_price != null && n(p.unit_price) > n(p.best_price))
    .map((p) => ({
      material: String(p.material),
      chosen: String(p.supplier),
      chosenPrice: n(p.unit_price),
      better: String(p.best_supplier),
      betterPrice: n(p.best_price),
      qty: n(p.qty),
      extraProfit: (n(p.unit_price) - n(p.best_price)) * n(p.qty),
    }))
    .sort((a, b) => b.extraProfit - a.extraProfit)
    .slice(0, 8);

  const inv = (await sql`
    SELECT m.name, m.unit, m.reorder_point, m.std_cost, b.on_hand, b.reserved, b.on_order
    FROM materials m JOIN inventory_balances b ON b.material_id = m.id ORDER BY m.name
  `) as Row[];
  const stockValue = inv.reduce((s, r) => s + n(r.on_hand) * n(r.std_cost), 0);
  const reservedValue = inv.reduce((s, r) => s + n(r.reserved) * n(r.std_cost), 0);
  const onOrderValue = inv.reduce((s, r) => s + n(r.on_order) * n(r.std_cost), 0);
  const lowStock = inv.filter((r) => r.reorder_point != null && n(r.on_hand) - n(r.reserved) < n(r.reorder_point)).map((r) => String(r.name));

  const con = (await sql`
    SELECT count(*) FILTER (WHERE status = 'active' AND current_date BETWEEN valid_from AND valid_to)::int AS active,
           count(*) FILTER (WHERE status = 'active' AND current_date BETWEEN valid_from AND valid_to AND valid_to < current_date + 90)::int AS expiring,
           count(*) FILTER (WHERE status <> 'active' OR valid_to < current_date)::int AS inactive
    FROM contracts
  `) as Row[];

  const agents = (await sql`
    SELECT agent, count(*)::int AS runs, count(*) FILTER (WHERE status = 'failed')::int AS failed,
           avg(extract(epoch FROM (finished_at - started_at)) * 1000)::int AS avg_ms
    FROM agent_runs GROUP BY agent ORDER BY runs DESC
  `) as Row[];
  const ev = (await sql`SELECT status, count(*)::int AS c FROM events GROUP BY status`) as Row[];

  return {
    profit: {
      revenue, cogs, grossProfit: revenue - cogs, margin: revenue > 0 ? (revenue - cogs) / revenue : 0,
      pipelineRevenue, pipelineProfit: pipelineRevenue - pipelineCost, completedOrders: done.length,
    },
    orders: { total: orderMoney.length, byStatus, startedToday, dailyLimit: settings.dailyOrderLimit },
    days,
    byProduct: [...byProduct.values()].sort((a, b) => b.profit - a.profit),
    purchasing: {
      spend, pendingValue, savedVsOthers, missed,
      pos: committed.length, auto: committed.filter((p) => p.source === "auto").length,
      awaitingApproval: pos.filter((p) => p.status === "needs_approval").length,
      vendors: [...vendors.values()].map((v) => ({ ...v, avgLead: v.leadN ? v.lead / v.leadN : null })).sort((a, b) => b.spend - a.spend),
      betterVendor,
    },
    inventory: {
      stockValue, reservedValue, onOrderValue, lowStock,
      items: inv.map((r) => ({ name: String(r.name), onHand: n(r.on_hand), reserved: n(r.reserved), onOrder: n(r.on_order) })),
    },
    contracts: { active: n(con[0].active), expiring: n(con[0].expiring), inactive: n(con[0].inactive) },
    agents: agents.map((a) => ({ agent: String(a.agent), runs: n(a.runs), failed: n(a.failed), avgMs: n(a.avg_ms) })),
    events: Object.fromEntries(ev.map((e) => [String(e.status), n(e.c)])),
  };
}
