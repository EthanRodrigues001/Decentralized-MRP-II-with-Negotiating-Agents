import { handle } from "@/lib/api";
import { listPurchaseOrders } from "@/lib/purchasing";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ purchaseOrders: await listPurchaseOrders() }));
}
