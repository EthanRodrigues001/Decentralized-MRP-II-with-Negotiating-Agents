import { handle, readJson } from "@/lib/api";
import { settleThread } from "@/lib/threads";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    await settleThread(id, body.settled !== false);
    return { ok: true };
  });
}
