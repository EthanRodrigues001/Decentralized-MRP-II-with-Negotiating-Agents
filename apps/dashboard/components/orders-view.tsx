"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/info-tip";
import { BomCard } from "@/components/bom-card";
import type { BomDocument, ProductRow } from "@/lib/bom";

interface Allocation {
  materialId: string;
  sku: string;
  name: string;
  unit: string;
  required: number;
  reserved: number;
}

interface OrderRow {
  id: string;
  ref: string;
  customer: string;
  qty: number;
  due_date: string;
  priority: number;
  status: string;
  negotiation_id: string | null;
  product: string;
  allocations: Allocation[];
}

interface RecurringRow {
  id: string;
  customer: string;
  qty: number;
  every_days: number;
  due_in_days: number;
  priority: number;
  next_run: string;
  active: boolean;
  product: string;
  orders_raised: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  new: "outline",
  awaiting_stock: "secondary",
  ready: "default",
  in_production: "default",
  completed: "outline",
  cancelled: "outline",
};
const PRIORITY = ["Normal", "High", "Urgent"];

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "request failed");
  return data;
}

function Coverage({ rows }: { rows: Allocation[] }) {
  const required = rows.reduce((s, r) => s + r.required, 0);
  const reserved = rows.reduce((s, r) => s + r.reserved, 0);
  if (required === 0) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round((reserved / required) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${pct === 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function OrdersView() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  const [everyDays, setEveryDays] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("10");
  const [dueInDays, setDueInDays] = useState("14");
  const [priority, setPriority] = useState("0");
  const [customer, setCustomer] = useState("");
  const [preview, setPreview] = useState<BomDocument | null>(null);

  const refresh = useCallback(async () => {
    const [data, rec] = await Promise.all([
      fetch("/api/orders").then((r) => r.json()),
      fetch("/api/recurring").then((r) => r.json()),
    ]);
    setOrders(data.orders);
    setRecurring(rec.recurring);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, setState happens after the await
    refresh();
    fetch("/api/products").then((r) => r.json()).then((d) => setProducts(d.products));
    const timer = setInterval(async () => {
      await fetch("/api/events/tick", { method: "POST" });
      refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Live BOM preview for the order being typed.
  useEffect(() => {
    const n = Number(qty);
    if (!open || !productId || !Number.isInteger(n) || n < 1) return;
    let cancelled = false;
    fetch(`/api/bom?productId=${productId}&qty=${n}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setPreview(d.document ?? null));
    return () => {
      cancelled = true;
    };
  }, [open, productId, qty]);

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

  const create = () =>
    run(async () => {
      const body = { productId, qty: Number(qty), dueInDays: Number(dueInDays), priority: Number(priority), customer };
      const every = Number(everyDays);
      const r = every >= 1 ? await post("/api/recurring", { ...body, everyDays: every }) : await post("/api/orders", body);
      setOpen(false);
      return every >= 1
        ? `Order ${r.ref} created, and it will repeat every ${every} days.`
        : `Order ${r.ref} created. Open it in the Console to see the BOM and agent decisions.`;
    });

  const toggleRecurring = (r: RecurringRow) =>
    run(async () => {
      const res = await fetch(`/api/recurring/${r.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
    });

  const removeRecurring = (r: RecurringRow) =>
    run(async () => {
      if (!window.confirm(`Stop and delete the recurring order for ${r.customer}? Orders already raised are kept.`)) return;
      const res = await fetch(`/api/recurring/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
    });

  const act = (id: string, action: "start" | "complete" | "cancel") => run(async () => void (await post(`/api/orders/${id}`, { action })));

  const productName = products.find((p) => p.id === productId)?.name;
  const formValid = productId !== "" && Number(qty) >= 1 && Number(dueInDays) >= 1;

  return (
    <TooltipProvider delay={150}>
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold">Orders</h1>
            <p className="text-xs text-muted-foreground">
              Customer orders in rank order. Each one reserves its bill of materials; anything short goes to purchasing.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {message && <p className={`max-w-sm text-right text-xs ${message.error ? "text-destructive" : "text-muted-foreground"}`}>{message.text}</p>}
            <Button size="sm" onClick={() => setOpen(true)}>
              <PlusIcon /> New order
            </Button>
          </div>
        </div>

        <Tabs defaultValue="orders" className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
            <TabsTrigger value="recurring" className="text-xs">
              Recurring
              {recurring.length > 0 && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{recurring.length}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="orders" className="mt-2 min-h-0">
        <ScrollArea className="h-[calc(100vh-12rem)] rounded-md border">
          {orders.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">No orders yet. Create one, or type &ldquo;10 dining tables due in 14 days&rdquo; in the Console.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-[11px]">Order</TableHead>
                  <TableHead className="h-8 text-[11px]">Product</TableHead>
                  <TableHead className="h-8 text-right text-[11px]">Qty</TableHead>
                  <TableHead className="h-8 text-[11px]">Customer</TableHead>
                  <TableHead className="h-8 text-[11px]">Due</TableHead>
                  <TableHead className="h-8 text-[11px]">
                    <span className="inline-flex items-center gap-1">
                      Priority <InfoTip label="Priority">Higher priority orders get stock first. Ties go to the earlier due date, then the earlier order.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className="h-8 text-[11px]">Status</TableHead>
                  <TableHead className="h-8 text-[11px]">
                    <span className="inline-flex items-center gap-1">
                      Materials <InfoTip label="Materials covered">Share of the bill of materials already reserved for this order.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className="h-8 text-[11px]">
                    <span className="inline-flex items-center gap-1">
                      Actions{" "}
                      <InfoTip label="Order actions">
                        Start production appears once every material is reserved; the materials stay reserved while it runs. Finish production removes them from stock for good. Cancel is possible until production starts and frees the reserved stock for other orders.
                      </InfoTip>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id} className="text-xs">
                    <TableCell className="py-1.5 font-mono">{o.ref}</TableCell>
                    <TableCell className="py-1.5">{o.product}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono tabular-nums">{o.qty}</TableCell>
                    <TableCell className="py-1.5 text-muted-foreground">{o.customer}</TableCell>
                    <TableCell className="py-1.5 font-mono">{o.due_date}</TableCell>
                    <TableCell className="py-1.5">{PRIORITY[o.priority]}</TableCell>
                    <TableCell className="py-1.5">
                      <Badge variant={STATUS_VARIANT[o.status] ?? "outline"} className="h-4 px-1.5 text-[10px]">
                        {o.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5"><Coverage rows={o.allocations} /></TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex gap-1">
                        {o.status === "ready" && <Button size="xs" disabled={busy} onClick={() => act(o.id, "start")} title="All materials are reserved. Start production to begin making this order.">Start production</Button>}
                        {o.status === "in_production" && <Button size="xs" disabled={busy} onClick={() => act(o.id, "complete")} title="Production is finished. This removes the reserved materials from stock for good.">Finish production</Button>}
                        {["new", "awaiting_stock", "ready"].includes(o.status) && (
                          <Button size="xs" variant="ghost" disabled={busy} onClick={() => act(o.id, "cancel")}>Cancel</Button>
                        )}
                        {o.negotiation_id && (
                          <Button size="xs" variant="ghost" nativeButton={false} render={<Link href={`/dashboard?task=${o.negotiation_id}`} />}>Chat</Button>
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

          <TabsContent value="recurring" className="mt-2 min-h-0">
            <ScrollArea className="h-[calc(100vh-12rem)] rounded-md border">
              {recurring.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No recurring orders. Add a repeat interval when creating an order, or say &ldquo;every 2 weeks&rdquo; in the Console. One-off orders keep working alongside them.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-[11px]">Customer</TableHead>
                      <TableHead className="h-8 text-[11px]">Product</TableHead>
                      <TableHead className="h-8 text-right text-[11px]">Qty</TableHead>
                      <TableHead className="h-8 text-[11px]">Repeats</TableHead>
                      <TableHead className="h-8 text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          Next order <InfoTip label="Next order">The day the next order is raised automatically. A long gap raises one order, never a pile.</InfoTip>
                        </span>
                      </TableHead>
                      <TableHead className="h-8 text-right text-[11px]">Raised</TableHead>
                      <TableHead className="h-8 text-[11px]">Status</TableHead>
                      <TableHead className="h-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recurring.map((r) => (
                      <TableRow key={r.id} className="text-xs">
                        <TableCell className="py-1.5">{r.customer}</TableCell>
                        <TableCell className="py-1.5">{r.product}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono tabular-nums">{r.qty}</TableCell>
                        <TableCell className="py-1.5">every {r.every_days} d</TableCell>
                        <TableCell className="py-1.5 font-mono">{r.active ? r.next_run : "-"}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono tabular-nums">{r.orders_raised}</TableCell>
                        <TableCell className="py-1.5">
                          <Badge variant={r.active ? "default" : "outline"} className="h-4 px-1.5 text-[10px]">{r.active ? "Active" : "Paused"}</Badge>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex gap-1">
                            <Button size="xs" variant="ghost" disabled={busy} onClick={() => toggleRecurring(r)}>{r.active ? "Pause" : "Resume"}</Button>
                            <Button size="xs" variant="ghost" disabled={busy} onClick={() => removeRecurring(r)}>Delete</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-sm">New customer order</DialogTitle>
              <DialogDescription className="text-xs">The bill of materials below updates as you type.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Product</Label>
                <Select value={productId} onValueChange={(v) => setProductId(String(v ?? ""))}>
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Choose a product">{() => productName ?? "Choose a product"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-qty" className="text-xs">Quantity</Label>
                <Input id="o-qty" type="number" min={1} className="h-8 font-mono text-xs" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-due" className="text-xs">Due in (days)</Label>
                <Input id="o-due" type="number" min={1} className="h-8 font-mono text-xs" value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(String(v ?? "0"))}>
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue>{() => PRIORITY[Number(priority)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY.map((p, i) => (
                      <SelectItem key={p} value={String(i)} className="text-xs">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1 sm:col-span-3">
                <Label htmlFor="o-cust" className="text-xs">Customer (optional)</Label>
                <Input id="o-cust" className="h-8 text-xs" value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="o-every" className="text-xs">Repeat every (days, optional)</Label>
                <Input id="o-every" type="number" min={1} max={365} className="h-8 font-mono text-xs" placeholder="one-off" value={everyDays} onChange={(e) => setEveryDays(e.target.value)} />
              </div>
            </div>
            {preview && productId && <BomCard document={preview} />}
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={busy || !formValid} onClick={create}>Create order</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
