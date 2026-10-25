import { handle } from "@/lib/api";
import { buildBomDocument } from "@/lib/bom";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handle(async () => {
    const { searchParams } = new URL(request.url);
    const document = await buildBomDocument(String(searchParams.get("productId") ?? ""), Number(searchParams.get("qty") ?? 1));
    return { document };
  });
}
