"use client";

import type { InventoryRow } from "@/lib/inventory";

// Custom horizontal stacked bars (no chart library): for each material the bar
// shows what is reserved, what is still free, and what is on its way, against a
// shared scale, with a tick at the reorder point. Exact numbers stay in the table.

const COLORS = {
  reserved: "#6366f1",
  available: "#10b981",
  onOrder: "repeating-linear-gradient(45deg, #10b98166 0 4px, #10b98122 4px 8px)",
};

export function StockPosition({ rows }: { rows: InventoryRow[] }) {
  const scaleMax = Math.max(1, ...rows.map((r) => Math.max(r.onHand + r.onOrder, r.reorderPoint ?? 0))) * 1.05;
  const pct = (n: number) => `${(Math.max(0, n) / scaleMax) * 100}%`;

  return (
    <figure className="rounded-md border bg-card p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium">Stock position</span>
        <span className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><i className="size-2 rounded-sm" style={{ background: COLORS.reserved }} />Reserved</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-sm" style={{ background: COLORS.available }} />Available</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-sm border border-emerald-500/50" style={{ background: COLORS.onOrder }} />On order</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-px bg-foreground" />Reorder at</span>
        </span>
      </figcaption>

      <ul className="space-y-2.5" role="list">
        {rows.map((r) => {
          const available = Math.max(0, r.onHand - r.reserved);
          return (
            <li
              key={r.materialId}
              className="grid grid-cols-[9rem_1fr_6.5rem] items-center gap-3 text-[11px]"
              aria-label={`${r.name}: ${r.reserved} reserved, ${available} available, ${r.onOrder} on order`}
            >
              <span className="truncate font-medium">{r.name}</span>
              <div className="relative h-4 rounded-sm bg-muted/50">
                <div className="absolute inset-y-0 left-0 flex overflow-hidden rounded-sm">
                  <div style={{ width: pct(r.reserved), background: COLORS.reserved, height: "100%" }} title={`${r.reserved} reserved`} />
                  <div style={{ width: pct(available), background: COLORS.available, height: "100%" }} title={`${available} available`} />
                  <div style={{ width: pct(r.onOrder), background: COLORS.onOrder, height: "100%" }} title={`${r.onOrder} on order`} />
                </div>
                {r.reorderPoint !== null && (
                  <div className="absolute -inset-y-0.5 w-px bg-foreground" style={{ left: pct(r.reorderPoint) }} title={`Reorder at ${r.reorderPoint}`} />
                )}
              </div>
              <span className="text-right font-mono tabular-nums text-muted-foreground">
                {available} free / {r.onHand}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
