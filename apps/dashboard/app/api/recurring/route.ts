import { handle, readJson } from "@/lib/api";
import { createRecurring, listRecurring, validateRecurring } from "@/lib/recurring";
import { drainEvents } from "@/lib/event-processor";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ recurring: await listRecurring() }));
}

export function POST(request: Request) {
  return handle(async () => {
    const created = await createRecurring(validateRecurring(await readJson(request)));
    return { ...created, processed: await drainEvents() };
  });
}
