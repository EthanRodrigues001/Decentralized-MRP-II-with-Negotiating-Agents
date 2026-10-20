import { getModelUsageToday } from "@/lib/model-usage";

export async function GET() {
  const usage = await getModelUsageToday();
  return Response.json({ usage });
}
