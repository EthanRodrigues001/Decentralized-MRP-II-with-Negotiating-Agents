import { handle } from "@/lib/api";
import { listInventory, listMovements } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const [inventory, movements] = await Promise.all([listInventory(), listMovements(100)]);
    return { inventory, movements };
  });
}
