"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GEMINI_MODELS } from "@/lib/models";

const items = GEMINI_MODELS.map((m) => ({ label: m.label, value: m.id }));

export interface ModelUsageMap {
  [modelId: string]: { calls: number; fallbacks: number };
}

export function ModelToggle({
  value,
  onChange,
  usage,
}: {
  value: string;
  onChange: (modelId: string) => void;
  usage: ModelUsageMap;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v as string)}>
      <SelectTrigger size="sm" className="text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {GEMINI_MODELS.map((m) => {
            const u = usage[m.id];
            return (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex flex-col py-0.5">
                  <span>{m.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {(m.inputTokenLimit / 1_000_000).toFixed(1)}M context · {m.description}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {u ? `${u.calls} call${u.calls === 1 ? "" : "s"} today` : "no calls today"}
                    {u && u.fallbacks > 0 ? ` · ${u.fallbacks} fell back` : ""}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
