import { sql } from "@/lib/db";

export type DisplayStatus = "working" | "waiting" | "needs_approval" | "ready" | "done" | "rejected" | "cancelled";

export interface ThreadSummary {
  id: string;
  kind: "order" | "request" | "procurement";
  title: string;
  subtitle: string;
  displayStatus: DisplayStatus;
  /** Finished threads can be settled to get them out of the way. */
  settleable: boolean;
  settled: boolean;
  recurring: boolean;
  createdAt: string;
}

const ORDER_STATUS: Record<string, DisplayStatus> = {
  new: "working",
  awaiting_stock: "waiting",
  ready: "ready",
  in_production: "working",
  completed: "done",
  cancelled: "cancelled",
};

const PROCUREMENT_STATUS: Record<string, DisplayStatus> = {
  awaiting_approval: "needs_approval",
  committed: "done",
  rejected: "rejected",
};

function requestStatus(r: Record<string, unknown>): DisplayStatus {
  if (r.status === "completed") return "done";
  if (r.status === "cancelled") return "cancelled";
  return Number(r.req_held ?? 0) >= Number(r.quantity) ? "ready" : "waiting";
}

export function summarise(r: Record<string, unknown>): ThreadSummary {
  const isOrder = r.ref != null;
  const isRequest = !isOrder && r.material_id != null;
  let status: DisplayStatus = isOrder
    ? (ORDER_STATUS[String(r.order_status)] ?? "working")
    : isRequest
      ? requestStatus(r)
      : (PROCUREMENT_STATUS[String(r.status)] ?? "working");
  if ((isOrder || isRequest) && r.needs_approval && status !== "done" && status !== "cancelled") status = "needs_approval";
  const finished = status === "done" || status === "rejected" || status === "cancelled";
  return {
    id: r.id as string,
    kind: isOrder ? "order" : isRequest ? "request" : "procurement",
    title: isOrder || isRequest
      ? `${r.quantity} x ${r.item_category}`
      : `${r.quantity} units of ${String(r.item_category).toLowerCase()}`,
    subtitle: isOrder
      ? `${r.ref} · ${r.customer} · due ${r.due_date}`
      : isRequest
        ? `Material request · due in ${r.due_in_days} days`
        : r.winning_supplier
        ? `Won by ${String(r.winning_supplier).replace(/_/g, " ")}`
        : `Due in ${r.due_in_days} days`,
    displayStatus: status,
    settleable: finished,
    settled: r.settled_at != null,
    recurring: r.recurring_id != null,
    createdAt: String(r.created_at),
  };
}

export async function listThreads(): Promise<ThreadSummary[]> {
  const rows = (await sql`
    SELECT n.id, n.item_category, n.quantity, n.due_in_days, n.status, n.winning_supplier, n.created_at, n.settled_at, n.material_id,
           (SELECT coalesce(sum(delta), 0)::int FROM stock_movements
             WHERE ref_type = 'request' AND ref_id = n.id::text AND kind IN ('reserve', 'release')) AS req_held,
           o.ref, o.status AS order_status, o.customer, o.recurring_id, o.due_date::text AS due_date,
           EXISTS (SELECT 1 FROM purchase_orders p WHERE p.negotiation_id = n.id AND p.status = 'needs_approval') AS needs_approval
    FROM negotiations n LEFT JOIN customer_orders o ON o.negotiation_id = n.id
    ORDER BY n.created_at DESC LIMIT 200
  `) as Record<string, unknown>[];
  return rows.map(summarise);
}

export async function settleThread(id: string, settled: boolean) {
  const all = await listThreads();
  const t = all.find((x) => x.id === id);
  if (!t) throw new Error("unknown thread");
  if (settled && !t.settleable) throw new Error("only finished threads can be settled");
  await sql`UPDATE negotiations SET settled_at = ${settled ? new Date().toISOString() : null} WHERE id = ${id}`;
}

export async function settleAllFinished(): Promise<number> {
  const ids = (await listThreads()).filter((t) => t.settleable && !t.settled).map((t) => t.id);
  if (ids.length === 0) return 0;
  await sql`UPDATE negotiations SET settled_at = now() WHERE id = ANY(${ids}::uuid[]) AND settled_at IS NULL`;
  return ids.length;
}

export async function runsForThread(threadId: string | null, limit = 40) {
  const rows = await sql`
    SELECT r.id, r.agent, r.title, r.status, r.started_at, r.finished_at, r.thread_id,
      coalesce((
        SELECT json_agg(json_build_object('seq', s.seq, 'kind', s.kind, 'name', s.name,
                                          'input', s.input, 'output', s.output, 'at', s.created_at) ORDER BY s.seq)
        FROM agent_steps s WHERE s.run_id = r.id), '[]'::json) AS steps
    FROM agent_runs r
    WHERE ${threadId}::uuid IS NULL OR r.thread_id = ${threadId}::uuid
    ORDER BY r.started_at ASC LIMIT ${limit}
  `;
  return rows;
}
