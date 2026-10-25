import { createOrderStream } from "@/lib/order-stream";
import { validateOrder } from "@/lib/orders";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";

function toResponse(generator: AsyncGenerator<StreamEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await generator.next();
        if (done) return controller.close();
        controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream failed";
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message }) + "\n"));
        controller.close();
      }
    },
    async cancel() {
      await generator.return?.(undefined);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  try {
    const input = validateOrder(body);
    const every = body.everyDays === undefined || body.everyDays === null ? undefined : Number(body.everyDays);
    if (every !== undefined && (!Number.isInteger(every) || every < 1 || every > 365)) {
      return Response.json({ error: "everyDays must be a whole number between 1 and 365" }, { status: 400 });
    }
    return toResponse(createOrderStream(input, every));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "invalid order" }, { status: 400 });
  }
}
