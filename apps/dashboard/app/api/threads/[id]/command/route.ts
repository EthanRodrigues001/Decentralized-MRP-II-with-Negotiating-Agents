import { handle, readJson } from "@/lib/api";
import { handleChatMessage } from "@/lib/chat-handler";

export const runtime = "nodejs";

// Typed words inside an existing chat: "ok", "received", "done", "add one more".
// handled=false means the text is a new request and the caller should start one.
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw new Error("text is required");
    return handleChatMessage(id, text);
  });
}
