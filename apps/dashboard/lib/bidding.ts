import { randomUUID } from "node:crypto";
import type { ProposePayload, RefusePayload, SupplierStats } from "@/lib/types";

// Plain deterministic code. Never the LLM — see docs/02-design/agents-and-negotiation.md
// "LLM boundary": the model may narrate a decision, it may never make one.

export function computeBidOrRefusal(
  stats: SupplierStats,
  quantity: number,
  dueInDays: number
): { propose: ProposePayload } | { refuse: RefusePayload } {
  if (stats.historyCount === 0) {
    return {
      refuse: {
        supplier: stats.supplier,
        reason: "no historical Raw Materials orders on file for this supplier",
      },
    };
  }

  if (quantity > stats.maxHistoricalQuantity * 3) {
    return {
      refuse: {
        supplier: stats.supplier,
        reason: `requested quantity (${quantity}) exceeds anything in this supplier's fulfillment history (max seen: ${stats.maxHistoricalQuantity})`,
      },
    };
  }

  const leadTimeDays = Math.round(stats.avgLeadTimeDays ?? dueInDays * 1.5);
  const unitPrice = Number(stats.avgNegotiatedPrice.toFixed(2));
  const defectRatePercent = Number((stats.defectRatePercent ?? 5).toFixed(1));
  const compliancePercent = Number(stats.compliancePercent.toFixed(1));

  // reliability: compliant history with few defects scores near 1, unreliable near 0
  const reliabilityScore = Number(
    Math.max(
      0,
      Math.min(1, (compliancePercent / 100) * (1 - defectRatePercent / 100))
    ).toFixed(3)
  );

  return {
    propose: {
      supplier: stats.supplier,
      quantity,
      unitPrice,
      totalPrice: Number((unitPrice * quantity).toFixed(2)),
      leadTimeDays,
      reliabilityScore,
      defectRatePercent,
      compliancePercent,
      historyCount: stats.historyCount,
      holdToken: `hold_${randomUUID()}`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    },
  };
}

// Score formula from docs/02-design/agents-and-negotiation.md — lower is better.
export function scoreProposals(proposals: ProposePayload[], dueInDays: number): ProposePayload[] {
  if (proposals.length === 0) return proposals;

  const costs = proposals.map((p) => p.totalPrice);
  const tardiness = proposals.map((p) => Math.max(0, p.leadTimeDays - dueInDays));
  const leadTimes = proposals.map((p) => p.leadTimeDays);
  const risks = proposals.map((p) => 1 - p.reliabilityScore);

  const normalize = (values: number[], v: number) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return 0;
    return (v - min) / (max - min);
  };

  return proposals.map((p, i) => ({
    ...p,
    score: Number(
      (
        0.45 * normalize(costs, costs[i]) +
        0.35 * normalize(tardiness, tardiness[i]) +
        0.15 * normalize(leadTimes, leadTimes[i]) +
        0.05 * normalize(risks, risks[i])
      ).toFixed(4)
    ),
  }));
}
