"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

type TableName =
  | "procurement_orders"
  | "negotiations"
  | "negotiation_messages"
  | "purchase_orders"
  | "stock_movements"
  | "events";

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    const s = JSON.stringify(value);
    return s.length > 60 ? s.slice(0, 60) + "…" : s;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function DataTable({
  rows,
  height = "h-[calc(100vh-13rem)]",
}: {
  rows: Record<string, unknown>[];
  height?: string;
}) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No rows yet.</p>;
  }
  const columns = Object.keys(rows[0]);

  return (
    <ScrollArea className={height}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c} className="whitespace-nowrap text-[11px]">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c} className="whitespace-nowrap text-[11px] py-1.5">
                  {formatCell(row[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

export function DataTableView({ compact = false }: { compact?: boolean }) {
  const [tab, setTab] = useState<TableName>("procurement_orders");
  const [rowsByTable, setRowsByTable] = useState<Record<string, Record<string, unknown>[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/data?table=${tab}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRowsByTable((prev) => ({ ...prev, [tab]: data.rows }));
        setCounts(data.counts);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const height = compact ? "h-[calc(100vh-9rem)]" : "h-[calc(100vh-13rem)]";

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TableName)}>
      <TabsList>
        <TabsTrigger value="procurement_orders">
          Orders {counts.procurement_orders ? `(${counts.procurement_orders})` : ""}
        </TabsTrigger>
        <TabsTrigger value="negotiations">
          Negotiations {counts.negotiations ? `(${counts.negotiations})` : ""}
        </TabsTrigger>
        <TabsTrigger value="negotiation_messages">
          Messages {counts.negotiation_messages ? `(${counts.negotiation_messages})` : ""}
        </TabsTrigger>
        <TabsTrigger value="purchase_orders">Purchase orders</TabsTrigger>
        <TabsTrigger value="stock_movements">Stock ledger</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
      </TabsList>

      <TabsContent value="procurement_orders" className="mt-2">
        <DataTable rows={rowsByTable.procurement_orders ?? []} height={height} />
      </TabsContent>
      <TabsContent value="negotiations" className="mt-2">
        <DataTable rows={rowsByTable.negotiations ?? []} height={height} />
      </TabsContent>
      <TabsContent value="negotiation_messages" className="mt-2">
        <DataTable rows={rowsByTable.negotiation_messages ?? []} height={height} />
      </TabsContent>
      {(["purchase_orders", "stock_movements", "events"] as const).map((t) => (
        <TabsContent key={t} value={t} className="mt-2">
          <DataTable rows={rowsByTable[t] ?? []} height={height} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
