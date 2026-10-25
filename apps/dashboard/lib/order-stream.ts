import { createOrder, INVENTORY_AGENT, PLANNING_AGENT, type OrderInput } from "@/lib/orders";
import { createRecurring } from "@/lib/recurring";
import { processEvents } from "@/lib/event-processor";
import { peekPendingType, processingCount } from "@/lib/events";
import { getNegotiationMessages } from "@/lib/negotiation-db";
import { PURCHASING_AGENT } from "@/lib/purchasing";
import type { StreamEvent } from "@/lib/types";

// Which agent will handle each kind of event, so the UI can show it spin up
// before it works instead of after everything has finished.
const AGENT_FOR: Record<string, string> = {
  "order.created": PLANNING_AGENT,
  "stock.shortage": PURCHASING_AGENT,
  "delivery.received": INVENTORY_AGENT,
  "stock.released": INVENTORY_AGENT,
  "stock.adjusted": INVENTORY_AGENT,
};

const MAX_MS = 25_000;

// Streams an order through its event chain one event at a time, using the same
// event protocol as the negotiation console: agents spawn and run live, and
// each message appears as soon as it is written.
export async function* createOrderStream(
  input: Required<OrderInput>,
  everyDays?: number
): AsyncGenerator<StreamEvent> {
  const created = everyDays ? await createRecurring({ ...input, everyDays }) : await createOrder(input);
  const thread = created.negotiationId;
  yield { type: "negotiation_id", negotiationId: thread };

  const spawned = new Set<string>();
  const seen = new Set<string>();

  function* spawn(agent: string): Generator<StreamEvent> {
    if (spawned.has(agent)) return;
    spawned.add(agent);
    yield { type: "agent_spawn", agent: { id: agent, role: "worker", label: agent } };
  }

  async function* flush(): AsyncGenerator<StreamEvent> {
    for (const m of await getNegotiationMessages(thread)) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      for (const name of [m.sender, m.receiver]) if (name !== "You") yield* spawn(name);
      yield { type: "message", message: m };
    }
  }

  yield* flush();
  const deadline = Date.now() + MAX_MS;
  while (Date.now() < deadline) {
    const next = await peekPendingType();
    if (!next) {
      // Another processor (the page poll) may be mid-way through the next step; wait for it.
      if ((await processingCount()) === 0) break;
      await new Promise((r) => setTimeout(r, 300));
      yield* flush();
      continue;
    }
    const agent = AGENT_FOR[next];
    if (agent) {
      yield* spawn(agent);
      yield { type: "agent_status", agentId: agent, status: "running" };
    }
    await processEvents(1);
    yield* flush();
    if (agent) yield { type: "agent_status", agentId: agent, status: "done" };
  }
  yield* flush();
  for (const a of spawned) yield { type: "agent_status", agentId: a, status: "done" };
  yield { type: "done" };
}
