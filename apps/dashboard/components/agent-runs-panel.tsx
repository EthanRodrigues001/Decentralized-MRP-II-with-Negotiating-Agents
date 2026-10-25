"use client";

import { ChevronRightIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RunSteps, duration, type AgentRun } from "@/components/run-steps";

const DOT: Record<AgentRun["status"], string> = {
  running: "bg-amber-500 animate-pulse",
  done: "bg-emerald-500",
  failed: "bg-destructive",
};

// Right-hand sidebar: every agent run for the open chat (newest first). Each run
// opens to the thinking and tool calls behind it. Runs come from the same rows the
// agents write as they work; there is no separate logging agent.
export function AgentRunsPanel({
  runs,
  scope,
  onClose,
}: {
  runs: AgentRun[];
  scope: string;
  onClose: () => void;
}) {
  const ordered = [...runs].reverse();
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <div className="text-xs font-semibold">Agents already ran</div>
          <div className="text-[11px] text-muted-foreground">{scope}</div>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Close agent panel" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {ordered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No agent has run for this chat yet.</p>
        ) : (
          <ul className="space-y-1.5 p-2">
            {ordered.map((r) => (
              <li key={r.id}>
                <Collapsible className="group/panelrun rounded-md border bg-card">
                  <CollapsibleTrigger className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                    <ChevronRightIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform group-data-[open]/panelrun:rotate-90" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <span className={`size-1.5 rounded-full ${DOT[r.status]}`} />
                        <span className="truncate">{r.agent}</span>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{r.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.steps.length} steps{duration(r) ? ` · ${duration(r)}` : ""} · {new Date(r.started_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t">
                    <RunSteps steps={r.steps} />
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}
