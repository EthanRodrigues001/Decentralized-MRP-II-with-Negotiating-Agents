"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentFlow, type FlowAgentState } from "@/components/agent-flow";
import { ChatThread } from "@/components/chat-thread";
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
        name === "Gateway" ? "gateway" : name === "ExplanationAgent" ? "explanation" : "supplier";
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
  const [modelId, setModelId] = useState(DEFAULT_GEMINI_MODEL);
  const [modelUsage, setModelUsage] = useState<ModelUsageMap>({});

  async function refreshTaskList() {
    const res = await fetch("/api/negotiations");
    const data = await res.json();
    setTasks(data.tasks);
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
    if (taskData[id]) return;
    const res = await fetch(`/api/negotiate/${id}/messages`);
    const data = await res.json();
    setTaskData((prev) => ({ ...prev, [id]: reconstructTaskData(data.messages) }));
  }

  async function handleComposerSubmit(text: string) {
    setComposerBusy(true);
    const intake = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, modelId }),
    }).then((r) => r.json());

    let newTaskId: string | null = null;
    for await (const event of postStream("/api/negotiate/stream", {
      type: "start",
      quantity: intake.quantity,
      dueInDays: intake.dueInDays,
      requestText: text,
      modelId,
    })) {
      if (event.type === "negotiation_id") {
        newTaskId = event.negotiationId;
        setTaskData((prev) => ({ ...prev, [newTaskId!]: emptyTaskData() }));
        setActiveTaskId(newTaskId);
        setTasks((prev) => [
          {
            id: newTaskId!,
            item_category: "Raw Materials",
            quantity: intake.quantity,
            due_in_days: intake.dueInDays,
            status: "awaiting_approval",
            winning_supplier: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        continue;
      }
      if (newTaskId) applyEvent(newTaskId, event);
    }
    setComposerBusy(false);
    refreshTaskList();
    refreshModelUsage();
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

  return (
    <div className="flex h-full">
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="px-3 py-2 border-b">
          <span className="text-sm font-semibold">Tasks</span>
        </div>
        <TaskList tasks={tasks} activeTaskId={activeTaskId} onSelect={selectTask} />
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {flowAgents.length > 0 && (
          <div className="h-[260px] shrink-0 p-2">
            <AgentFlow agents={flowAgents} />
          </div>
        )}

        <div className="flex-1 min-h-0">
          <ChatThread
            messages={active?.messages ?? []}
            streamingIds={active?.streamingIds ?? new Set()}
            onApprove={handleApprove}
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
          <TaskComposer onSubmit={handleComposerSubmit} disabled={composerBusy} />
        </div>
      </div>
    </div>
  );
}
