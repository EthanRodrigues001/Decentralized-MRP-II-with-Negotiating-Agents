// Which ready orders the production agent starts by itself today.

export interface ReadyOrder {
  id: string;
  priority: number;
}

/**
 * `ready` must already be in rank order (priority, due date, arrival).
 * Urgent orders (priority 2) always start. Others fill the daily limit that
 * is left after what has already been started today.
 */
export function pickOrdersToStart(ready: ReadyOrder[], dailyLimit: number, startedToday: number): string[] {
  let slots = Math.max(0, dailyLimit - startedToday);
  const out: string[] = [];
  for (const o of ready) {
    if (o.priority >= 2) {
      out.push(o.id);
      slots = Math.max(0, slots - 1);
    } else if (slots > 0) {
      out.push(o.id);
      slots--;
    }
  }
  return out;
}
