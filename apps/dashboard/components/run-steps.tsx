"use client";

import { BrainIcon, CheckIcon, ChevronRightIcon, WrenchIcon, XIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface RunStep {
  seq: number;
  kind: "thinking" | "tool" | "result" | "message";
  name: string | null;
  input: unknown;
  output: unknown;
  at: string;
}

export interface AgentRun {
  id: string;
  agent: string;
  title: string | null;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
  thread_id: string | null;
  steps: RunStep[];
}

// Compact one-line rendering of a step payload: key: value pairs, long values cut.
export function brief(value: unknown, max = 160): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "object") {
    text = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
      .join(", ");
  } else {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function duration(run: AgentRun): string | null {
  if (!run.finished_at) return null;
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return ms < 1000 ? `${Math.max(ms, 1)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const STATUS_DOT: Record<AgentRun["status"], string> = {
  running: "bg-amber-500 animate-pulse",
  done: "bg-emerald-500",
  failed: "bg-destructive",
};

export function RunSteps({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) return <p className="px-3 py-2 text-[11px] text-muted-foreground">No steps recorded.</p>;
  return (
    <ol className="space-y-1.5 px-3 py-2">
      {steps.map((s) => {
        const isError = s.name === "error";
        if (s.kind === "thinking") {
          const text = (s.output as { text?: string } | null)?.text ?? brief(s.output);
          return (
            <li key={s.seq} className="flex gap-2 text-[11px] leading-snug">
              <BrainIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground italic">{text}</span>
            </li>
          );
        }
        if (s.kind === "tool") {
          return (
            <li key={s.seq} className="flex gap-2 text-[11px] leading-snug">
              <WrenchIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <span className="font-mono font-medium">{s.name}</span>
                {s.input ? <span className="font-mono text-muted-foreground"> ({brief(s.input, 100)})</span> : null}
                {s.output ? <div className="font-mono break-words text-muted-foreground">→ {brief(s.output)}</div> : null}
              </div>
            </li>
          );
        }
        return (
          <li key={s.seq} className="flex gap-2 text-[11px] leading-snug">
            {isError ? (
              <XIcon className="mt-0.5 size-3 shrink-0 text-destructive" />
            ) : (
              <CheckIcon className="mt-0.5 size-3 shrink-0 text-emerald-500" />
            )}
            <div className="min-w-0">
              <span className={`font-mono font-medium ${isError ? "text-destructive" : ""}`}>{s.name}</span>
              {s.output ? <span className="font-mono break-words text-muted-foreground"> {brief(s.output)}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function firstThought(run: AgentRun): string | null {
  const t = run.steps.find((s) => s.kind === "thinking");
  return t ? ((t.output as { text?: string } | null)?.text ?? null) : null;
}

/** One agent run as a collapsed block: header with step count and duration, steps behind the arrow. */
export function RunBlock({ run, className = "" }: { run: AgentRun; className?: string }) {
  const d = duration(run);
  const thought = firstThought(run);
  return (
    <Collapsible className={`group/run w-full min-w-0 rounded-md border bg-muted/20 ${className}`}>
      <CollapsibleTrigger className="flex w-full min-w-0 items-start gap-2 px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <ChevronRightIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform group-data-[open]/run:rotate-90" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-[11px]">
            <span className={`size-1.5 rounded-full ${STATUS_DOT[run.status]}`} />
            <span className="font-medium">{run.agent}</span>
            <span className="text-muted-foreground">
              {run.steps.length} step{run.steps.length === 1 ? "" : "s"}
              {d ? ` · ${d}` : ""}
            </span>
          </div>
          {thought && (
            <div className="truncate text-[11px] text-muted-foreground italic group-data-[open]/run:hidden">{thought}</div>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <RunSteps steps={run.steps} />
      </CollapsibleContent>
    </Collapsible>
  );
}
