import { handle } from "@/lib/api";
import { threadPurchases } from "@/lib/chat-handler";

// What this chat is waiting on in purchasing: approvable, blocked (no contract) and placed.
export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const pos = await threadPurchases(id);
    const open = pos.filter((p) => p.status === "needs_approval");
    return {
      approvable: open.filter((p) => p.supplier).length,
      blocked: open.filter((p) => !p.supplier).map((p) => p.material),
      waiting: pos.filter((p) => p.status === "placed").length,
    };
  });
}
