import { handle, readJson } from "@/lib/api";
import { createOrder, listOrders, validateOrder } from "@/lib/orders";
import { drainEvents } from "@/lib/event-processor";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ orders: await listOrders() }));
}

// Creates the order, then runs the event chain so the reply already contains the
// outcome (BOM posted, stock reserved, purchases decided).
export function POST(request: Request) {
  return handle(async () => {
    const input = validateOrder(await readJson(request));
    const created = await createOrder(input);
    const processed = await drainEvents();
    return { ...created, processed };
  });
}
