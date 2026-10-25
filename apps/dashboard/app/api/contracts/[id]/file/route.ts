import { handle } from "@/lib/api";
import { getContractFile, saveContractFile } from "@/lib/contracts";

export const runtime = "nodejs";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("file is required");
    await saveContractFile(id, file.name, file.type, Buffer.from(await file.arrayBuffer()));
    return { ok: true, fileName: file.name };
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const f = await getContractFile(id);
    return new Response(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.type,
        "Content-Disposition": `inline; filename="${f.name.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "file not found" }, { status: 404 });
  }
}
