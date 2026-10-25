import { handle, readJson } from "@/lib/api";
import { createMaterialRequest } from "@/lib/material-request";
import { drainEvents } from "@/lib/event-processor";

export const runtime = "nodejs";

// A chat asking for one raw material ("3 foam padding"). Creates the thread,
// reserves free stock, and lets purchasing react to any shortage.
export function POST(request: Request) {
  return handle(async () => {
    const b = await readJson(request);
    const qty = Number(b.qty);
    const dueInDays = Number(b.dueInDays ?? 14);
    if (!Number.isInteger(dueInDays) || dueInDays < 1 || dueInDays > 730) throw new Error("dueInDays must be a whole number between 1 and 730");
    const created = await createMaterialRequest({ materialId: String(b.materialId ?? ""), qty, dueInDays });
    await drainEvents();
    return created;
  });
}
