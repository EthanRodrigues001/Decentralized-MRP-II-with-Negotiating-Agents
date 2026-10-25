"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, PanelRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { AgentFlow, type FlowAgentState } from "@/components/agent-flow";
import { ChatThread } from "@/components/chat-thread";
import { AgentRunsPanel } from "@/components/agent-runs-panel";
import type { AgentRun } from "@/components/run-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskComposer } from "@/components/task-composer";
import { TaskList, type TaskSummary } from "@/components/task-list";
import { ModelToggle, type ModelUsageMap } from "@/components/model-toggle";
import { postStream } from "@/lib/stream-client";
import { DEFAULT_GEMINI_MODEL } from "@/lib/models";
import type { AgentHandle, NegotiationMessage, StreamEvent } from "@/lib/types";

interface TaskData {
  agents: Record<string, FlowAgentState>;
  agentOrder: string[];
  messages: NegotiationMessage[];
  streamingIds: Set<string>;
}

function emptyTaskData(): TaskData {
  return { agents: {}, agentOrder: [], messages: [], streamingIds: new Set() };
}

function reconstructTaskData(messages: NegotiationMessage[]): TaskData {
  const data = emptyTaskData();
  for (const m of messages) {
    data.messages.push(m);
    for (const name of [m.sender, m.receiver]) {
      if (name === "You" || data.agents[name]) continue;
      const role: AgentHandle["role"] =
        name === "Gateway"
          ? "gateway"
          : name === "ExplanationAgent"
            ? "explanation"
            : ["PlanningAgent", "InventoryAgent", "PurchasingAgent", "ProductionAgent"].includes(name)
              ? "worker"
              : "supplier";
      data.agentOrder.push(name);
      data.agents[name] = {
        id: name,
        role,
        label: name,
        status: "done",
        lastAction: null,
        isRecommended: false,
        isWinner: false,
        isLoser: false,
      };
    }
    data.agents[m.sender] = { ...data.agents[m.sender], lastAction: m.performative };
    data.agents[m.receiver] = { ...data.agents[m.receiver], lastAction: m.performative };
    if (m.performative === "REQUEST_APPROVAL") {
      const payload = m.payload as { recommendedSupplier: string };
      for (const id of data.agentOrder) {
        data.agents[id] = { ...data.agents[id], isRecommended: id === payload.recommendedSupplier };
      }
    }
    if (m.performative === "ACCEPT_PROPOSAL" && data.agents[m.receiver]) {
      data.agents[m.receiver] = { ...data.agents[m.receiver], isWinner: true };
    }
    if (m.performative === "REJECT_PROPOSAL" && data.agents[m.receiver]) {
      data.agents[m.receiver] = { ...data.agents[m.receiver], isLoser: true };
    }
  }
  return data;
}

export function NegotiationConsole() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskData, setTaskData] = useState<Record<string, TaskData>>({});
  const [composerBusy, setComposerBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<{ approvable: number; blocked: string[]; waiting: number }>({ approvable: 0, blocked: [], waiting: 0 });
  const [approving, setApproving] = useState(false);

  async function refreshPurchases(id: string | null) {
    if (!id) return setPurchases({ approvable: 0, blocked: [], waiting: 0 });
    const d = await fetch(`/api/threads/${id}/purchases`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d && activeRef.current === id) setPurchases(d);
  }
  const [modelId, setModelId] = useState(DEFAULT_GEMINI_MODEL);
  const [modelUsage, setModelUsage] = useState<ModelUsageMap>({});
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [runsOpen, setRunsOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const streaming = useRef(false);

  async function refreshTaskList() {
    const res = await fetch("/api/negotiations");
    const data = await res.json();
    setTasks(data.threads);
  }

  async function refreshRuns(taskId: string | null) {
    const res = await fetch(taskId ? `/api/threads/${taskId}/runs` : "/api/runs");
    const data = await res.json();
    setRuns(data.runs ?? []);
  }

  async function settle(id: string, settled: boolean) {
    await fetch(`/api/threads/${id}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settled }),
    });
    refreshTaskList();
  }

  async function settleAll() {
    await fetch("/api/threads/settle-all", { method: "POST" });
    refreshTaskList();
  }

  async function refreshModelUsage() {
    const res = await fetch("/api/model-usage");
    const data = await res.json();
    const map: ModelUsageMap = {};
    for (const u of data.usage as { modelId: string; calls: number; fallbacks: number }[]) {
      map[u.modelId] = { calls: u.calls, fallbacks: u.fallbacks };
    }
    setModelUsage(map);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, setState happens after the await, not synchronously
    refreshTaskList();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, setState happens after the await, not synchronously
    refreshModelUsage();
    // Deep link from the Orders page: /dashboard?task=<thread id>
    const task = new URLSearchParams(window.location.search).get("task");
    if (task) selectTask(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the page alive without a worker: raises due recurring orders, runs
  // pending events, then refreshes the list, the open chat and its agent runs.
  const activeRef = useRef<string | null>(null);
  useEffect(() => {
    activeRef.current = activeTaskId;
  }, [activeTaskId]);
  useEffect(() => {
    const timer = setInterval(async () => {
      if (streaming.current) return;
      await fetch("/api/events/tick", { method: "POST" });
      refreshTaskList();
      const id = activeRef.current;
      if (id) {
        const msgs = await fetch(`/api/negotiate/${id}/messages`).then((r) => r.json());
        setTaskData((prev) => {
          const cur = prev[id];
          if (!cur || cur.messages.length === msgs.messages.length) return prev;
          return { ...prev, [id]: reconstructTaskData(msgs.messages) };
        });
      }
      refreshRuns(id);
      refreshPurchases(id);
    }, 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchTask(taskId: string, patch: (prev: TaskData) => TaskData) {
    setTaskData((prev) => ({ ...prev, [taskId]: patch(prev[taskId] ?? emptyTaskData()) }));
  }

  // Applies one stream event to one task's slice of state. Shared by the
  // "start a new task" flow (where the id only becomes known mid-stream) and
  // the "decide on an existing task" flow (where the id is known upfront).
  function applyEvent(taskId: string, event: StreamEvent) {
    switch (event.type) {
      case "agent_spawn": {
        const agent = event.agent;
        patchTask(taskId, (prev) => {
          const existing = prev.agents[agent.id];
          return {
            ...prev,
            agentOrder: prev.agentOrder.includes(agent.id)
              ? prev.agentOrder
              : [...prev.agentOrder, agent.id],
            agents: {
              ...prev.agents,
              [agent.id]: {
                ...agent,
                status: existing?.status ?? "idle",
                lastAction: existing?.lastAction ?? null,
                isRecommended: existing?.isRecommended ?? false,
                isWinner: existing?.isWinner ?? false,
                isLoser: existing?.isLoser ?? false,
              },
            },
          };
        });
        break;
      }
      case "agent_status":
        patchTask(taskId, (prev) =>
          prev.agents[event.agentId]
            ? {
                ...prev,
                agents: {
                  ...prev.agents,
                  [event.agentId]: { ...prev.agents[event.agentId], status: event.status },
                },
              }
            : prev
        );
        break;
      case "message": {
        const m = event.message;
        patchTask(taskId, (prev) => {
          const agents = { ...prev.agents };
          for (const name of [m.sender, m.receiver]) {
            if (agents[name]) agents[name] = { ...agents[name], lastAction: m.performative };
          }
          if (m.performative === "REQUEST_APPROVAL") {
            const payload = m.payload as { recommendedSupplier: string };
            for (const id of Object.keys(agents)) {
              agents[id] = { ...agents[id], isRecommended: id === payload.recommendedSupplier };
            }
          }
          if (m.performative === "ACCEPT_PROPOSAL" && agents[m.receiver]) {
            agents[m.receiver] = { ...agents[m.receiver], isWinner: true };
          }
          if (m.performative === "REJECT_PROPOSAL" && agents[m.receiver]) {
            agents[m.receiver] = { ...agents[m.receiver], isLoser: true };
          }
          const streamingIds = ["PROPOSE", "EXPLAIN", "ACCEPT_PROPOSAL"].includes(m.performative)
            ? new Set(prev.streamingIds).add(m.id)
            : prev.streamingIds;
          return { ...prev, agents, messages: [...prev.messages, m], streamingIds };
        });
        break;
      }
      case "narration_delta":
        patchTask(taskId, (prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === event.messageId ? { ...m, narration: (m.narration ?? "") + event.delta } : m
          ),
        }));
        break;
      case "narration_done":
        patchTask(taskId, (prev) => {
          const streamingIds = new Set(prev.streamingIds);
          streamingIds.delete(event.messageId);
          return {
            ...prev,
            streamingIds,
            messages: prev.messages.map((m) =>
              m.id === event.messageId ? { ...m, narration: event.text } : m
            ),
          };
        });
        break;
      case "error":
        console.error(event.message);
        break;
    }
  }

  async function selectTask(id: string) {
    setActiveTaskId(id);
    setHint(null);
    refreshRuns(id);
    refreshPurchases(id);
    if (taskData[id]) return;
    const res = await fetch(`/api/negotiate/${id}/messages`);
    const data = await res.json();
    setTaskData((prev) => ({ ...prev, [id]: reconstructTaskData(data.messages) }));
  }

  // A furniture order ("10 dining tables for Acme every 2 weeks, due in 14 days")
  // becomes a customer order. It streams: agents spin up one by one, the BOM and
  // allocation appear as they are written, and purchasing reacts to any shortage.
  async function startOrder(
    intake: { quantity: number; dueInDays: number; productId: string; customer?: string; everyDays?: number; priority?: number }
  ) {
    setFlowOpen(true);
    streaming.current = true;
    let threadId: string | null = null;
    try {
      for await (const event of postStream("/api/orders/stream", {
        productId: intake.productId,
        qty: intake.quantity,
        dueInDays: intake.dueInDays,
        customer: intake.customer ?? "Chat",
        everyDays: intake.everyDays,
        priority: intake.priority ?? 0,
      })) {
        if (event.type === "negotiation_id") {
          threadId = event.negotiationId;
          setTaskData((prev) => ({ ...prev, [threadId!]: emptyTaskData() }));
          setActiveTaskId(threadId);
          refreshTaskList();
          continue;
        }
        if (threadId) {
          applyEvent(threadId, event);
          if (event.type === "agent_status" && event.status === "done") refreshRuns(threadId);
        }
      }
    } finally {
      streaming.current = false;
    }
    refreshTaskList();
    refreshRuns(threadId);
  }

  async function reloadThread(id: string) {
    const data = await fetch(`/api/negotiate/${id}/messages`).then((r) => r.json());
    setTaskData((prev) => ({ ...prev, [id]: reconstructTaskData(data.messages) }));
    refreshRuns(id);
    refreshPurchases(id);
    refreshTaskList();
  }

  // A direct request for one raw material ("3 foam padding").
  async function startMaterialRequest(intake: { materialId: string; quantity: number; dueInDays: number }) {
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId: intake.materialId, qty: intake.quantity, dueInDays: intake.dueInDays }),
    });
    const data = await res.json();
    if (!res.ok) {
      setHint(data.error ?? "Could not create the request.");
      return;
    }
    setActiveTaskId(data.negotiationId);
    setFlowOpen(true);
    await reloadThread(data.negotiationId);
  }

  async function sendCommand(text: string) {
    if (!activeTaskId) return;
    setApproving(true);
    try {
      await fetch(`/api/threads/${activeTaskId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      await reloadThread(activeTaskId);
    } finally {
      setApproving(false);
    }
  }
  const approveAllPurchases = () => sendCommand("approve");
  const receiveDeliveries = () => sendCommand("received");

  async function handleComposerSubmit(text: string) {
    setComposerBusy(true);
    setHint(null);
    try {
      // Inside a chat, typed words are instructions for that chat ("ok", "received",
      // "add one more"). Only text that is clearly a new request starts a new chat.
      if (activeTaskId) {
        const res = await fetch(`/api/threads/${activeTaskId}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const out = await res.json();
        if (res.ok && out.handled) {
          await reloadThread(activeTaskId);
          return;
        }
        if (!res.ok) {
          setHint(out.error ?? "That did not work.");
          return;
        }
      }

      const intake = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, modelId }),
      }).then((r) => r.json());

      if (intake.kind === "order" && intake.productId) {
        await startOrder(intake);
      } else if (intake.kind === "material" && intake.materialId) {
        await startMaterialRequest(intake);
      } else {
        setHint('I could not tell what to order. Try "10 dining tables for Acme due in 14 days" or "3 foam padding". To act on a chat, select it first.');
      }
    } finally {
      setComposerBusy(false);
      refreshTaskList();
      refreshModelUsage();
    }
  }

  async function handleApprove(chosenSupplier: string | null) {
    if (!activeTaskId) return;
    for await (const event of postStream("/api/negotiate/stream", {
      type: "decide",
      negotiationId: activeTaskId,
      chosenSupplier,
      modelId,
    })) {
      applyEvent(activeTaskId, event);
    }
    refreshTaskList();
    refreshModelUsage();
  }

  const active = activeTaskId ? taskData[activeTaskId] : undefined;
  // Memoized on the agent map/order specifically (not on `active` or on
  // `messages`) so a burst of narration_delta events — which only ever touch
  // `messages` — doesn't rebuild this array many times a second. Rebuilding
  // it that often was feeding React Flow a brand-new node list on every
  // streamed token, which made the graph flicker/clip nodes out of fitView.
  const flowAgents: FlowAgentState[] = useMemo(
    () => (active ? active.agentOrder.map((id) => active.agents[id]).filter(Boolean) : []),
    [active?.agents, active?.agentOrder]
  );

  const STATUS_DOT: Record<string, string> = {
    idle: "bg-muted-foreground/30",
    spawning: "bg-blue-400 animate-ping",
    running: "bg-amber-500 animate-pulse",
    done: "bg-emerald-500",
  };

  return (
    <div className="flex h-full min-w-0">
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Chats</span>
          <Button
            size="xs"
            variant={activeTaskId ? "outline" : "secondary"}
            title="Start a new chat: describe an order or a material request"
            onClick={() => {
              setActiveTaskId(null);
              setHint(null);
            }}
          >
            <PlusIcon />
            New chat
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <TaskList
            tasks={tasks}
            activeTaskId={activeTaskId}
            onSelect={selectTask}
            onSettle={settle}
            onSettleAll={settleAll}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Agent strip: compact by default, opens to the live graph of agents spinning up. */}
        <div className="shrink-0 border-b">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <button
              className="flex min-w-0 items-center gap-2 text-xs"
              onClick={() => setFlowOpen((v) => !v)}
              disabled={flowAgents.length === 0}
              aria-expanded={flowOpen}
            >
              <ChevronDownIcon className={`size-3.5 transition-transform ${flowOpen && flowAgents.length > 0 ? "" : "-rotate-90"}`} />
              <span className="font-medium">Agents</span>
              {flowAgents.length === 0 ? (
                <span className="text-muted-foreground">none yet in this chat</span>
              ) : (
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                  {flowAgents.map((a) => (
                    <span key={a.id} className="flex items-center gap-1">
                      <span className={`size-1.5 rounded-full ${STATUS_DOT[a.status] ?? STATUS_DOT.idle}`} />
                      {a.label.replace(/_/g, " ")}
                    </span>
                  ))}
                </span>
              )}
            </button>
            <Button size="xs" variant={runsOpen ? "secondary" : "ghost"} onClick={() => setRunsOpen((v) => !v)} aria-pressed={runsOpen}>
              <PanelRightIcon />
              Agent runs
              {runs.length > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px]">{runs.length}</Badge>}
            </Button>
          </div>
          {flowOpen && flowAgents.length > 0 && (
            <div className="h-[190px] px-2 pb-2">
              <AgentFlow agents={flowAgents} />
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 min-w-0">
          <ChatThread
            messages={active?.messages ?? []}
            streamingIds={active?.streamingIds ?? new Set()}
            onApprove={handleApprove}
            runs={runs}
          />
        </div>

        <div className="flex flex-col gap-2 p-3 border-t">
          <div className="flex items-center justify-between">
            <a
              href="https://aistudio.google.com/rate-limit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground underline underline-offset-2"
            >
              Narration model · view your real Gemini limits ↗
            </a>
            <ModelToggle value={modelId} onChange={setModelId} usage={modelUsage} />
          </div>
          {hint && <p className="text-xs text-amber-600 dark:text-amber-400">{hint}</p>}
          {activeTaskId && (purchases.approvable > 0 || purchases.blocked.length > 0 || purchases.waiting > 0) && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-xs">
              {purchases.approvable > 0 && (
                <>
                  <span>
                    {purchases.approvable} purchase{purchases.approvable > 1 ? "s" : ""} waiting for your approval.
                  </span>
                  <Button size="xs" disabled={approving} onClick={approveAllPurchases}>
                    Approve {purchases.approvable > 1 ? "all" : "purchase"}
                  </Button>
                </>
              )}
              {purchases.waiting > 0 && purchases.approvable === 0 && (
                <>
                  <span>{purchases.waiting} order{purchases.waiting > 1 ? "s" : ""} placed, waiting for delivery.</span>
                  <Button size="xs" variant="outline" disabled={approving} onClick={receiveDeliveries}>
                    Mark delivery received
                  </Button>
                </>
              )}
              {purchases.blocked.length > 0 && (
                <span className="text-muted-foreground">
                  Cannot buy {purchases.blocked.join(", ")}: no supplier contract covers that quantity.{" "}
                  <Link href="/dashboard/contracts" className="underline underline-offset-2">Open Contracts</Link>
                </span>
              )}
            </div>
          )}
          <TaskComposer
            onSubmit={handleComposerSubmit}
            disabled={composerBusy}
            placeholder={
              activeTaskId
                ? 'Reply in this chat: "ok" to continue, "received", "done", "add one more", "cancel"'
                : "New chat: describe an order or material, e.g. '10 dining tables for Acme due in 14 days' or '3 foam padding'"
            }
          />
        </div>
      </div>

      {runsOpen && (
        <AgentRunsPanel
          runs={runs}
          scope={activeTaskId ? "This chat" : "Most recent, all chats"}
          onClose={() => setRunsOpen(false)}
        />
      )}
    </div>
  );
}
