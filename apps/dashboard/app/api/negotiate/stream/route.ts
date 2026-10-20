import { startNegotiationStream, decideNegotiationStream } from "@/lib/negotiation-stream";
import type { StreamEvent, SupplierName } from "@/lib/types";

export const runtime = "nodejs";

function toResponse(generator: AsyncGenerator<StreamEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await generator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
    },
    async cancel() {
      await generator.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === "start") {
    const quantity = Number(body.quantity);
    const dueInDays = Number(body.dueInDays);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(dueInDays) || dueInDays <= 0) {
      return Response.json({ error: "quantity and dueInDays must be positive numbers" }, { status: 400 });
    }
    const requestText = typeof body.requestText === "string" ? body.requestText : undefined;
    const modelId = typeof body.modelId === "string" ? body.modelId : undefined;
    return toResponse(startNegotiationStream(quantity, dueInDays, requestText, modelId));
  }

  if (body.type === "decide") {
    const negotiationId = String(body.negotiationId ?? "");
    const chosenSupplier = (body.chosenSupplier as SupplierName | undefined) ?? null;
    const modelId = typeof body.modelId === "string" ? body.modelId : undefined;
    if (!negotiationId) {
      return Response.json({ error: "negotiationId is required" }, { status: 400 });
    }
    return toResponse(decideNegotiationStream(negotiationId, chosenSupplier, modelId));
  }

  return Response.json({ error: "unknown request type" }, { status: 400 });
}
