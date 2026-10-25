import { handle, readJson } from "@/lib/api";
import { adjustStock } from "@/lib/inventory";

export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    await adjustStock(String(body.materialId), Number(body.delta), String(body.note ?? ""));
    return { ok: true };
  });
}
