import { sql } from "@/lib/db";
import { explodeBom, type BomLineInput, type BomRow } from "@/lib/bom-calc";
import { todayIso } from "@/lib/contract-rules";

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  revision: string;
  keywords: string[];
}

export interface BomDocumentRow extends BomRow {
  /** Stock available right now (components only). */
  available?: number;
  /** Units missing against current stock, before any reservation (components only). */
  shortBy?: number;
  /** Shortest lead time across contracts valid today (components only). */
  leadTimeDays?: number | null;
}

export interface BomDocument {
  product: ProductRow;
  orderQty: number;
  generatedOn: string;
  rows: BomDocumentRow[];
  totalCost: number;
  unitCost: number;
  shortLines: number;
}

export async function listProducts(): Promise<ProductRow[]> {
  const rows = (await sql`SELECT id, sku, name, revision, keywords FROM products ORDER BY name`) as ProductRow[];
  return rows;
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  const rows = (await sql`SELECT id, sku, name, revision, keywords FROM products WHERE id = ${id}`) as ProductRow[];
  return rows[0] ?? null;
}

/** Match free text such as "10 dining tables" to a product by its keywords. Longest keyword wins. */
export async function matchProduct(text: string): Promise<ProductRow | null> {
  const lower = text.toLowerCase();
  let best: { p: ProductRow; len: number } | null = null;
  for (const p of await listProducts()) {
    for (const k of [p.name.toLowerCase(), ...p.keywords]) {
      if (lower.includes(k) && (!best || k.length > best.len)) best = { p, len: k.length };
    }
  }
  return best?.p ?? null;
}

export async function buildBomDocument(productId: string, orderQty: number): Promise<BomDocument> {
  const product = await getProduct(productId);
  if (!product) throw new Error("unknown product");
  if (!Number.isInteger(orderQty) || orderQty <= 0) throw new Error("orderQty must be a positive integer");

  const lines = (await sql`
    SELECT b.assembly, b.material_id, m.sku, m.name, m.unit, b.qty_per_unit, b.scrap_pct, m.std_cost, b.sort
    FROM bom_lines b JOIN materials m ON m.id = b.material_id
    WHERE b.product_id = ${productId} ORDER BY b.sort
  `) as Record<string, string | number>[];
  const input: BomLineInput[] = lines.map((l) => ({
    assembly: String(l.assembly),
    materialId: String(l.material_id),
    sku: String(l.sku),
    name: String(l.name),
    unit: String(l.unit),
    qtyPerUnit: Number(l.qty_per_unit),
    scrapPct: Number(l.scrap_pct),
    unitCost: Number(l.std_cost),
    sort: Number(l.sort),
  }));
  const { rows, totalCost, unitCost } = explodeBom(product, input, orderQty);

  const stock = (await sql`SELECT material_id, on_hand - reserved AS available FROM inventory_balances`) as {
    material_id: string;
    available: number;
  }[];
  const availableBy = new Map(stock.map((s) => [s.material_id, Number(s.available)]));
  const leads = (await sql`
    SELECT material_id, min(lead_time_days)::int AS lead
    FROM contracts
    WHERE status = 'active' AND ${todayIso()}::date BETWEEN valid_from AND valid_to
    GROUP BY material_id
  `) as { material_id: string; lead: number }[];
  const leadBy = new Map(leads.map((l) => [l.material_id, Number(l.lead)]));

  let shortLines = 0;
  const docRows: BomDocumentRow[] = rows.map((r) => {
    if (r.level !== 2 || !r.materialId) return r;
    const available = Math.max(0, availableBy.get(r.materialId) ?? 0);
    const shortBy = Math.max(0, (r.grossQty ?? 0) - available);
    if (shortBy > 0) shortLines++;
    return { ...r, available, shortBy, leadTimeDays: leadBy.get(r.materialId) ?? null };
  });

  return {
    product,
    orderQty,
    generatedOn: todayIso(),
    rows: docRows,
    totalCost,
    unitCost,
    shortLines,
  };
}
