"use client";

import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Small "i" icon that explains a term on hover or keyboard focus.
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`What is ${label}?`}
        className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <InfoIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="block max-w-64 py-2 text-left leading-snug">
        <div className="font-medium">{label}</div>
        <div className="mt-0.5 font-normal opacity-80">{children}</div>
      </TooltipContent>
    </Tooltip>
  );
}
