import { handle, readJson } from "@/lib/api";
import { terminateContract, updateContract, validateContract } from "@/lib/contracts";

export function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    await updateContract(id, validateContract(await readJson(request)));
    return { ok: true };
  });
}

// Contracts are terminated, never deleted, so past purchase orders keep their reference.
export function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    await terminateContract(id);
    return { ok: true };
  });
}
