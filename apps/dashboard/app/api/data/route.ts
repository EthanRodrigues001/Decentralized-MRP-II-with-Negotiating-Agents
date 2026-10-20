import { sql } from "@/lib/db";

const TABLE_QUERIES = {
  procurement_orders: () => sql`SELECT * FROM procurement_orders ORDER BY po_id DESC LIMIT 100`,
  negotiations: () => sql`SELECT * FROM negotiations ORDER BY created_at DESC LIMIT 100`,
  negotiation_messages: () =>
    sql`SELECT * FROM negotiation_messages ORDER BY created_at DESC LIMIT 200`,
} as const;

type TableName = keyof typeof TABLE_QUERIES;

function isTableName(v: string): v is TableName {
  return v in TABLE_QUERIES;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table") ?? "procurement_orders";

  if (!isTableName(table)) {
    return Response.json({ error: "unknown table" }, { status: 400 });
  }

  const [rows, counts] = await Promise.all([
    TABLE_QUERIES[table](),
    sql`
      SELECT
        (SELECT count(*)::int FROM procurement_orders) AS procurement_orders,
        (SELECT count(*)::int FROM negotiations) AS negotiations,
        (SELECT count(*)::int FROM negotiation_messages) AS negotiation_messages
    `,
  ]);

  return Response.json({ table, rows, counts: counts[0] });
}
