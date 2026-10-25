import { sql } from "@/lib/db";

// DB-backed event queue. A processor claims rows with SKIP LOCKED so two
// processors never run the same event; a dedupe key makes emitting idempotent.

export interface DomainEvent {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export const MAX_ATTEMPTS = 3;
const CLAIM_TIMEOUT_SECONDS = 60;

export async function emitEvent(
  type: string,
  entityType: string | null,
  entityId: string | null,
  payload: Record<string, unknown>,
  dedupeKey?: string
): Promise<string | null> {
  const rows = await sql`
    INSERT INTO events (type, entity_type, entity_id, payload, dedupe_key)
    VALUES (${type}, ${entityType}, ${entityId}, ${JSON.stringify(payload)}::jsonb, ${dedupeKey ?? null})
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `;
  return rows.length ? (rows[0] as { id: string }).id : null;
}

export async function claimEvents(limit = 10): Promise<DomainEvent[]> {
  const rows = (await sql`
    UPDATE events SET status = 'processing', claimed_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM events
      WHERE status = 'pending'
         OR (status = 'processing' AND claimed_at < now() - make_interval(secs => ${CLAIM_TIMEOUT_SECONDS}))
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, entity_type, entity_id, payload, attempts
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    type: r.type as string,
    entityType: (r.entity_type as string) ?? null,
    entityId: (r.entity_id as string) ?? null,
    payload: (r.payload as Record<string, unknown>) ?? {},
    attempts: Number(r.attempts),
  }));
}

export async function markDone(id: string) {
  await sql`UPDATE events SET status = 'done', processed_at = now() WHERE id = ${id}`;
}

// Back to pending until attempts run out, then dead-lettered for the UI.
export async function markFailed(id: string, attempts: number, error: string) {
  const status = attempts >= MAX_ATTEMPTS ? "dead" : "pending";
  await sql`UPDATE events SET status = ${status}, last_error = ${error.slice(0, 500)} WHERE id = ${id}`;
}

export async function listEvents(limit = 50) {
  return sql`
    SELECT id, type, entity_type, entity_id, payload, status, attempts, last_error, created_at, processed_at
    FROM events ORDER BY created_at DESC LIMIT ${limit}
  `;
}

export async function peekPendingType(): Promise<string | null> {
  const rows = (await sql`SELECT type FROM events WHERE status = 'pending' ORDER BY created_at LIMIT 1`) as { type: string }[];
  return rows[0]?.type ?? null;
}

/** Events another processor is handling right now (their results may still add messages). */
export async function processingCount(): Promise<number> {
  const rows = (await sql`SELECT count(*)::int AS n FROM events WHERE status = 'processing'`) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}
