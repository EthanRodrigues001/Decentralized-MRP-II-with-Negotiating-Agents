"use client";

import { useMoney } from "@/components/currency-provider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InfoTip } from "@/components/info-tip";
import { StockPosition } from "@/components/charts/stock-position";
import type { InventoryRow } from "@/lib/inventory";

interface Movement {
  id: string;
  material: string;
  delta: number;
  kind: string;
  ref_type: string | null;
  note: string | null;
  created_at: string;
}

interface PurchaseOrder {
  id: string;
  material: string;
  unit: string;
  supplier: string | null;
  qty: number;
  total_price: string | null;
  source: string;
  status: string;
  reason: string | null;
  expected_at: string | null;
  created_at: string;
}

const PO_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  needs_approval: "destructive",
  placed: "secondary",
  received: "outline",
  cancelled: "outline",
};

const KIND_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  receipt: "secondary",
  reserve: "outline",
  release: "outline",
  consume: "outline",
  adjust: "outline",
};

// Column and term explanations shown behind the "i" icons.
const HELP = {
  onHand: "Units physically in the warehouse right now, including units already set aside for requests.",
  reserved: "Units set aside for a request or order. They are still on the shelf but cannot be promised to anything else.",
  available: "On hand minus reserved. This is what you can still hand out today.",
  onOrder: "Units bought from suppliers that have not been delivered yet. They count as incoming supply, so the agent will not buy them twice.",
  projected: "Available plus on order. What you will be able to promise once every open purchase is delivered.",
  reorderPoint: "When available stock falls below this level the material is flagged Low.",
  status: "OK means available is at or above the reorder point. Low means below it. Out means nothing is available.",
  ledger: "Every change to stock is written here and never edited. On-hand and reserved can always be rebuilt from it.",
} as const;

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "request failed");
  return data;
}

function stockStatus(r: InventoryRow): "ok" | "low" | "out" {
  if (r.available <= 0) return "out";
  if (r.reorderPoint !== null && r.available < r.reorderPoint) return "low";
  return "ok";
}

function Num({ children, muted }: { children: number; muted?: boolean }) {
  return (
    <span className={`font-mono tabular-nums ${muted && children === 0 ? "text-muted-foreground/50" : ""}`}>
      {children}
    </span>
  );
}

function HeadWithTip({ label, tip, right }: { label: string; tip: string; right?: boolean }) {
  return (
    <TableHead className={`h-8 text-[11px] ${right ? "text-right" : ""}`}>
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {label}
        <InfoTip label={label}>{tip}</InfoTip>
      </span>
    </TableHead>
  );
}

function Stat({ label, value, tip }: { label: string; value: string | number; tip: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {label}
        <InfoTip label={label}>{tip}</InfoTip>
      </div>
      <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums leading-none">{value}</div>
    </div>
  );
}

// Thin bar: filled part is available stock, tick marks the reorder point.
function StockBar({ r }: { r: InventoryRow }) {
  const max = Math.max(r.onHand, r.reorderPoint ?? 0, 1) * 1.15;
  const status = stockStatus(r);
  const color = status === "ok" ? "bg-emerald-500" : status === "low" ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <div className={`absolute inset-y-0 left-0 ${color}`} style={{ width: `${(Math.max(r.available, 0) / max) * 100}%` }} />
      {r.reorderPoint !== null && (
        <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${(r.reorderPoint / max) * 100}%` }} />
      )}
    </div>
  );
}

export function InventoryView() {
  const { money } = useMoney();
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [adjDelta, setAdjDelta] = useState("");
  const [adjNote, setAdjNote] = useState("");

  const refresh = useCallback(async () => {
    const [inv, po] = await Promise.all([
      fetch("/api/inventory").then((r) => r.json()),
      fetch("/api/purchase-orders").then((r) => r.json()),
    ]);
    setInventory(inv.inventory);
    setMovements(inv.movements);
    setOrders(po.purchaseOrders);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, setState happens after the await
    refresh();
    // The event processor is poll-driven (no worker on serverless).
    const timer = setInterval(async () => {
      await fetch("/api/events/tick", { method: "POST" });
      refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ text });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "failed", error: true });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const reserve = (row: InventoryRow) =>
    run(async () => {
      const n = Number(qty[row.materialId]);
      const r = await post("/api/inventory/request", { materialId: row.materialId, qty: n });
      setQty((p) => ({ ...p, [row.materialId]: "" }));
      return r.shortfall > 0
        ? `Reserved ${r.reserved} of ${n} ${row.unit} of ${row.name}. Short by ${r.shortfall}, so the purchasing agent ran.`
        : `Reserved ${n} ${row.unit} of ${row.name} from stock.`;
    });

  const submitAdjust = () =>
    run(async () => {
      if (!adjusting) return;
      await post("/api/inventory/adjust", {
        materialId: adjusting.materialId,
        delta: Number(adjDelta),
        note: adjNote,
      });
      setAdjusting(null);
      return `Adjusted ${adjusting.name} by ${Number(adjDelta) > 0 ? "+" : ""}${adjDelta}.`;
    });

  const act = (id: string, action: "approve" | "receive" | "cancel") =>
    run(async () => {
      await post(`/api/purchase-orders/${id}`, { action });
    });

  const shown = useMemo(
    () => inventory.filter((r) => `${r.name} ${r.sku}`.toLowerCase().includes(query.toLowerCase())),
    [inventory, query]
  );
  const pending = orders.filter((o) => o.status === "needs_approval").length;
  const lowCount = inventory.filter((r) => stockStatus(r) !== "ok").length;
  const incoming = inventory.reduce((s, r) => s + r.onOrder, 0);
  const adjDeltaValid = Number.isInteger(Number(adjDelta)) && Number(adjDelta) !== 0 && adjDelta.trim() !== "";

  return (
    <TooltipProvider delay={150}>
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold">Inventory</h1>
            <p className="text-xs text-muted-foreground">
              Raw-material stock, reservations and incoming purchases. Reserving more than is available
              wakes the purchasing agent.
            </p>
          </div>
          {message && (
            <p className={`max-w-sm text-right text-xs ${message.error ? "text-destructive" : "text-muted-foreground"}`}>
              {message.text}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Materials" value={inventory.length} tip="Distinct raw materials tracked." />
          <Stat label="Need attention" value={lowCount} tip="Materials that are Low or Out of stock." />
          <Stat label="Units incoming" value={incoming} tip={HELP.onOrder} />
          <Stat label="Awaiting approval" value={pending} tip="Purchases too large for auto-buy that need your approval." />
        </div>

        <Tabs defaultValue="stock" className="min-h-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="stock" className="text-xs">Stock</TabsTrigger>
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="purchasing" className="text-xs">
                Purchasing
                {pending > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{pending}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="ledger" className="text-xs">Ledger</TabsTrigger>
            </TabsList>
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter materials"
                className="h-7 w-44 pl-7 text-xs"
              />
            </div>
          </div>

          <TabsContent value="stock" className="mt-2">
            <ScrollArea className="h-[calc(100vh-17rem)] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 text-[11px]">Material</TableHead>
                    <HeadWithTip label="Status" tip={HELP.status} />
                    <HeadWithTip label="On hand" tip={HELP.onHand} right />
                    <HeadWithTip label="Reserved" tip={HELP.reserved} right />
                    <HeadWithTip label="Available" tip={HELP.available} right />
                    <HeadWithTip label="On order" tip={HELP.onOrder} right />
                    <HeadWithTip label="Projected" tip={HELP.projected} right />
                    <HeadWithTip label="Reorder at" tip={HELP.reorderPoint} right />
                    <TableHead className="h-8 text-[11px]">Reserve</TableHead>
                    <TableHead className="h-8 w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => {
                    const status = stockStatus(r);
                    return (
                      <TableRow key={r.materialId} className="text-xs">
                        <TableCell className="py-1.5">
                          <div className="text-xs font-medium">{r.name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {r.sku} · {r.unit}
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={status === "ok" ? "outline" : status === "low" ? "secondary" : "destructive"}
                              className="h-4 w-fit px-1.5 text-[10px]"
                            >
                              {status === "ok" ? "OK" : status === "low" ? "Low" : "Out"}
                            </Badge>
                            <StockBar r={r} />
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 text-right"><Num>{r.onHand}</Num></TableCell>
                        <TableCell className="py-1.5 text-right"><Num muted>{r.reserved}</Num></TableCell>
                        <TableCell className="py-1.5 text-right font-medium"><Num>{r.available}</Num></TableCell>
                        <TableCell className="py-1.5 text-right"><Num muted>{r.onOrder}</Num></TableCell>
                        <TableCell className="py-1.5 text-right"><Num>{r.projected}</Num></TableCell>
                        <TableCell className="py-1.5 text-right text-muted-foreground">
                          {r.reorderPoint === null ? "—" : <Num>{r.reorderPoint}</Num>}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <form
                            className="flex gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (Number(qty[r.materialId]) > 0) reserve(r);
                            }}
                          >
                            <Input
                              type="number"
                              min={1}
                              placeholder="qty"
                              className="h-6 w-16 px-1.5 font-mono text-xs"
                              value={qty[r.materialId] ?? ""}
                              onChange={(e) => setQty((p) => ({ ...p, [r.materialId]: e.target.value }))}
                            />
                            <Button type="submit" size="xs" disabled={busy || !(Number(qty[r.materialId]) > 0)}>
                              Reserve
                            </Button>
                          </form>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setAdjDelta("");
                              setAdjNote("");
                              setAdjusting(r);
                            }}
                          >
                            Adjust
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {shown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-6 text-center text-xs text-muted-foreground">
                        No materials match.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="overview" className="mt-2">
            <StockPosition rows={shown} />
          </TabsContent>

          <TabsContent value="purchasing" className="mt-2">
            <ScrollArea className="h-[calc(100vh-17rem)] rounded-md border">
              {orders.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No purchase orders yet. Reserve more than is available to see the purchasing agent work.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-[11px]">Material</TableHead>
                      <TableHead className="h-8 text-[11px]">Supplier</TableHead>
                      <TableHead className="h-8 text-right text-[11px]">Qty</TableHead>
                      <TableHead className="h-8 text-right text-[11px]">Total</TableHead>
                      <TableHead className="h-8 text-[11px]">Status</TableHead>
                      <TableHead className="h-8 text-[11px]">Why</TableHead>
                      <TableHead className="h-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id} className="text-xs">
                        <TableCell className="py-1.5">{o.material}</TableCell>
                        <TableCell className="py-1.5">{o.supplier?.replace(/_/g, " ") ?? "—"}</TableCell>
                        <TableCell className="py-1.5 text-right"><Num>{o.qty}</Num></TableCell>
                        <TableCell className="py-1.5 text-right font-mono tabular-nums">
                          {o.total_price ? money(Number(o.total_price)) : "—"}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge variant={PO_VARIANT[o.status] ?? "outline"} className="h-4 px-1.5 text-[10px]">
                            {o.status.replace("_", " ")}
                          </Badge>
                          <span className="ml-1.5 text-[10px] text-muted-foreground">{o.source}</span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate py-1.5 text-muted-foreground" title={o.reason ?? ""}>
                          {o.reason}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex gap-1">
                            {o.status === "needs_approval" && o.supplier && (
                              <Button size="xs" disabled={busy} onClick={() => act(o.id, "approve")}>Approve</Button>
                            )}
                            {o.status === "placed" && (
                              <Button size="xs" disabled={busy} onClick={() => act(o.id, "receive")}>Received</Button>
                            )}
                            {(o.status === "placed" || o.status === "needs_approval") && (
                              <Button size="xs" variant="ghost" disabled={busy} onClick={() => act(o.id, "cancel")}>
                                Cancel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="ledger" className="mt-2">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              Stock ledger <InfoTip label="Stock ledger">{HELP.ledger}</InfoTip>
            </p>
            <ScrollArea className="h-[calc(100vh-19rem)] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 text-[11px]">When</TableHead>
                    <TableHead className="h-8 text-[11px]">Material</TableHead>
                    <TableHead className="h-8 text-[11px]">Kind</TableHead>
                    <TableHead className="h-8 text-right text-[11px]">Change</TableHead>
                    <TableHead className="h-8 text-[11px]">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id} className="text-xs">
                      <TableCell className="whitespace-nowrap py-1.5 text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="py-1.5">{m.material}</TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant={KIND_VARIANT[m.kind] ?? "outline"} className="h-4 px-1.5 text-[10px]">
                          {m.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono tabular-nums">
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">{m.note ?? m.ref_type ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Dialog open={adjusting !== null} onOpenChange={(open) => !open && setAdjusting(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Adjust stock</DialogTitle>
              <DialogDescription className="text-xs">
                {adjusting?.name}: {adjusting?.onHand} {adjusting?.unit} on hand, {adjusting?.reserved} reserved.
                Use a negative number to remove stock.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="adj-delta" className="text-xs">Change</Label>
                <Input
                  id="adj-delta"
                  type="number"
                  className="h-8 font-mono text-xs"
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="adj-note" className="text-xs">Reason (required)</Label>
                <Input
                  id="adj-note"
                  className="h-8 text-xs"
                  placeholder="e.g. cycle count, damaged pallet"
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => setAdjusting(null)}>Cancel</Button>
              <Button size="sm" disabled={busy || !adjDeltaValid || !adjNote.trim()} onClick={submitAdjust}>
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
