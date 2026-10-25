"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BomCard } from "@/components/bom-card";
import { useMoney } from "@/components/currency-provider";
import type { BomDocument } from "@/lib/bom";

const PRIORITY = ["Normal", "High", "Urgent"];
const name = (s: unknown) => String(s ?? "").replace(/_/g, " ");

type Payload = Record<string, unknown>;

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={`w-full min-w-0 overflow-hidden rounded-md border bg-card text-card-foreground ${tone === "warn" ? "border-amber-500/50" : ""}`}>
      <div className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </div>
      <div className="px-3 py-2 text-xs">{children}</div>
    </div>
  );
}

export function OrderCard({ p }: { p: Payload }) {
  return (
    <Card title="Customer order">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="text-sm font-semibold">
          {String(p.qty)} x {String(p.product)}
        </span>
        <span className="font-mono text-muted-foreground">{String(p.ref)}</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-4">
        {[
          ["Customer", String(p.customer)],
          ["Due", String(p.dueDate)],
          ["Priority", PRIORITY[Number(p.priority)] ?? "Normal"],
          ["SKU", String(p.sku)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="font-mono">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function BomMessage({ p }: { p: Payload }) {
  return <BomCard document={p.document as BomDocument} orderRef={String(p.ref)} />;
}

interface AllocRow {
  materialId: string;
  sku: string;
  name: string;
  unit: string;
  required: number;
  reserved: number;
  short: number;
}

export function AllocationCard({ p }: { p: Payload }) {
  const rows = p.rows as AllocRow[];
  const ready = Boolean(p.ready);
  return (
    <Card title={p.update ? "Stock allocation (updated)" : "Stock allocation"}>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Part no.</th>
            <th className="py-1 pr-2 font-medium">Description</th>
            <th className="py-1 pr-2 text-right font-medium">Required</th>
            <th className="py-1 pr-2 text-right font-medium">Reserved</th>
            <th className="py-1 text-right font-medium">Short</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.materialId} className="border-b last:border-b-0">
              <td className="py-1 pr-2 font-mono">{r.sku}</td>
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums">{r.required}</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums">{r.reserved}</td>
              <td className={`py-1 text-right font-mono tabular-nums ${r.short > 0 ? "font-semibold text-destructive" : "text-muted-foreground/50"}`}>
                {r.short}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2">
        <Badge variant={ready ? "default" : "secondary"} className="h-4 px-1.5 text-[10px]">
          {ready ? "Ready for production" : "Awaiting stock"}
        </Badge>
      </div>
    </Card>
  );
}

export function PurchaseCard({ p, narration }: { p: Payload; narration: string | null }) {
  const { money: fmt } = useMoney();
  const money = (n: unknown) => (typeof n === "number" ? fmt(n) : "—");
  const [state, setState] = useState<{ status?: string; error?: string; busy?: boolean }>({});
  const decision = String(p.decision);
  const status = state.status ?? String(p.status ?? "");

  // The message was written when the purchase was proposed; read the live status so a
  // card never offers "Approve" for something already approved or received.
  useEffect(() => {
    if (!p.poId || decision === "update" || decision === "covered") return;
    let alive = true;
    fetch(`/api/purchase-orders/${String(p.poId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d?.status && setState((s) => (s.busy ? s : { ...s, status: String(d.status) })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [p.poId, decision]);

  async function act(action: "approve" | "receive", next: string) {
    setState((s) => ({ ...s, busy: true, error: undefined }));
    const res = await fetch(`/api/purchase-orders/${String(p.poId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setState(res.ok ? { status: next } : { error: data.error ?? "failed" });
  }

  if (decision === "update") {
    return (
      <p className="text-xs">
        {narration} <span className="text-muted-foreground">({String(p.qty)} {String(p.unit)} of {String(p.material)})</span>
      </p>
    );
  }
  if (decision === "covered") {
    return <p className="text-xs">{narration}</p>;
  }

  const needsApproval = decision === "needs_approval" && status === "needs_approval";
  const blocked = decision === "needs_approval" && status === "needs_approval" && !p.supplier;
  const excluded = (p.excluded as { supplier: string; reason: string }[] | undefined) ?? [];
  return (
    <Card title={decision === "auto" ? "Automatic purchase" : blocked ? "Cannot buy yet" : "Purchase needs approval"} tone={needsApproval || blocked ? "warn" : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          {String(p.qty)} {String(p.unit)} of {String(p.material)}
        </span>
        <Badge variant={status === "placed" ? "default" : "secondary"} className="h-4 px-1.5 text-[10px]">
          {blocked ? "blocked" : status.replace("_", " ")}
        </Badge>
      </div>
      {p.supplier ? (
        <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-4">
          {[
            ["Supplier", name(p.supplier)],
            ["Unit price", money(p.unitPrice)],
            ["Total", money(p.total)],
            ["Lead time", `${String(p.leadTimeDays)} d`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="font-mono">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-1.5 text-muted-foreground">{String(p.reason)}</p>
      {excluded.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-[11px] text-muted-foreground">
          {excluded.map((e, i) => (
            <li key={i}>
              {name(e.supplier)}: {e.reason}
            </li>
          ))}
        </ul>
      )}
      {blocked ? (
        <p className="mt-2 text-muted-foreground">
          No supplier contract covers this quantity today, so it cannot be approved. Extend a contract&apos;s maximum or add one in{" "}
          <a href="/dashboard/contracts" className="underline underline-offset-2">Contracts</a>, then say &quot;ok&quot;.
        </p>
      ) : null}
      {needsApproval && p.supplier ? (
        <div className="mt-2 flex items-center gap-2">
          <Button size="xs" disabled={state.busy} onClick={() => act("approve", "placed")}>
            Approve purchase
          </Button>
          {state.error && <span className="text-destructive">{state.error}</span>}
        </div>
      ) : null}
      {status === "placed" ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-muted-foreground">Ordered. Waiting for the supplier to deliver.</span>
          <Button size="xs" variant="outline" disabled={state.busy} onClick={() => act("receive", "received")}>
            Mark delivery received
          </Button>
          {state.error && <span className="text-destructive">{state.error}</span>}
        </div>
      ) : null}
      {status === "received" ? <p className="mt-2 text-muted-foreground">Delivered and added to stock.</p> : null}
    </Card>
  );
}

export function StatusLine({ p, narration }: { p: Payload; narration: string | null }) {
  return (
    <p className="text-xs">
      <span className="font-mono text-muted-foreground">{String(p.ref)}</span> {narration}
    </p>
  );
}
