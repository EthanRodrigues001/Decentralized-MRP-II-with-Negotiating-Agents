import { sql } from "@/lib/db";
import { ITEM_CATEGORY } from "@/lib/types";

// Every supplier that actually has Raw Materials history — not a hardcoded
// pair. A new agent instance is spun up per supplier per negotiation, so
// adding a 6th supplier to the dataset needs no code change here.
export async function getActiveSupplierNames(): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT supplier
    FROM procurement_orders
    WHERE item_category = ${ITEM_CATEGORY}
    ORDER BY supplier
  `;
  return (rows as { supplier: string }[]).map((r) => r.supplier);
}
