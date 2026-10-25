import { handle } from "@/lib/api";
import { listThreads } from "@/lib/threads";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ threads: await listThreads() }));
}
