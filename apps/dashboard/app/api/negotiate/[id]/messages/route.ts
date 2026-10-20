import { getNegotiationMessages } from "@/lib/negotiation-db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const messages = await getNegotiationMessages(id);
  return Response.json({ messages });
}
