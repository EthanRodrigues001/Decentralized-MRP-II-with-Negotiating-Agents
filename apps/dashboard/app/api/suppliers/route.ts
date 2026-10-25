import { handle } from "@/lib/api";
import { getActiveSupplierNames } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ suppliers: await getActiveSupplierNames() }));
}
