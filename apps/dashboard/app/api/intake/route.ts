import { parseTaskRequest } from "@/lib/intake";

export async function POST(request: Request) {
  const { text, modelId } = await request.json();
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  const result = await parseTaskRequest(text.trim(), modelId);
  return Response.json(result);
}
