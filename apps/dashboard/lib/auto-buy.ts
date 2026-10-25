// Pure decision rule for purchasing. No DB, no LLM: the same inputs always give
// the same outcome, so it can be unit-tested and audited.

export interface PurchaseDecisionInput {
  /** Quantity missing after reservations (before counting stock already on order). */
  shortfall: number;
  /** Stock already ordered but not yet received. Counts as incoming supply. */
  onOrder: number;
  threshold: number;
  autoBuyEnabled: boolean;
  /** Estimated cost of the purchase, for the daily spend cap. */
  estimatedCost: number;
  spentTodayAuto: number;
  maxAutoSpendPerDay: number;
}

export type PurchaseDecision =
  | { action: "none"; qty: 0; reason: string }
  | { action: "auto"; qty: number; reason: string }
  | { action: "needs_approval"; qty: number; reason: string };

export function decidePurchase(i: PurchaseDecisionInput): PurchaseDecision {
  const net = Math.max(0, i.shortfall - i.onOrder);
  if (net === 0) {
    return {
      action: "none",
      qty: 0,
      reason:
        i.shortfall > 0
          ? `shortfall of ${i.shortfall} is already covered by ${i.onOrder} on order`
          : "no shortfall",
    };
  }
  if (!i.autoBuyEnabled) {
    return { action: "needs_approval", qty: net, reason: "auto-buy is disabled in settings" };
  }
  if (net > i.threshold) {
    return {
      action: "needs_approval",
      qty: net,
      reason: `shortfall ${net} is above the auto-buy threshold of ${i.threshold}`,
    };
  }
  if (i.spentTodayAuto + i.estimatedCost > i.maxAutoSpendPerDay) {
    return {
      action: "needs_approval",
      qty: net,
      reason: `auto-buy would exceed the daily limit (${i.spentTodayAuto + i.estimatedCost} > ${i.maxAutoSpendPerDay})`,
    };
  }
  return {
    action: "auto",
    qty: net,
    reason: `shortfall ${net} is within the auto-buy threshold of ${i.threshold}`,
  };
}
