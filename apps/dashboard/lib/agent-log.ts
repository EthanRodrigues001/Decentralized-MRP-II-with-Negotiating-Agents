import { sql } from "@/lib/db";

// Agents write their own run + steps here as they work. The console and the
// right-hand "agents already ran" sidebar read these rows; there is no separate
// logging agent.

export type StepKind = "thinking" | "tool" | "result" | "message";

export async function startRun(
  agent: string,
  title: string,
  triggerEventId?: string,
  threadId?: string | null
): Promise<string> {
  const rows = await sql`
    INSERT INTO agent_runs (agent, title, trigger_event_id, thread_id)
    VALUES (${agent}, ${title}, ${triggerEventId ?? null}, ${threadId ?? null})
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

export async function addStep(
  runId: string,
  kind: StepKind,
  name: string | null,
  input?: unknown,
  output?: unknown
) {
  await sql`
    INSERT INTO agent_steps (run_id, seq, kind, name, input, output)
    VALUES (
      ${runId},
      (SELECT coalesce(max(seq), 0) + 1 FROM agent_steps WHERE run_id = ${runId}),
      ${kind}, ${name},
      ${input === undefined ? null : JSON.stringify(input)}::jsonb,
      ${output === undefined ? null : JSON.stringify(output)}::jsonb
    )
  `;
}

export async function finishRun(runId: string, status: "done" | "failed") {
  await sql`UPDATE agent_runs SET status = ${status}, finished_at = now() WHERE id = ${runId}`;
}
