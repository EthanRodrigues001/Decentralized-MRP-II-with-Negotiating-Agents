import { handle, readJson } from "@/lib/api";
import { transitionOrder, type OrderAction } from "@/lib/orders";
import { drainEvents } from "@/lib/event-processor";

const ACTIONS: OrderAction[] = ["start", "complete", "cancel"];

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { action } = await readJson(request);
    if (!ACTIONS.includes(action as OrderAction)) throw new Error("action must be start, complete or cancel");
    await transitionOrder(id, action as OrderAction);
    return { ok: true, processed: await drainEvents() };
  });
}
