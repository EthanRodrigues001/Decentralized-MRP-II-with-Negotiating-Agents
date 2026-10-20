import { sql } from "@/lib/db";

export async function GET() {
  const rows = await sql`
    SELECT id, item_category, quantity, due_in_days, status, winning_supplier, created_at
    FROM negotiations
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return Response.json({ tasks: rows });
}
