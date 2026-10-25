// Pure BOM maths (no DB) so it can be unit-tested. Quantities are exploded the
// way a planner would: gross = order qty x qty per unit x (1 + scrap), rounded
// up to a whole stocking unit.

export interface BomLineInput {
  assembly: string;
  materialId: string;
  sku: string;
  name: string;
  unit: string;
  qtyPerUnit: number;
  scrapPct: number;
  unitCost: number;
  sort: number;
}

export interface BomRow {
  level: 0 | 1 | 2;
  /** Part number: product SKU, assembly name, or material SKU. */
  partNo: string;
  description: string;
  qtyPer: number | null;
  uom: string | null;
  scrapPct: number | null;
  grossQty: number | null;
  unitCost: number | null;
  extCost: number;
  materialId?: string;
}

export function grossQty(orderQty: number, qtyPerUnit: number, scrapPct: number): number {
  // Round away float noise before the ceiling (e.g. 10 x 0.5 x 1.02 = 5.1000000000000005).
  return Math.ceil(Number((orderQty * qtyPerUnit * (1 + scrapPct / 100)).toFixed(6)));
}

export function explodeBom(
  product: { sku: string; name: string },
  lines: BomLineInput[],
  orderQty: number
): { rows: BomRow[]; totalCost: number; unitCost: number } {
  const sorted = [...lines].sort((a, b) => a.sort - b.sort);
  const assemblies: string[] = [];
  for (const l of sorted) if (!assemblies.includes(l.assembly)) assemblies.push(l.assembly);

  const body: BomRow[] = [];
  let total = 0;
  for (const assembly of assemblies) {
    const parts = sorted.filter((l) => l.assembly === assembly);
    const partRows: BomRow[] = parts.map((l) => {
      const gross = grossQty(orderQty, l.qtyPerUnit, l.scrapPct);
      return {
        level: 2,
        partNo: l.sku,
        description: l.name,
        qtyPer: l.qtyPerUnit,
        uom: l.unit,
        scrapPct: l.scrapPct,
        grossQty: gross,
        unitCost: l.unitCost,
        extCost: Number((gross * l.unitCost).toFixed(2)),
        materialId: l.materialId,
      };
    });
    const sub = partRows.reduce((s, r) => s + r.extCost, 0);
    total += sub;
    body.push({
      level: 1,
      partNo: assembly.toUpperCase().replace(/\s+/g, "-"),
      description: assembly,
      qtyPer: null,
      uom: null,
      scrapPct: null,
      grossQty: null,
      unitCost: null,
      extCost: Number(sub.toFixed(2)),
    });
    body.push(...partRows);
  }

  const totalCost = Number(total.toFixed(2));
  const top: BomRow = {
    level: 0,
    partNo: product.sku,
    description: product.name,
    qtyPer: 1,
    uom: "ea",
    scrapPct: null,
    grossQty: orderQty,
    unitCost: orderQty > 0 ? Number((totalCost / orderQty).toFixed(2)) : 0,
    extCost: totalCost,
  };
  return { rows: [top, ...body], totalCost, unitCost: top.unitCost ?? 0 };
}
