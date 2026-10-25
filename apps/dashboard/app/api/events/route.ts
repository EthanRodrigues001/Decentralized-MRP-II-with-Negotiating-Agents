import { handle } from "@/lib/api";
import { listEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ events: await listEvents(50) }));
}
