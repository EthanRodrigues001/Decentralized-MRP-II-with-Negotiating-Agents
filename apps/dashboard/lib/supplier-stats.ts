import { sql } from "@/lib/db";
import { ITEM_CATEGORY, type SupplierName, type SupplierStats } from "@/lib/types";

// Each SupplierAgent may only read its OWN supplier's rows — this is the
// state-ownership boundary from docs/02-design/system-architecture.md applied
// to the seeded dataset instead of a live agent-owned table.
export async function getSupplierStats(supplier: SupplierName): Promise<SupplierStats> {
  const rows = await sql`
    SELECT
      count(*)::int AS history_count,
      avg(delivery_date - order_date) FILTER (WHERE delivery_date IS NOT NULL) AS avg_lead_time_days,
      avg(unit_price) AS avg_unit_price,
      avg(negotiated_price) AS avg_negotiated_price,
      sum(defective_units) FILTER (WHERE defective_units IS NOT NULL) AS total_defects,
      sum(quantity) FILTER (WHERE defective_units IS NOT NULL) AS quantity_with_known_defects,
      avg(compliance::int) AS compliance_rate,
      max(quantity) AS max_quantity
    FROM procurement_orders
    WHERE supplier = ${supplier} AND item_category = ${ITEM_CATEGORY}
  `;

  const r = rows[0] as Record<string, string | number | null>;
  const historyCount = Number(r.history_count ?? 0);
  const totalDefects = r.total_defects === null ? null : Number(r.total_defects);
  const qtyWithDefects = r.quantity_with_known_defects === null ? null : Number(r.quantity_with_known_defects);

  return {
    supplier,
    historyCount,
    avgLeadTimeDays: r.avg_lead_time_days === null ? null : Number(r.avg_lead_time_days),
    avgUnitPrice: Number(r.avg_unit_price ?? 0),
    avgNegotiatedPrice: Number(r.avg_negotiated_price ?? 0),
    defectRatePercent:
      totalDefects === null || qtyWithDefects === null || qtyWithDefects === 0
        ? null
        : (totalDefects / qtyWithDefects) * 100,
    compliancePercent: Number(r.compliance_rate ?? 0) * 100,
    maxHistoricalQuantity: Number(r.max_quantity ?? 0),
  };
}
