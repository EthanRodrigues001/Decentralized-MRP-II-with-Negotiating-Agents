"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/info-tip";
import { useMoney } from "@/components/currency-provider";
import type { getAnalytics } from "@/lib/analytics";

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

const STATUS_LABEL: Record<string, string> = {
  new: "Planning",
  awaiting_stock: "Awaiting stock",
  ready: "Ready",
  in_production: "In production",
  completed: "Completed",
  cancelled: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-slate-400",
  awaiting_stock: "bg-amber-500",
  ready: "bg-sky-500",
  in_production: "bg-violet-500",
  completed: "bg-emerald-500",
  cancelled: "bg-muted-foreground/40",
};

function Kpi({ label, value, sub, tip, tone }: { label: string; value: string; sub?: string; tip: string; tone?: "good" | "bad" }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-0.5">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {label}
          <InfoTip label={label}>{tip}</InfoTip>
        </div>
        <div className={`font-mono text-xl font-semibold tabular-nums ${tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-red-500" : ""}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Panel({ title, tip, children, className }: { title: string; tip?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1 text-xs">
          {title}
          {tip && <InfoTip label={String(title)}>{tip}</InfoTip>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Daily profit bars: height is profit, drawn from a shared zero line.
function ProfitBars({ days, compact }: { days: Analytics["days"]; compact: (n: number) => string }) {
  const max = Math.max(1, ...days.map((d) => Math.abs(d.profit)));
  return (
    <div className="flex h-36 items-end gap-1.5">
      {days.map((d) => {
        const h = Math.round((Math.abs(d.profit) / max) * 100);
        return (
          <div key={d.day} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${compact(d.profit)} profit, ${d.orders} orders`}>
            <div className="text-[9px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100">{d.profit ? compact(d.profit) : ""}</div>
            <div className={`w-full rounded-sm ${d.profit < 0 ? "bg-red-500/70" : "bg-emerald-500/80"}`} style={{ height: `${Math.max(d.profit ? 3 : 1, h)}%` }} />
            <div className="text-[9px] text-muted-foreground">{d.day.slice(8)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Meter({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const name = (s: string) => s.replace(/_/g, " ");

export function DashboardView() {
  const { money, compact } = useMoney();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/analytics")
        .then((r) => r.json())
        .then((d) => alive && (d.error ? setError(d.error) : setData(d)))
        .catch((e) => alive && setError(String(e)));
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  const { profit, orders, purchasing, inventory, contracts, agents, events } = data;
  const statusTotal = Object.values(orders.byStatus).reduce((a, b) => a + b, 0) || 1;
  const maxStock = Math.max(1, ...inventory.items.map((i) => i.onHand + i.onOrder));
  const maxVendor = Math.max(1, ...purchasing.vendors.map((v) => v.spend));

  return (
    <TooltipProvider>
      <ScrollArea className="h-full">
        <div className="space-y-3 p-4">
          <div>
            <h1 className="text-lg font-semibold">Dashboard</h1>
            <p className="text-xs text-muted-foreground">Profit, purchasing, stock and agent activity. Updates every 15 seconds.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-6">
            <Kpi label="Revenue" value={compact(profit.revenue)} sub={`${profit.completedOrders} completed orders`} tip="Quantity times selling price for orders you have finished." />
            <Kpi label="Gross profit" value={compact(profit.grossProfit)} tone={profit.grossProfit >= 0 ? "good" : "bad"} sub={`${(profit.margin * 100).toFixed(1)}% margin`} tip="Revenue minus the materials each finished order used, at standard cost." />
            <Kpi label="Open pipeline profit" value={compact(profit.pipelineProfit)} sub={`${compact(profit.pipelineRevenue)} revenue not yet finished`} tip="What orders still in progress would earn if they finish at current prices." />
            <Kpi label="Purchasing spend" value={compact(purchasing.spend)} sub={`${purchasing.pos} purchases, ${purchasing.auto} automatic`} tip="Placed and received purchase orders." />
            <Kpi label="Saved vs other vendors" value={compact(purchasing.savedVsOthers)} tone={purchasing.savedVsOthers >= 0 ? "good" : "bad"} sub="against their average price" tip="For each purchase: what the other vendors with a valid contract for that quantity would have charged on average, minus what we paid." />
            <Kpi label="Missed by vendor choice" value={compact(purchasing.missed)} tone={purchasing.missed > 0 ? "bad" : undefined} sub="vs the cheapest valid contract" tip="Extra profit we would have made by always buying from the cheapest vendor whose contract covered the quantity." />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="Profit per day, last 14 days" tip="By the day an order was marked complete." className="lg:col-span-2">
              <ProfitBars days={data.days} compact={compact} />
            </Panel>
            <Panel title="Today's production" tip="Orders the production agent may start by itself each day is set in Settings. Urgent orders always start.">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-semibold tabular-nums">{orders.startedToday}</span>
                  <span className="text-xs text-muted-foreground">of {orders.dailyLimit} daily limit started</span>
                </div>
                <Meter value={orders.startedToday} max={orders.dailyLimit} color={orders.startedToday >= orders.dailyLimit ? "bg-amber-500" : "bg-emerald-500"} />
                <div className="space-y-1 pt-1">
                  {Object.entries(STATUS_LABEL).map(([k, label]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className={`size-2 rounded-full ${STATUS_COLOR[k]}`} />
                      <span className="flex-1">{label}</span>
                      <span className="font-mono tabular-nums">{orders.byStatus[k] ?? 0}</span>
                      <span className="w-10 text-right text-muted-foreground tabular-nums">{Math.round(((orders.byStatus[k] ?? 0) / statusTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Vendors" tip="Spend and delivery by supplier across placed and received purchases.">
              {purchasing.vendors.length === 0 ? (
                <p className="text-xs text-muted-foreground">No purchases yet.</p>
              ) : (
                <div className="space-y-2">
                  {purchasing.vendors.map((v) => (
                    <div key={v.supplier} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span>{name(v.supplier)}</span>
                        <span className="font-mono tabular-nums">{money(v.spend, 0)}</span>
                      </div>
                      <Meter value={v.spend} max={maxVendor} />
                      <div className="text-[11px] text-muted-foreground">
                        {v.pos} purchase{v.pos > 1 ? "s" : ""} · {v.qty.toLocaleString()} units{v.avgLead != null ? ` · avg lead ${v.avgLead.toFixed(1)} d` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Where another vendor would have paid more" tip="Purchases where a cheaper vendor had a valid contract for that quantity. Extra profit is the price gap times the quantity.">
              {purchasing.betterVendor.length === 0 ? (
                <p className="text-xs text-muted-foreground">Every purchase went to the cheapest valid contract.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-7 text-[11px]">Material</TableHead>
                      <TableHead className="h-7 text-[11px]">Bought from</TableHead>
                      <TableHead className="h-7 text-[11px]">Cheaper</TableHead>
                      <TableHead className="h-7 text-right text-[11px]">Extra profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchasing.betterVendor.map((b, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="py-1">{b.material}</TableCell>
                        <TableCell className="py-1">{name(b.chosen)} <span className="text-muted-foreground">{money(b.chosenPrice)}</span></TableCell>
                        <TableCell className="py-1">{name(b.better)} <span className="text-muted-foreground">{money(b.betterPrice)}</span></TableCell>
                        <TableCell className="py-1 text-right font-mono tabular-nums">{money(b.extraProfit, 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="Profit by product">
              {data.byProduct.length === 0 ? (
                <p className="text-xs text-muted-foreground">Finish an order to see this.</p>
              ) : (
                <Table>
                  <TableBody>
                    {data.byProduct.map((p) => (
                      <TableRow key={p.product} className="text-xs">
                        <TableCell className="py-1">{p.product}</TableCell>
                        <TableCell className="py-1 text-right text-muted-foreground tabular-nums">{p.units} units</TableCell>
                        <TableCell className="py-1 text-right font-mono tabular-nums">{money(p.profit, 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
            <Panel title="Inventory" tip="Value is on-hand quantity at standard cost.">
              <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-[11px] text-muted-foreground">In stock</div><div className="font-mono tabular-nums">{compact(inventory.stockValue)}</div></div>
                <div><div className="text-[11px] text-muted-foreground">Reserved</div><div className="font-mono tabular-nums">{compact(inventory.reservedValue)}</div></div>
                <div><div className="text-[11px] text-muted-foreground">On order</div><div className="font-mono tabular-nums">{compact(inventory.onOrderValue)}</div></div>
              </div>
              <div className="space-y-1.5">
                {inventory.items.map((i) => (
                  <div key={i.name} className="space-y-0.5">
                    <div className="flex justify-between text-[11px]">
                      <span>{i.name}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{i.onHand - i.reserved} free / {i.onHand}</span>
                    </div>
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="bg-violet-500" style={{ width: `${(i.reserved / maxStock) * 100}%` }} />
                      <div className="bg-emerald-500" style={{ width: `${((i.onHand - i.reserved) / maxStock) * 100}%` }} />
                      <div className="bg-sky-400/60" style={{ width: `${(i.onOrder / maxStock) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {inventory.lowStock.length > 0 && <p className="mt-2 text-[11px] text-amber-500">Below reorder point: {inventory.lowStock.join(", ")}</p>}
            </Panel>
            <Panel title="Contracts and agents">
              <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-[11px] text-muted-foreground">Active</div><div className="font-mono tabular-nums">{contracts.active}</div></div>
                <div><div className="text-[11px] text-muted-foreground">Expiring</div><div className="font-mono tabular-nums text-amber-500">{contracts.expiring}</div></div>
                <div><div className="text-[11px] text-muted-foreground">Not usable</div><div className="font-mono tabular-nums">{contracts.inactive}</div></div>
              </div>
              <Table>
                <TableBody>
                  {agents.map((a) => (
                    <TableRow key={a.agent} className="text-xs">
                      <TableCell className="py-1">{a.agent}</TableCell>
                      <TableCell className="py-1 text-right font-mono tabular-nums">{a.runs} runs</TableCell>
                      <TableCell className="py-1 text-right text-muted-foreground tabular-nums">{a.avgMs ? `${a.avgMs} ms` : ""}{a.failed ? ` · ${a.failed} failed` : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Events: {Object.entries(events).map(([k, v]) => `${v} ${k}`).join(", ") || "none"} · {purchasing.awaitingApproval} purchases awaiting approval ({compact(purchasing.pendingValue)})
              </p>
            </Panel>
          </div>
        </div>
      </ScrollArea>
    </TooltipProvider>
  );
}
