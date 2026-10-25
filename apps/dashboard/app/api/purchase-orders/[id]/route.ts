import { handle, readJson } from "@/lib/api";
import { sql } from "@/lib/db";
import { transitionPurchaseOrder, type PurchaseOrderAction } from "@/lib/purchasing";

const ACTIONS: PurchaseOrderAction[] = ["approve", "receive", "cancel"];

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { action } = await readJson(request);
    if (!ACTIONS.includes(action as PurchaseOrderAction)) throw new Error("action must be approve, receive or cancel");
    await transitionPurchaseOrder(id, action as PurchaseOrderAction);
    return { ok: true };
  });
}

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const rows = (await sql`SELECT status FROM purchase_orders WHERE id = ${id}`) as { status: string }[];
    if (rows.length === 0) throw new Error("unknown purchase order");
    return { status: rows[0].status };
  });
}
