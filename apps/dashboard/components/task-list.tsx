"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  CheckCheckIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  RepeatIcon,
  Undo2Icon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DisplayStatus, ThreadSummary } from "@/lib/threads";

export type TaskSummary = ThreadSummary;

const STATUS: Record<DisplayStatus, { label: string; className: string; icon: React.ReactNode }> = {
  working: { label: "Working", className: "text-blue-500", icon: <CircleDashedIcon className="size-3.5 animate-[spin_3s_linear_infinite]" /> },
  waiting: { label: "Waiting for stock", className: "text-amber-500", icon: <CircleDashedIcon className="size-3.5" /> },
  needs_approval: { label: "Needs approval", className: "text-amber-500", icon: <AlertCircleIcon className="size-3.5" /> },
  ready: { label: "Ready", className: "text-emerald-500", icon: <CheckCircle2Icon className="size-3.5" /> },
  done: { label: "Done", className: "text-emerald-500", icon: <CheckCircle2Icon className="size-3.5" /> },
  rejected: { label: "Rejected", className: "text-muted-foreground", icon: <XCircleIcon className="size-3.5" /> },
  cancelled: { label: "Cancelled", className: "text-muted-foreground", icon: <XCircleIcon className="size-3.5" /> },
};

// Needs attention first, then in-flight work, then finished (the ones you can settle).
const ORDER: DisplayStatus[] = ["needs_approval", "working", "waiting", "ready", "done", "rejected", "cancelled"];

function Row({
  task,
  active,
  onSelect,
  onSettle,
}: {
  task: ThreadSummary;
  active: boolean;
  onSelect: () => void;
  onSettle: (settled: boolean) => void;
}) {
  const s = STATUS[task.displayStatus];
  return (
    <div
      className={cn(
        "group/row relative flex cursor-pointer flex-col gap-0.5 rounded-lg border border-transparent px-3 py-2 transition-colors hover:bg-muted/60",
        active && "border-border bg-muted"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{task.title}</span>
        <span className={cn("flex shrink-0 items-center gap-1 text-[11px] font-medium", s.className)}>
          {s.icon}
          {s.label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-muted-foreground">{task.subtitle}</span>
        <div className="flex shrink-0 items-center gap-1">
          {task.recurring && (
            <Tooltip>
              <TooltipTrigger render={<span />} className="text-muted-foreground" aria-label="Recurring order">
                <RepeatIcon className="size-3" />
              </TooltipTrigger>
              <TooltipContent>Raised by a recurring order</TooltipContent>
            </Tooltip>
          )}
          {(task.settleable || task.settled) && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={task.settled ? "Unsettle" : "Settle"}
                    className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSettle(!task.settled);
                    }}
                  />
                }
              >
                {task.settled ? <Undo2Icon /> : <CheckCheckIcon />}
              </TooltipTrigger>
              <TooltipContent>{task.settled ? "Move back to active" : "Settle: file this away"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

export function TaskList({
  tasks,
  activeTaskId,
  onSelect,
  onSettle,
  onSettleAll,
}: {
  tasks: ThreadSummary[];
  activeTaskId: string | null;
  onSelect: (id: string) => void;
  onSettle: (id: string, settled: boolean) => void;
  onSettleAll: () => void;
}) {
  const [settledOpen, setSettledOpen] = useState(false);
  const active = tasks
    .filter((t) => !t.settled)
    .sort((a, b) => ORDER.indexOf(a.displayStatus) - ORDER.indexOf(b.displayStatus) || b.createdAt.localeCompare(a.createdAt));
  const settled = tasks.filter((t) => t.settled);
  const finished = active.filter((t) => t.settleable).length;

  return (
    <TooltipProvider delay={200}>
      <div className="flex h-full min-h-0 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {active.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                Nothing active. Describe an order below, e.g. &ldquo;10 dining tables for Acme due in 14 days&rdquo;, or add
                &ldquo;every 2 weeks&rdquo; to repeat it.
              </p>
            )}
            {active.map((t) => (
              <Row
                key={t.id}
                task={t}
                active={activeTaskId === t.id}
                onSelect={() => onSelect(t.id)}
                onSettle={(v) => onSettle(t.id, v)}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="border-t">
          {finished > 0 && (
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="text-[11px] text-muted-foreground">{finished} finished</span>
              <Button size="xs" variant="ghost" onClick={onSettleAll}>
                <CheckCheckIcon /> Settle all
              </Button>
            </div>
          )}
          <button
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setSettledOpen((v) => !v)}
          >
            Settled ({settled.length})
            <ChevronDownIcon className={cn("size-3.5 transition-transform", !settledOpen && "-rotate-90")} />
          </button>
          {settledOpen && (
            <ScrollArea className="max-h-64">
              <div className="flex flex-col gap-0.5 p-2 pt-0">
                {settled.length === 0 && <p className="px-3 pb-2 text-[11px] text-muted-foreground">Nothing settled yet.</p>}
                {settled.map((t) => (
                  <Row
                    key={t.id}
                    task={t}
                    active={activeTaskId === t.id}
                    onSelect={() => onSelect(t.id)}
                    onSettle={(v) => onSettle(t.id, v)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
