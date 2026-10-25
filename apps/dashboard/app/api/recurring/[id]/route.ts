import { handle, readJson } from "@/lib/api";
import { deleteRecurring, setRecurringActive } from "@/lib/recurring";

export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    if (typeof body.active !== "boolean") throw new Error("active must be a boolean");
    await setRecurringActive(id, body.active);
    return { ok: true };
  });
}

export function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await deleteRecurring((await params).id);
    return { ok: true };
  });
}
