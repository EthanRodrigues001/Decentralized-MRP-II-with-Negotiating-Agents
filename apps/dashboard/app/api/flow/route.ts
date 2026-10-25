import { handle } from "@/lib/api";
import { sql } from "@/lib/db";
import { listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Everything the flow canvas needs in one call: live orders with their
// allocations, the materials they compete for, and open purchases.
export function GET() {
  return handle(async () => {
    const [orders, materials, purchases] = await Promise.all([
      listOrders(60),
      sql`SELECT m.id, m.sku, m.name, m.unit, b.on_hand, b.reserved, b.on_order
          FROM materials m JOIN inventory_balances b ON b.material_id = m.id ORDER BY m.name`,
      sql`SELECT p.id, p.material_id, p.supplier, p.qty, p.status, p.expected_at::text AS expected_at
          FROM purchase_orders p WHERE p.status IN ('needs_approval', 'placed') ORDER BY p.created_at`,
    ]);
    return { orders, materials, purchases };
  });
}
