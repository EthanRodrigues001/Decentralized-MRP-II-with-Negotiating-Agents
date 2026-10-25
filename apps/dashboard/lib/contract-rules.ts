// Pure contract checks. The purchasing agent may only buy under a contract that
// passes these, and the same check is repeated inside the database statement
// that commits the purchase.

export interface ContractTerms {
  id: string;
  supplier: string;
  unitPrice: number;
  minQty: number;
  maxQty: number;
  leadTimeDays: number;
  validFrom: string; // YYYY-MM-DD
  validTo: string; // YYYY-MM-DD
  status: "active" | "terminated";
}

export type ContractVerdict = { ok: true } | { ok: false; reason: string };

export function checkContract(c: ContractTerms, qty: number, today: string): ContractVerdict {
  if (c.status !== "active") return { ok: false, reason: "contract terminated" };
  if (today < c.validFrom) return { ok: false, reason: `not valid until ${c.validFrom}` };
  if (today > c.validTo) return { ok: false, reason: `expired on ${c.validTo}` };
  if (qty < c.minQty) return { ok: false, reason: `quantity ${qty} is below the contract minimum of ${c.minQty}` };
  if (qty > c.maxQty) return { ok: false, reason: `quantity ${qty} is above the contract maximum of ${c.maxQty}` };
  return { ok: true };
}

export type ContractHealth = "active" | "expiring" | "expired" | "upcoming" | "terminated";

export function contractHealth(c: ContractTerms, today: string, expiringWithinDays = 30): ContractHealth {
  if (c.status === "terminated") return "terminated";
  if (today < c.validFrom) return "upcoming";
  if (today > c.validTo) return "expired";
  const ms = new Date(c.validTo).getTime() - new Date(today).getTime();
  return ms / 86_400_000 <= expiringWithinDays ? "expiring" : "active";
}

/** Today in YYYY-MM-DD, in UTC, so server and tests agree. */
export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
