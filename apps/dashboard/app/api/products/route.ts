import { handle } from "@/lib/api";
import { listProducts } from "@/lib/bom";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ products: await listProducts() }));
}
