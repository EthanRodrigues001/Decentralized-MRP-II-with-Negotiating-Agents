import { handle, readJson } from "@/lib/api";
import { createContract, listContracts, validateContract } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ contracts: await listContracts() }));
}

export function POST(request: Request) {
  return handle(async () => ({ id: await createContract(validateContract(await readJson(request))) }));
}
