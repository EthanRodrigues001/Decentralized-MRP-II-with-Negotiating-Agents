// Deterministic reading of what someone types into an existing chat. A thread is
// a conversation about one order, so "ok", "start production" or "add one more"
// are instructions about that order, not new orders.

export type ChatCommand =
  | { kind: "continue" }
  | { kind: "finish" }
  | { kind: "cancel" }
  | { kind: "receive" }
  | { kind: "status" }
  | { kind: "contracts" }
  | { kind: "amend"; mode: "add" | "set"; qty: number }
  | { kind: "none" };

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, another: 1,
};

function num(s: string | undefined): number | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return WORDS[s.toLowerCase()] ?? null;
}

const N = "(\\d{1,6}|one|two|three|four|five|six|seven|eight|nine|ten|an?)";

export function parseChatCommand(raw: string): ChatCommand {
  const t = raw.toLowerCase().trim().replace(/[.!]+$/, "");

  // Quantity changes come first: "add one more table" must not read as a new order.
  const addMore = t.match(new RegExp(`\\b(?:add|plus|and)\\s+${N}\\s+more\\b`)) ?? t.match(new RegExp(`\\b${N}\\s+more\\b`));
  if (addMore) {
    const qty = num(addMore[1]);
    if (qty) return { kind: "amend", mode: "add", qty };
  }
  if (/\b(add|one|another)\b.*\b(more|another)\b|^another\b/.test(t) && !/\d/.test(t)) return { kind: "amend", mode: "add", qty: 1 };
  const setTo = t.match(new RegExp(`\\b(?:make it|change(?: it| the (?:quantity|qty|order))? to|set(?: it| the (?:quantity|qty))? to|update(?: it)? to|reduce(?: it)? to|increase(?: it)? to|actually|instead)\\s+${N}\\b`));
  if (setTo) {
    const qty = num(setTo[1]);
    if (qty) return { kind: "amend", mode: "set", qty };
  }

  if (/^(cancel|abort)\b|\bcancel (this|the) order\b/.test(t)) return { kind: "cancel" };
  if (/\b(received|delivered|arrived|delivery (is )?(here|in|done)|mark(ed)? (as )?received)\b/.test(t)) return { kind: "receive" };
  if (/\b(finish(ed)?|complete(d)?|done|production (is )?(done|over))\b/.test(t) && !/\bnot\b/.test(t)) return { kind: "finish" };
  if (/^(ok(ay)?|yes|yep|yeah|sure|go|go ahead|proceed|continue|approve|approved|confirm|confirmed|fine|do it|sounds good|lgtm)\b/.test(t)) return { kind: "continue" };
  if (/\b(start|begin|kick ?off|run|execute)\b.*\b(production|order|it|build|making)\b|\bstart\b/.test(t)) return { kind: "continue" };
  if (/\b(contracts?|suppliers?|re-?check|check again|try again|retry|re-?run|buy|purchas(e|ing))\b/.test(t)) return { kind: "contracts" };
  if (/\b(status|where|progress|how('s| is)|what('s| is) (the )?(status|happening))\b/.test(t)) return { kind: "status" };
  return { kind: "none" };
}

/** "urgent", "asap", "high priority", "rush" -> 2, otherwise 0. */
export function parsePriority(text: string): 0 | 2 {
  return /\b(urgent|urgently|asap|rush|high[- ]priority|top priority|priority\s*(order)?\s*:?\s*high|critical)\b/i.test(text) ? 2 : 0;
}
