import { sql } from "@/lib/db";
import { checkContract, contractHealth, todayIso, type ContractTerms } from "@/lib/contract-rules";

export interface ContractRow extends ContractTerms {
  materialId: string;
  material: string;
  sku: string;
  unit: string;
  paymentTerms: string | null;
  penaltyTerms: string | null;
  fileName: string | null;
  hasFile: boolean;
  health: ReturnType<typeof contractHealth>;
}

function toIso(d: unknown): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

function mapRow(r: Record<string, unknown>): ContractRow {
  const terms: ContractTerms = {
    id: r.id as string,
    supplier: r.supplier as string,
    unitPrice: Number(r.unit_price),
    minQty: Number(r.min_qty),
    maxQty: Number(r.max_qty),
    leadTimeDays: Number(r.lead_time_days),
    validFrom: toIso(r.valid_from),
    validTo: toIso(r.valid_to),
    status: r.status as ContractTerms["status"],
  };
  return {
    ...terms,
    materialId: r.material_id as string,
    material: r.material as string,
    sku: r.sku as string,
    unit: r.unit as string,
    paymentTerms: (r.payment_terms as string) ?? null,
    penaltyTerms: (r.penalty_terms as string) ?? null,
    fileName: (r.file_name as string) ?? null,
    hasFile: Boolean(r.file_name),
    health: contractHealth(terms, todayIso()),
  };
}

export async function listContracts(): Promise<ContractRow[]> {
  const rows = await sql`
    SELECT c.id, c.supplier, c.material_id, c.unit_price, c.min_qty, c.max_qty, c.lead_time_days,
           c.valid_from::text AS valid_from, c.valid_to::text AS valid_to, c.payment_terms, c.penalty_terms,
           c.status, c.file_name, m.name AS material, m.sku, m.unit
    FROM contracts c JOIN materials m ON m.id = c.material_id
    ORDER BY m.name, c.unit_price
  `;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function listContractsForMaterial(materialId: string): Promise<ContractRow[]> {
  const rows = await sql`
    SELECT c.id, c.supplier, c.material_id, c.unit_price, c.min_qty, c.max_qty, c.lead_time_days,
           c.valid_from::text AS valid_from, c.valid_to::text AS valid_to, c.payment_terms, c.penalty_terms,
           c.status, c.file_name, m.name AS material, m.sku, m.unit
    FROM contracts c JOIN materials m ON m.id = c.material_id
    WHERE c.material_id = ${materialId}
    ORDER BY c.unit_price
  `;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

/** Splits a material's contracts into those that can be used for `qty` today and those excluded (with the clause). */
export async function usableContracts(materialId: string, qty: number) {
  const today = todayIso();
  const all = await listContractsForMaterial(materialId);
  const usable: ContractRow[] = [];
  const excluded: { supplier: string; contractId: string; reason: string }[] = [];
  for (const c of all) {
    const v = checkContract(c, qty, today);
    if (v.ok) usable.push(c);
    else excluded.push({ supplier: c.supplier, contractId: c.id, reason: v.reason });
  }
  return { usable, excluded };
}

export interface ContractInput {
  supplier: string;
  materialId: string;
  unitPrice: number;
  minQty: number;
  maxQty: number;
  leadTimeDays: number;
  validFrom: string;
  validTo: string;
  paymentTerms?: string | null;
  penaltyTerms?: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validateContract(input: unknown): ContractInput {
  if (typeof input !== "object" || input === null) throw new Error("body must be an object");
  const o = input as Record<string, unknown>;
  const supplier = String(o.supplier ?? "").trim();
  if (!supplier) throw new Error("supplier is required");
  const materialId = String(o.materialId ?? "");
  if (!materialId) throw new Error("materialId is required");
  const unitPrice = Number(o.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("unitPrice must be greater than 0");
  const minQty = Number(o.minQty ?? 1);
  const maxQty = Number(o.maxQty);
  if (!Number.isInteger(minQty) || minQty < 1) throw new Error("minQty must be a whole number of at least 1");
  if (!Number.isInteger(maxQty) || maxQty < minQty) throw new Error("maxQty must be a whole number at least minQty");
  const leadTimeDays = Number(o.leadTimeDays);
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0) throw new Error("leadTimeDays must be a whole number, 0 or more");
  const validFrom = String(o.validFrom ?? "");
  const validTo = String(o.validTo ?? "");
  if (!ISO.test(validFrom) || !ISO.test(validTo)) throw new Error("validFrom and validTo must be YYYY-MM-DD dates");
  if (validTo < validFrom) throw new Error("validTo must not be before validFrom");
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
  return {
    supplier,
    materialId,
    unitPrice,
    minQty,
    maxQty,
    leadTimeDays,
    validFrom,
    validTo,
    paymentTerms: clean(o.paymentTerms),
    penaltyTerms: clean(o.penaltyTerms),
  };
}

export async function createContract(c: ContractInput): Promise<string> {
  const rows = await sql`
    INSERT INTO contracts (supplier, material_id, unit_price, min_qty, max_qty, lead_time_days,
                           valid_from, valid_to, payment_terms, penalty_terms)
    VALUES (${c.supplier}, ${c.materialId}, ${c.unitPrice}, ${c.minQty}, ${c.maxQty}, ${c.leadTimeDays},
            ${c.validFrom}, ${c.validTo}, ${c.paymentTerms ?? null}, ${c.penaltyTerms ?? null})
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

export async function updateContract(id: string, c: ContractInput) {
  const rows = await sql`
    UPDATE contracts SET supplier = ${c.supplier}, material_id = ${c.materialId}, unit_price = ${c.unitPrice},
      min_qty = ${c.minQty}, max_qty = ${c.maxQty}, lead_time_days = ${c.leadTimeDays},
      valid_from = ${c.validFrom}, valid_to = ${c.validTo},
      payment_terms = ${c.paymentTerms ?? null}, penalty_terms = ${c.penaltyTerms ?? null}
    WHERE id = ${id} RETURNING id
  `;
  if (rows.length === 0) throw new Error("unknown contract");
}

export async function terminateContract(id: string) {
  const rows = await sql`UPDATE contracts SET status = 'terminated' WHERE id = ${id} AND status = 'active' RETURNING id`;
  if (rows.length === 0) throw new Error("contract is not active or unknown");
}

export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function saveContractFile(id: string, fileName: string, fileType: string, data: Buffer) {
  if (data.byteLength === 0) throw new Error("file is empty");
  if (data.byteLength > MAX_FILE_BYTES) throw new Error("file must be 4 MB or smaller");
  const rows = await sql`
    UPDATE contracts SET file_name = ${fileName.slice(0, 200)}, file_type = ${fileType || "application/octet-stream"},
      file_data = ${data}
    WHERE id = ${id} RETURNING id
  `;
  if (rows.length === 0) throw new Error("unknown contract");
}

export async function getContractFile(id: string) {
  const rows = (await sql`SELECT file_name, file_type, file_data FROM contracts WHERE id = ${id}`) as {
    file_name: string | null;
    file_type: string | null;
    file_data: Buffer | Uint8Array | string | null;
  }[];
  if (rows.length === 0 || !rows[0].file_data) throw new Error("unknown contract file");
  const raw = rows[0].file_data;
  const buf =
    typeof raw === "string"
      ? Buffer.from(raw.startsWith("\\x") ? raw.slice(2) : raw, raw.startsWith("\\x") ? "hex" : "binary")
      : Buffer.from(raw);
  return { name: rows[0].file_name ?? "contract", type: rows[0].file_type ?? "application/octet-stream", data: buf };
}
