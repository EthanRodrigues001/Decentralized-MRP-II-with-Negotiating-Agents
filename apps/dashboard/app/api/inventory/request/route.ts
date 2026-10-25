import { randomUUID } from "node:crypto";
import { handle, readJson } from "@/lib/api";
import { requestMaterial } from "@/lib/inventory";
import { processEvents } from "@/lib/event-processor";

// Manual stand-in for an order consuming material: reserves what is available,
// publishes a shortage for the rest, and runs the event processor so the
// purchasing agent reacts immediately.
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    const result = await requestMaterial(String(body.materialId), Number(body.qty), `manual-${randomUUID()}`);
    const processed = await processEvents(10);
    return { ...result, processed };
  });
}
