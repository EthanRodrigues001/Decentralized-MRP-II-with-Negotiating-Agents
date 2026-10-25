import { claimEvents, markDone, markFailed, type DomainEvent } from "@/lib/events";
import { handleShortage } from "@/lib/purchasing";
import { planOrder, reallocate } from "@/lib/orders";
import { topUpRequests } from "@/lib/material-request";

// Orders are served first (they are ranked), then single-material requests.
async function freed(e: DomainEvent) {
  const materialId = String(e.payload.materialId);
  await reallocate(materialId);
  await topUpRequests(materialId);
}

// Event type -> handler. Types with no handler are acknowledged (they exist so
// the UI and later agents can read them).
const HANDLERS: Record<string, (event: DomainEvent) => Promise<void>> = {
  "stock.shortage": handleShortage,
  "order.created": planOrder,
  // Stock freed up: hand it to waiting orders in rank order.
  "delivery.received": freed,
  "stock.released": freed,
  "stock.adjusted": freed,
};

export async function processEvents(limit = 10) {
  const events = await claimEvents(limit);
  const results: { id: string; type: string; ok: boolean; error?: string }[] = [];
  for (const event of events) {
    try {
      await HANDLERS[event.type]?.(event);
      await markDone(event.id);
      results.push({ id: event.id, type: event.type, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(event.id, event.attempts, message);
      results.push({ id: event.id, type: event.type, ok: false, error: message });
    }
  }
  return results;
}

// Runs the queue until it is empty (events spawn follow-up events), so one API
// call can show the whole chain: order -> allocation -> shortage -> purchase.
export async function drainEvents(maxRounds = 6) {
  const all: Awaited<ReturnType<typeof processEvents>> = [];
  for (let i = 0; i < maxRounds; i++) {
    const batch = await processEvents(20);
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}
