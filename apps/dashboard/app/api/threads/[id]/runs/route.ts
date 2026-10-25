import { handle } from "@/lib/api";
import { runsForThread } from "@/lib/threads";

export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => ({ runs: await runsForThread((await params).id) }));
}
