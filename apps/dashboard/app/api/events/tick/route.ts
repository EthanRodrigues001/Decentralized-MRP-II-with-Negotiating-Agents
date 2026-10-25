import { handle } from "@/lib/api";
import { processEvents } from "@/lib/event-processor";
import { runDueRecurring } from "@/lib/recurring";
import { runDailySchedule } from "@/lib/orders";

// Called by the UI on an interval (and after requests that emit events). Safe to
// call concurrently: events are claimed with SKIP LOCKED and recurring orders
// are claimed by a single statement.
export function POST() {
  return handle(async () => {
    const raised = await runDueRecurring();
    const processed = await processEvents(10);
    // A new day refills the daily limit, so orders waiting for a slot can start now.
    const started = await runDailySchedule();
    return { raised, processed, started };
  });
}
