import { handle } from "@/lib/api";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const runs = await sql`
      SELECT r.id, r.agent, r.title, r.status, r.started_at, r.finished_at,
        coalesce((
          SELECT json_agg(json_build_object('seq', s.seq, 'kind', s.kind, 'name', s.name,
                                            'input', s.input, 'output', s.output) ORDER BY s.seq)
          FROM agent_steps s WHERE s.run_id = r.id), '[]'::json) AS steps
      FROM agent_runs r ORDER BY r.started_at DESC LIMIT 30
    `;
    return { runs };
  });
}
