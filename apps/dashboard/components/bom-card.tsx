"use client";

import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BomDocument } from "@/lib/bom";
import { useMoney } from "@/components/currency-provider";


// Indented-BOM level notation used on engineering and purchasing documents:
// 0 for the finished item, .1 for sub-assemblies, ..2 for purchased parts.
const LEVEL_LABEL = ["0", ".1", "..2"] as const;

const COLUMNS: { key: string; label: string; right?: boolean; tip?: string }[] = [
  { key: "lvl", label: "Lvl", tip: "Indentation level. 0 is the finished item, .1 a sub-assembly, ..2 a purchased component." },
  { key: "part", label: "Part no." },
  { key: "desc", label: "Description" },
  { key: "qty", label: "Qty / unit", right: true, tip: "Quantity of this part needed for one finished item, before scrap." },
  { key: "uom", label: "UoM", tip: "Unit of measure." },
  { key: "scrap", label: "Scrap %", right: true, tip: "Allowance for offcuts and defects, added on top of the net quantity." },
  { key: "gross", label: "Gross qty", right: true, tip: "Order quantity x qty per unit x (1 + scrap), rounded up to a whole unit. This is what gets reserved." },
  { key: "cost", label: "Unit cost", right: true, tip: "Standard cost per unit of measure." },
  { key: "ext", label: "Ext. cost", right: true, tip: "Gross qty x unit cost. Sub-assembly rows show the subtotal of their parts." },
  { key: "lead", label: "Lead (d)", right: true, tip: "Shortest supplier lead time among contracts valid today." },
  { key: "stock", label: "Stock" },
];

export function BomCard({ document: doc, orderRef }: { document: BomDocument; orderRef?: string }) {
  const { money: fmt } = useMoney();
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "" : fmt(n));
  return (
    <TooltipProvider delay={150}>
      <div className="w-full min-w-0 overflow-hidden rounded-md border bg-card text-card-foreground">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b bg-muted/40 px-3 py-2">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Bill of materials</div>
            <div className="text-sm font-semibold">
              {doc.product.name} <span className="font-mono text-xs font-normal text-muted-foreground">{doc.product.sku}</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] sm:grid-cols-4">
            {[
              ["Revision", doc.product.revision],
              ["Order qty", String(doc.orderQty)],
              ["Date", doc.generatedOn],
              ["Order", orderRef ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[11px]">
            <thead>
              <tr className="border-b bg-muted/20 text-left text-muted-foreground">
                {COLUMNS.map((c) => (
                  <th key={c.key} className={`px-2 py-1.5 font-medium whitespace-nowrap ${c.right ? "text-right" : ""}`}>
                    <span className={`inline-flex items-center gap-1 ${c.right ? "flex-row-reverse" : ""}`}>
                      {c.label}
                      {c.tip && <InfoTip label={c.label}>{c.tip}</InfoTip>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doc.rows.map((r, i) => {
                const strong = r.level < 2;
                return (
                  <tr
                    key={i}
                    className={`border-b last:border-b-0 ${r.level === 0 ? "bg-muted/40 font-semibold" : r.level === 1 ? "bg-muted/20 font-medium" : ""}`}
                  >
                    <td className="px-2 py-1 font-mono text-muted-foreground">{LEVEL_LABEL[r.level]}</td>
                    <td className="px-2 py-1 font-mono whitespace-nowrap">{r.partNo}</td>
                    <td className="px-2 py-1 whitespace-nowrap" style={{ paddingLeft: `${0.5 + r.level * 0.75}rem` }}>
                      {r.description}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">{r.qtyPer ?? ""}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.uom ?? ""}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">{r.scrapPct === null ? "" : r.scrapPct.toFixed(1)}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">{r.grossQty ?? ""}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">{money(r.unitCost)}</td>
                    <td className={`px-2 py-1 text-right font-mono tabular-nums ${strong ? "" : ""}`}>{money(r.extCost)}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                      {r.level === 2 ? (r.leadTimeDays ?? "—") : ""}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      {r.level === 2 &&
                        ((r.shortBy ?? 0) > 0 ? (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            Short {r.shortBy}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                            In stock
                          </Badge>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-3 py-2 text-[11px]">
          <span className="text-muted-foreground">
            {doc.shortLines > 0
              ? `${doc.shortLines} component${doc.shortLines > 1 ? "s" : ""} short against current stock`
              : "All components available against current stock"}
          </span>
          <span className="font-mono">
            <span className="text-muted-foreground">Cost / unit </span>
            <span className="font-semibold">{money(doc.unitCost)}</span>
            <span className="mx-2 text-muted-foreground">|</span>
            <span className="text-muted-foreground">Total material </span>
            <span className="font-semibold">{money(doc.totalCost)}</span>
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
