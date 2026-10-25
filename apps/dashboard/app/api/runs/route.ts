import { handle } from "@/lib/api";
import { runsForThread } from "@/lib/threads";

export const dynamic = "force-dynamic";

// Recent runs across every thread, for the agent sidebar when no thread is open.
export function GET() {
  return handle(async () => ({ runs: await runsForThread(null, 40) }));
}
