"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentHandle, AgentStatus } from "@/lib/types";

export interface FlowAgentState extends AgentHandle {
  status: AgentStatus;
  lastAction: string | null;
  isRecommended: boolean;
  isWinner: boolean;
  isLoser: boolean;
  [key: string]: unknown;
}

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === "idle") return <span className="size-2 rounded-full bg-muted-foreground/30" />;
  if (status === "spawning")
    return <span className="size-2 rounded-full bg-blue-400 animate-ping" />;
  if (status === "running")
    return <span className="size-2 rounded-full bg-amber-500 animate-pulse" />;
  return <span className="size-2 rounded-full bg-green-500" />;
}

function HumanNode() {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm text-center w-[140px]">
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Right} id="in" />
      <div className="text-sm font-semibold">You</div>
      <div className="text-xs text-muted-foreground">approves</div>
    </div>
  );
}

function AgentNode({ data }: NodeProps & { data: FlowAgentState }) {
  const borderClass = data.isWinner
    ? "border-green-500 ring-2 ring-green-500/30"
    : data.isLoser
      ? "border-muted-foreground/30 opacity-50"
      : data.isRecommended
        ? "border-blue-500 ring-2 ring-blue-500/30"
        : data.status === "running" || data.status === "spawning"
          ? "border-amber-400 ring-2 ring-amber-400/20"
          : "border-border";

  const roleLabel =
    data.role === "gateway" ? "Gateway" : data.role === "explanation" ? "ExplanationAgent" : "SupplierAgent";

  return (
    <div className={`rounded-lg border bg-card px-4 py-3 shadow-sm w-[190px] transition-colors ${borderClass}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Left} id="out" />
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{roleLabel}</div>
        <StatusDot status={data.status} />
      </div>
      <div className="text-sm">{data.label.replace(/_/g, " ")}</div>
      {typeof data.historyCount === "number" && (
        <div className="text-xs text-muted-foreground mt-1">
          holding {data.historyCount} Raw Materials orders
        </div>
      )}
      {data.lastAction && (
        <div className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {data.lastAction}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { human: HumanNode, agent: AgentNode };

function FlowInner({ agents }: { agents: FlowAgentState[] }) {
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  const gateway = agents.find((a) => a.role === "gateway");
  const explanation = agents.find((a) => a.role === "explanation");
  const suppliers = agents.filter((a) => a.role === "supplier");

  const nodes: Node[] = useMemo(() => {
    const n: Node[] = [{ id: "you", type: "human", position: { x: 20, y: 140 }, data: {} }];
    if (gateway) n.push({ id: gateway.id, type: "agent", position: { x: 260, y: 140 }, data: gateway });
    suppliers.forEach((s, i) => {
      n.push({ id: s.id, type: "agent", position: { x: 540, y: i * 130 }, data: s });
    });
    if (explanation)
      n.push({
        id: explanation.id,
        type: "agent",
        position: { x: 540, y: suppliers.length * 130 + 20 },
        data: explanation,
      });
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  const edges: Edge[] = useMemo(() => {
    const e: Edge[] = [];
    if (gateway) {
      e.push({
        id: "you-gateway",
        source: "you",
        target: gateway.id,
        animated: gateway.status === "running",
      });
      suppliers.forEach((s) => {
        e.push({
          id: `gateway-${s.id}`,
          source: gateway.id,
          target: s.id,
          animated: s.status === "running" || s.status === "spawning",
          label: s.lastAction ?? undefined,
          style: s.isWinner ? { stroke: "#22c55e" } : undefined,
        });
      });
      if (explanation) {
        e.push({
          id: `gateway-${explanation.id}`,
          source: gateway.id,
          target: explanation.id,
          animated: explanation.status === "running",
          label: "EXPLAIN",
        });
      }
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  useEffect(() => {
    const id = requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }));
    return () => cancelAnimationFrame(id);
  }, [nodes.length, fitView]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      fitView({ padding: 0.2, duration: 150 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitView]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export const AgentFlow = memo(function AgentFlow({ agents }: { agents: FlowAgentState[] }) {
  return (
    <div className="h-full w-full rounded-lg border bg-background">
      <ReactFlowProvider>
        <FlowInner agents={agents} />
      </ReactFlowProvider>
    </div>
  );
});
