"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BoxIcon, ClipboardListIcon, TruckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Allocation {
  materialId: string;
  required: number;
  reserved: number;
}
interface FlowOrder {
  id: string;
  ref: string;
  product: string;
  qty: number;
  status: string;
  due_date: string;
  priority: number;
  allocations: Allocation[];
}
interface FlowMaterial {
  id: string;
  sku: string;
  name: string;
  unit: string;
  on_hand: number;
  reserved: number;
  on_order: number;
}
interface FlowPurchase {
  id: string;
  material_id: string;
  supplier: string | null;
  qty: number;
  status: string;
  expected_at: string | null;
}

// One colour per order lane so parallel orders stay distinguishable across the shared material column.
const LANES = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16"];

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  awaiting_stock: "Awaiting stock",
  ready: "Ready",
  in_production: "In production",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface NodeData extends Record<string, unknown> {
  kind: "order" | "material" | "purchase";
  title: string;
  subtitle: string;
  chip?: string;
  chipTone?: "ok" | "warn" | "bad" | "muted";
  metric?: string;
  footer?: string;
  accent?: string;
  /** 0..1 fill for the thin progress bar, when it makes sense. */
  progress?: number;
  dim?: boolean;
  selected?: boolean;
}

const TONE: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  bad: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const ICON = { order: ClipboardListIcon, material: BoxIcon, purchase: TruckIcon };

// One block design for every node: header (icon, title, status chip), a single
// key metric, an optional progress bar and a footer line.
const FlowNode = memo(function FlowNode({ data }: NodeProps) {
  const d = data as NodeData;
  const Icon = ICON[d.kind];
  return (
    <div
      className={`w-[210px] rounded-lg border bg-card px-3 py-2 text-card-foreground shadow-sm transition-opacity ${d.dim ? "opacity-30" : ""} ${d.selected ? "ring-2" : ""}`}
      style={{ borderLeft: `3px solid ${d.accent ?? "var(--border)"}`, ...(d.selected ? { ["--tw-ring-color" as string]: d.accent } : {}) }}
    >
      {d.kind !== "order" && <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-muted-foreground/60" />}
      {d.kind !== "purchase" && <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-muted-foreground/60" />}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-semibold">{d.title}</span>
        </div>
        {d.chip && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TONE[d.chipTone ?? "muted"]}`}>{d.chip}</span>}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{d.subtitle}</div>
      {d.metric && <div className="mt-1.5 font-mono text-sm font-semibold tabular-nums">{d.metric}</div>}
      {d.progress !== undefined && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full" style={{ width: `${Math.round(d.progress * 100)}%`, background: d.accent ?? "currentColor" }} />
        </div>
      )}
      {d.footer && <div className="mt-1 truncate text-[10px] text-muted-foreground">{d.footer}</div>}
    </div>
  );
});

const nodeTypes = { flowNode: FlowNode };

const ROW = 120;

function buildGraph(
  orders: FlowOrder[],
  materials: FlowMaterial[],
  purchases: FlowPurchase[],
  selected: string | null
): { nodes: Node[]; edges: Edge[] } {
  const colorOf = new Map(orders.map((o, i) => [o.id, LANES[i % LANES.length]]));
  const usedMaterials = new Set(orders.flatMap((o) => o.allocations.map((a) => a.materialId)));
  const mats = materials.filter((m) => usedMaterials.has(m.id));
  const selectedMaterials = new Set(
    selected ? orders.find((o) => o.id === selected)?.allocations.map((a) => a.materialId) : []
  );

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  orders.forEach((o, i) => {
    const required = o.allocations.reduce((s, a) => s + a.required, 0);
    const reserved = o.allocations.reduce((s, a) => s + a.reserved, 0);
    nodes.push({
      id: `o:${o.id}`,
      type: "flowNode",
      position: { x: 0, y: i * ROW * 1.25 },
      data: {
        kind: "order",
        title: o.ref,
        subtitle: `${o.qty} x ${o.product}`,
        chip: STATUS_LABEL[o.status] ?? o.status,
        chipTone: o.status === "ready" || o.status === "in_production" ? "ok" : o.status === "awaiting_stock" ? "warn" : "muted",
        metric: required ? `${Math.round((reserved / required) * 100)}% reserved` : undefined,
        progress: required ? reserved / required : undefined,
        footer: `Due ${o.due_date}${o.priority ? ` · ${o.priority === 2 ? "Urgent" : "High"}` : ""}`,
        accent: colorOf.get(o.id),
        dim: selected !== null && selected !== o.id,
        selected: selected === o.id,
      } satisfies NodeData,
    });
  });

  mats.forEach((m, i) => {
    const available = m.on_hand - m.reserved;
    nodes.push({
      id: `m:${m.id}`,
      type: "flowNode",
      position: { x: 380, y: i * ROW * 1.05 },
      data: {
        kind: "material",
        title: m.name,
        subtitle: m.sku,
        chip: available <= 0 ? "Out" : "In stock",
        chipTone: available <= 0 ? "bad" : "ok",
        metric: `${available} ${m.unit} free`,
        progress: m.on_hand > 0 ? Math.max(0, available) / m.on_hand : 0,
        footer: `${m.on_hand} on hand · ${m.reserved} reserved · ${m.on_order} on order`,
        accent: "var(--muted-foreground)",
        dim: selected !== null && !selectedMaterials.has(m.id),
      } satisfies NodeData,
    });
  });

  orders.forEach((o) => {
    for (const a of o.allocations) {
      const short = a.required - a.reserved;
      const dim = selected !== null && selected !== o.id;
      edges.push({
        id: `e:${o.id}:${a.materialId}`,
        source: `o:${o.id}`,
        target: `m:${a.materialId}`,
        label: short > 0 ? `${a.reserved}/${a.required}` : `${a.reserved}`,
        animated: short > 0 && !dim,
        style: { stroke: colorOf.get(o.id), strokeWidth: selected === o.id ? 2.5 : 1.5, strokeDasharray: short > 0 ? "5 4" : undefined, opacity: dim ? 0.12 : 0.9 },
        labelStyle: { fontSize: 10, fill: "var(--foreground)" },
        labelBgStyle: { fill: "var(--card)" },
        labelBgPadding: [3, 2],
        labelBgBorderRadius: 4,
      });
    }
  });

  const matIndex = new Map(mats.map((m, i) => [m.id, i]));
  purchases.forEach((p, i) => {
    const mi = matIndex.get(p.material_id);
    if (mi === undefined) return;
    const dim = selected !== null && !selectedMaterials.has(p.material_id);
    nodes.push({
      id: `p:${p.id}`,
      type: "flowNode",
      position: { x: 760, y: mi * ROW * 1.05 },
      data: {
        kind: "purchase",
        title: p.supplier ? p.supplier.replace(/_/g, " ") : "No supplier",
        subtitle: `${p.qty} incoming`,
        chip: p.status === "placed" ? "Placed" : "Needs approval",
        chipTone: p.status === "placed" ? "ok" : "bad",
        footer: p.expected_at ? `Expected ${p.expected_at}` : "Awaiting your approval",
        accent: p.status === "placed" ? "#10b981" : "#ef4444",
        dim,
      } satisfies NodeData,
    });
    edges.push({
      id: `e:p:${p.id}`,
      source: `m:${p.material_id}`,
      target: `p:${p.id}`,
      animated: p.status === "placed" && !dim,
      style: { stroke: p.status === "placed" ? "#10b981" : "#ef4444", strokeDasharray: p.status === "placed" ? undefined : "4 4", opacity: dim ? 0.12 : 0.9 },
    });
  });

  return { nodes, edges };
}

function FlowCanvas() {
  const [orders, setOrders] = useState<FlowOrder[]>([]);
  const [materials, setMaterials] = useState<FlowMaterial[]>([]);
  const [purchases, setPurchases] = useState<FlowPurchase[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/flow").then((r) => r.json());
    setOrders(d.orders);
    setMaterials(d.materials);
    setPurchases(d.purchases);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, setState happens after the await
    load();
    const timer = setInterval(async () => {
      await fetch("/api/events/tick", { method: "POST" });
      load();
    }, 8_000);
    return () => clearInterval(timer);
  }, [load]);

  const live = useMemo(
    () => orders.filter((o) => showDone || !["completed", "cancelled"].includes(o.status)).reverse(),
    [orders, showDone]
  );
  const { nodes, edges } = useMemo(() => buildGraph(live, materials, purchases, selected), [live, materials, purchases, selected]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold">Flow</h1>
          <p className="text-xs text-muted-foreground">
            Orders (left) draw on shared materials (middle); open purchases (right) refill them. Each order has its own colour. Dashed lines are short; click an order to focus it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected && <Button size="xs" variant="ghost" onClick={() => setSelected(null)}>Clear focus</Button>}
          <Button size="xs" variant="outline" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide finished" : "Show finished"}
          </Button>
          <Badge variant="outline" className="h-5 text-[10px]">{live.length} orders</Badge>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-background">
        {loaded && live.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No active orders. Create two or more on the Orders page to see them compete for the same materials.</p>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.3}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_, n) => setSelected((cur) => (n.id.startsWith("o:") ? (cur === n.id.slice(2) ? null : n.id.slice(2)) : cur))}
            onPaneClick={() => setSelected(null)}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

export function FlowView() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
