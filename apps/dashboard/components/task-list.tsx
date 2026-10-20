"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface TaskSummary {
  id: string;
  item_category: string;
  quantity: number;
  due_in_days: number;
  status: string;
  winning_supplier: string | null;
  created_at: string;
}

const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  awaiting_approval: "secondary",
  committed: "default",
  rejected: "destructive",
};

export function TaskList({
  tasks,
  activeTaskId,
  onSelect,
}: {
  tasks: TaskSummary[];
  activeTaskId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {tasks.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">
            No tasks yet — describe what you need in the chat to start one.
          </p>
        )}
        {tasks.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "flex flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
              activeTaskId === t.id && "border-primary bg-muted"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {t.quantity} units · {t.due_in_days}d
              </span>
              <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-[10px]">
                {t.status}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {t.winning_supplier ? `Won by ${t.winning_supplier.replace(/_/g, " ")}` : t.item_category}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
