import { sql } from "@/lib/db";
import { ITEM_CATEGORY } from "@/lib/types";
import type { NegotiationMessage, Performative, RequestApprovalPayload } from "@/lib/types";

export function mapMessageRow(row: Record<string, unknown>): NegotiationMessage {
  return {
    id: row.id as string,
    negotiationId: row.negotiation_id as string,
    seq: row.seq as number,
    performative: row.performative as Performative,
    sender: row.sender as string,
    receiver: row.receiver as string,
    payload: row.payload,
    narration: (row.narration as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function createNegotiation(quantity: number, dueInDays: number): Promise<string> {
  const rows = await sql`
    INSERT INTO negotiations (item_category, quantity, due_in_days, status)
    VALUES (${ITEM_CATEGORY}, ${quantity}, ${dueInDays}, 'awaiting_approval')
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

async function nextSeq(negotiationId: string): Promise<number> {
  const rows = await sql`
    SELECT coalesce(max(seq), 0) + 1 AS n FROM negotiation_messages WHERE negotiation_id = ${negotiationId}
  `;
  return Number((rows[0] as { n: number }).n);
}

export async function addMessage(
  negotiationId: string,
  performative: Performative,
  sender: string,
  receiver: string,
  payload: unknown,
  narration: string | null
): Promise<NegotiationMessage> {
  const seq = await nextSeq(negotiationId);
  const rows = await sql`
    INSERT INTO negotiation_messages (negotiation_id, seq, performative, sender, receiver, payload, narration)
    VALUES (${negotiationId}, ${seq}, ${performative}, ${sender}, ${receiver}, ${JSON.stringify(payload)}, ${narration})
    RETURNING *
  `;
  return mapMessageRow(rows[0] as Record<string, unknown>);
}

export async function setMessageNarration(messageId: string, narration: string) {
  await sql`UPDATE negotiation_messages SET narration = ${narration} WHERE id = ${messageId}`;
}

export async function setNegotiationStatus(
  negotiationId: string,
  status: string,
  winningSupplier?: string
) {
  if (winningSupplier) {
    await sql`UPDATE negotiations SET status = ${status}, winning_supplier = ${winningSupplier} WHERE id = ${negotiationId}`;
  } else {
    await sql`UPDATE negotiations SET status = ${status} WHERE id = ${negotiationId}`;
  }
}

export async function getLatestApproval(
  negotiationId: string
): Promise<RequestApprovalPayload | null> {
  const rows = await sql`
    SELECT payload FROM negotiation_messages
    WHERE negotiation_id = ${negotiationId} AND performative = 'REQUEST_APPROVAL'
    ORDER BY seq DESC LIMIT 1
  `;
  if (rows.length === 0) return null;
  return (rows[0] as { payload: RequestApprovalPayload }).payload;
}

export async function getNegotiationMessages(negotiationId: string) {
  const rows = await sql`
    SELECT * FROM negotiation_messages WHERE negotiation_id = ${negotiationId} ORDER BY seq ASC
  `;
  return rows.map((r) => mapMessageRow(r as Record<string, unknown>));
}
