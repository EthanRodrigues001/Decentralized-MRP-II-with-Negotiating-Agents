import { getActiveSupplierNames } from "@/lib/suppliers";
import { getSupplierStats } from "@/lib/supplier-stats";

export async function GET() {
  const suppliers = await getActiveSupplierNames();
  const stats = await Promise.all(suppliers.map(getSupplierStats));
  return Response.json({ agents: stats });
}
