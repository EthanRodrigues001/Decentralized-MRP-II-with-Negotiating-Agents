import { sql } from "@/lib/db";
import { createOrder, validateOrder } from "@/lib/orders";

export interface RecurringInput {
  customer: string;
  productId: string;
  qty: number;
  dueInDays: number;
  priority: number;
  everyDays: number;
}

export function validateRecurring(input: unknown): RecurringInput {
  const base = validateOrder(input);
  const everyDays = Number((input as Record<string, unknown>).everyDays);
  if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 365) throw new Error("everyDays must be a whole number between 1 and 365");
  return { ...base, everyDays };
}

/** Saves the template and raises the first order straight away; later ones come from the scheduler. */
export async function createRecurring(input: RecurringInput) {
  const rows = (await sql`
    INSERT INTO recurring_orders (customer, product_id, qty, every_days, due_in_days, priority, next_run)
    VALUES (${input.customer}, ${input.productId}, ${input.qty}, ${input.everyDays}, ${input.dueInDays},
            ${input.priority}, current_date + ${input.everyDays}::int)
    RETURNING id
  `) as { id: string }[];
  const recurringId = rows[0].id;
  const order = await createOrder(input, recurringId);
  await sql`UPDATE recurring_orders SET last_order_id = ${order.orderId} WHERE id = ${recurringId}`;
  return { recurringId, ...order };
}

export async function listRecurring() {
  return sql`
    SELECT r.id, r.customer, r.qty, r.every_days, r.due_in_days, r.priority, r.next_run::text AS next_run,
           r.active, r.created_at, p.name AS product,
           (SELECT count(*)::int FROM customer_orders o WHERE o.recurring_id = r.id) AS orders_raised
    FROM recurring_orders r JOIN products p ON p.id = r.product_id
    ORDER BY r.created_at DESC
  `;
}

export async function setRecurringActive(id: string, active: boolean) {
  const rows = await sql`
    UPDATE recurring_orders SET active = ${active},
      next_run = CASE WHEN ${active} AND next_run < current_date THEN current_date + every_days ELSE next_run END
    WHERE id = ${id} RETURNING id
  `;
  if (rows.length === 0) throw new Error("unknown recurring order");
}

export async function deleteRecurring(id: string) {
  const rows = await sql`DELETE FROM recurring_orders WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) throw new Error("unknown recurring order");
}

/**
 * Raises the orders that are due. Each template is claimed by one statement that
 * also moves next_run past today, so two scheduler ticks cannot both raise it,
 * and a long gap produces one order, not a flood. If raising the order fails,
 * the claim is undone so the next tick retries.
 */
export async function runDueRecurring(): Promise<number> {
  const claimed = (await sql`
    WITH old AS (
      SELECT id, next_run FROM recurring_orders WHERE active AND next_run <= current_date FOR UPDATE SKIP LOCKED
    )
    UPDATE recurring_orders r
    SET next_run = r.next_run + r.every_days * (((current_date - r.next_run) / r.every_days) + 1)
    FROM old WHERE r.id = old.id
    RETURNING r.id, r.customer, r.product_id, r.qty, r.due_in_days, r.priority, old.next_run::text AS prev_run
  `) as Record<string, string | number>[];

  let raised = 0;
  for (const c of claimed) {
    try {
      const order = await createOrder(
        validateOrder({ customer: c.customer, productId: c.product_id, qty: c.qty, dueInDays: c.due_in_days, priority: c.priority }),
        String(c.id)
      );
      await sql`UPDATE recurring_orders SET last_order_id = ${order.orderId} WHERE id = ${String(c.id)}`;
      raised++;
    } catch {
      await sql`UPDATE recurring_orders SET next_run = ${String(c.prev_run)}::date WHERE id = ${String(c.id)}`;
    }
  }
  return raised;
}
