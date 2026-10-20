# Learning & Planning Notes

This is a personal running notebook — separate from `docs/` (formal, presentation-ready) and `drive/` (what gets shown to sir/Kavita ma'am). It's where concepts get explained as they come up and where in-progress planning/decisions for the agent system live before (or instead of) becoming formal docs. Gets appended to over time, not rewritten from scratch each time.

---

## Concepts

### MRP vs MRP II

**MRP (Material Requirements Planning)** answers: what material is needed, how much, and when. Two mechanics do all the work:

- **BOM explosion** — a Bill of Materials is a recipe. A Study Desk needs 1 desktop panel + 4 legs + hardware + varnish; each leg itself needs plywood + bolts. "Exploding" the BOM means walking down every level to get the full raw-material list for however many units you're making.
- **Inventory netting** — subtract what you already have. Need 24 sheets of plywood, already hold 10 → net requirement is 14.

MRP alone doesn't know if machines are free, if suppliers can actually deliver, or what anything costs.

**MRP II (Manufacturing Resource Planning)** takes that material plan and grounds it in reality:

- **Capacity** — do work-centres actually have free time for cutting/drilling/finishing/assembly?
- **Routing** — the fixed order operations must happen in (can't finish before it's cut).
- **Suppliers** — who do you buy shortages from, at what price, what lead time?
- **Cost vs due-date trade-offs** — cheaper-but-slower vs faster-but-pricier.
- **Feedback / replanning** — a broken machine or late supplier forces a recalculation of the affected part of the plan, not the whole thing.

**MRP = the math of what's needed. MRP II = that math plus "can we actually do it, with what, from whom, at what cost, and what happens when something breaks."**

### Where this project's twist sits

Normal MRP II has one central planner deciding everything. This project decentralizes that: inventory, each supplier, each work-centre is its own independent agent that only knows its own state (own stock, own calendar, own prices) and negotiates with whoever's asking, via a structured protocol (Contract Net: CFP → PROPOSE/REFUSE → ACCEPT/REJECT → INFORM_RESULT/FAILURE). No agent can see or touch another agent's private state — that's what makes it decentralized rather than just MRP II with extra steps.

Full glossary of terms (BOM, routing, work centre, CFP, performative, etc.) already lives in [`docs/00-start-here/glossary.md`](../docs/00-start-here/glossary.md) — not duplicating it here, just cross-referencing.

### BOM explosion mechanics

A BOM isn't a flat list, it's a tree. Each node is a parent-component relationship with a **quantity-per** (how many of the component one unit of the parent needs). Example (illustrative numbers only — not yet frozen in a scenario file):

```
Study Desk (top level, "level 0")
├─ Desktop Panel  x1     (level 1)
│    └─ Plywood Sheet x2 (level 2)
├─ Leg Assembly   x4     (level 1)
│    ├─ Plywood Sheet x1 (level 2)
│    └─ Bolt           x2 (level 2)
├─ Hardware Kit   x1     (level 1, purchased leaf — doesn't explode further)
└─ Varnish        x0.5L  (level 1, purchased leaf)
```

**Step 1 — explode top-down, multiplying through levels.** If the order is for 2 Study Desks:
- Desktop Panel needed = 2 orders × 1 = **2**
- Leg Assembly needed = 2 orders × 4 = **8**
- Plywood from Desktop Panel branch = 2 × 2 = **4**
- Plywood from Leg Assembly branch = 8 × 1 = **8**
- Bolt from Leg Assembly branch = 8 × 2 = **16**

Each level's requirement depends on the *already-computed* requirement of its parent — that's why it's recursive, not a single flat multiplication.

**Step 2 — aggregate before netting.** Plywood Sheet appears twice under Study Desk (via Desktop Panel *and* via Leg Assembly) — real BOMs often reuse the same low-level part under several parents, and it can *also* appear under a completely different product (Bookshelf's side/shelf/back panels in this scenario). The mechanic that makes this safe is the **low-level code**: every item gets tagged with the *deepest* level it ever appears at anywhere in the whole product structure, and explosion processes level 0, then level 1, then level 2, etc., summing every parent's contribution into one running gross-requirement total per item *before* moving on. This guarantees Plywood Sheet's gross requirement is the full sum across every branch and every order (e.g. 4 + 8 from Study Desk, plus whatever Bookshelf needs) — never netted or acted on prematurely from just one branch.

**Step 3 — netting.** Gross requirement minus on-hand stock (minus safety stock) = net requirement. If Plywood Sheet's combined gross requirement across both orders comes to 24 sheets, and 10 are on hand (2 held back as safety stock, so 8 usable), the net requirement is 24 − 8 = **16 sheets** — and *that* 16 is the number that turns into a CFP to the supplier agents. Desktop Panel, Leg Assembly, Side Panel etc. are subassemblies made fresh each time (no stock carried), so for those, net requirement = gross requirement directly.

So: BOM explosion is "multiply down through the tree, level by level, summing every place a shared part is used" and netting is "subtract what you already have" — the output of netting (the shortages) is what the negotiation protocol below actually negotiates for.

### The negotiation protocol, message by message

This is the simplified FIPA Contract Net flow from `docs/02-design/agents-and-negotiation.md`, walked through concretely for "need 16 sheets of Plywood, due in 5 days" with the two-SupplierAgent plan from this notebook.

1. **CFP (Call For Proposals)** — sent by the Gateway (standing in for the human, since there's no autonomous OrderAgent) to every SupplierAgent capable of supplying Plywood Sheet. Contains: `conversationId` (new, unique to this negotiation), item = Plywood Sheet, quantity = 16, need-by date, a reply deadline (e.g. "respond within 30s"), and the schema version.

2. **PROPOSE or REFUSE** — each SupplierAgent independently decides, using only its own held data:
   - If it can help: it places a **temporary hold** on its own capacity/stock first (so it can't double-promise the same units to a different concurrent negotiation), then sends **PROPOSE** with quantity, price, delivery date, a reliability figure (e.g. derived from its historical defect rate), a hold token, and an expiry time for the offer.
   - If it can't (no stock, can't meet the deadline): it sends **REFUSE** with a machine-readable reason.
   
   Neither supplier can see the other's offer — this is the decentralization: each one only knows its own historical batch and current holds.

3. **Validate** — incoming proposals get thrown out (before anyone even scores them) if they arrived after the deadline, are already expired, don't actually meet the required quantity, or break a hard constraint like the due date. This step exists so a badly-behaved or slow agent can't corrupt the outcome.

4. **Score** — every proposal that survives validation gets a transparent numeric score (lower is better):
   `score = 0.45 × normalized cost + 0.35 × normalized tardiness + 0.15 × normalized lead time + 0.05 × normalized risk`
   This is plain deterministic code — never the LLM.

5. **REQUEST_APPROVAL (the human-in-the-loop addition to the standard protocol)** — instead of auto-accepting the best score, the Gateway sends the ranked, scored proposals to the human/dashboard, along with each SupplierAgent's plain-language narration of why it bid what it bid. Nothing gets committed yet.

6. **APPROVE or REJECT** — the human responds, as a real message, picking a winner (or rejecting all and asking for a fresh CFP).

7. **ACCEPT_PROPOSAL / REJECT_PROPOSAL** — the Gateway relays the human's decision: the winning SupplierAgent gets **ACCEPT_PROPOSAL** referencing its hold token; every other bidder gets **REJECT_PROPOSAL**, and their holds are released immediately so that capacity is free for the next negotiation.

8. **Commit** — the winning SupplierAgent converts its hold into a permanent commitment. This has to be an atomic compare-and-set (check the hold is still valid, then flip it to committed in one step) so that if the ACCEPT message ever arrives twice (network retry), it doesn't create two commitments — it just returns the same result again.

9. **INFORM_RESULT or FAILURE** — later, when the delivery actually happens (or doesn't), the supplier reports success (INFORM_RESULT) or a broken commitment with a reason (FAILURE). A FAILURE is what triggers replanning: mark the failed piece, keep everything else untouched, open a *new* conversationId (but the same correlationId, linking it back to the original requirement) and start a fresh CFP for just the affected shortfall.

**Every message**, regardless of which step, carries the same envelope fields: `messageId` (so duplicates are safe to ignore), `conversationId` (groups this one negotiation), `correlationId` (links a replan back to the original request), `causationId` (which message caused this one), `sender`/`receiver`, `performative` (CFP/PROPOSE/REFUSE/ACCEPT_PROPOSAL/REJECT_PROPOSAL/INFORM_RESULT/FAILURE/CANCEL — the seven-ish standard ones, plus REQUEST_APPROVAL/APPROVE/REJECT for the human step), `timestamp`, `replyBy`/`expiresAt`, `schemaVersion`, and the actual domain `payload`. A2A's own protocol supplies the HTTP/JSON-RPC transport and Agent Card discovery underneath — these fields are the *domain payload* carried inside an A2A message/task, not a replacement for A2A itself.

---

## Current plan — negotiating agents (v1 scope)

Status as of 2026-09-29. This section changes as decisions change; older superseded lines get struck through rather than deleted, same rule as `context/DECISION_LOG.md`.

- **No autonomous OrderAgent for now.** Ordering/acceptance requires a human in the loop. Instead of an OrderAgent silently deciding a winner, the protocol gets an explicit approval step:

  `CFP → PROPOSE (from each resource agent) → REQUEST_APPROVAL (to the human/Gateway) → APPROVE or REJECT (human, sent as a real message) → ACCEPT_PROPOSAL / REJECT_PROPOSAL`

  The human/dashboard plays the existing "Gateway/Observer" role from `docs/02-design/agents-and-negotiation.md` — issues commands, never itself computes or picks a winning proposal.
  - Open question: does the approval gate sit only at final accept-a-winner, or does every individual bid need approval before it's even shown? Leaning toward: gate sits wherever an agent's action would lock a resource (commit a hold) — read-only/explanatory agents don't need it.

- **Only 2 agents to start.** Current leaning: two instances of the *same* `SupplierAgent` code, each bound to a different real supplier identity from the Procurement KPI Analysis Dataset (e.g. two distinct `Supplier` values from the CSV), each only allowed to read/hold its own batch of seeded rows. This is the "spin up a copy of the agent for another batch" requirement in its simplest form, and it demonstrates negotiation (two suppliers competing) without needing an OrderAgent to exist yet.

- **Real dataset instead of hand-made fixture numbers.** Procurement KPI Analysis Dataset (Kaggle, `shahriarkabir/procurement-kpi-analysis-dataset`, CC0) gets seeded into Neon once. Each SupplierAgent computes its own bid (price, lead time, a reliability/defect-rate figure) from its own historical slice — real numbers, not invented ones. This replaces the earlier synthetic "BudgetTimber/RapidTimber" furniture-fixture numbers from `docs/01-requirements/scope-and-demo.md` for the supplier side specifically; the deterministic-core rule (no LLM arithmetic) is unchanged.

  Verified schema (pulled directly from Kaggle's data explorer on 2026-09-29 — the dataset's own "About" text says 700 rows, but every column's valid+missing count actually sums to **777**, so 777 is the real row count):

  | Column | Type | Meaning | Notable stats |
  |---|---|---|---|
  | `PO_ID` | text | Unique purchase order ID | 777 unique, 0 missing |
  | `Supplier` | text | Anonymized supplier name | 5 suppliers: Alpha_Inc, Beta_Supplies, Gamma_Co, Delta_Logistics, Epsilon_Group |
  | `Order_Date` | date | Order placed date | Jan 2022 – Jan 2024, 0 missing |
  | `Delivery_Date` | date | Delivery date | 11% missing (87 rows) — missing for pending/cancelled orders |
  | `Item_Category` | text | Item type | 5 categories: Office Supplies, MRO, Raw Materials, Electronics, Packaging |
  | `Order_Status` | text | Order outcome | Delivered (72%), Pending (10%), Cancelled, Partially Delivered |
  | `Quantity` | number | Units ordered | min 51, max 5000, median ~1075 |
  | `Unit_Price` | number | Original price/unit | min 10.8, max 109, mean 58.3 |
  | `Negotiated_Price` | number | Final price post-negotiation | min 9.27, max 107, mean 53.7 (always ≤ Unit_Price — the cost-savings KPI) |
  | `Defective_Units` | number | Defects found post-delivery | 18% missing (136 rows, unresolved cases), max 321, mean 74.8 |
  | `Compliance` | boolean | Followed procurement policy | True 82% (640), False 18% (137) |

  Mapping to the SupplierAgent design: `Supplier` is the identity to split by (5 possible instances available, not just 2). `Unit_Price` vs `Negotiated_Price` → real negotiation behavior. `Delivery_Date − Order_Date` → real lead time. `Defective_Units / Quantity` → real defect-rate reliability figure. `Compliance` → a free extra reliability signal. The missing values in `Delivery_Date`/`Defective_Units` are real signal (pending/cancelled/unresolved), not data-quality noise to drop — the reliability calculation should account for them rather than silently discard them.

- **Visible "thinking," not just message payloads.** Each SupplierAgent narrates *why* it bid what it bid ("based on my 42 past orders, average lead time for this item category is 6 days, defect rate 2%, so I'm offering X at Y"). This narration is read-only commentary on a number the deterministic code already computed — same non-negotiable LLM boundary as before (LLM never picks the price or decides the winner), just applied live per-agent instead of only after the fact.

- **Dashboard visualization: React Flow.** Two SupplierAgent nodes (each labeled with its held batch — supplier name + row count), a "You / Gateway" node for the human, animated edges for CFP out / PROPOSE back / REQUEST_APPROVAL / APPROVE-REJECT. Sits alongside a chat panel that streams the plain-language narration above.

- **Finance stays excluded.** Already the case per `docs/01-requirements/scope-and-demo.md` (general ledger, invoicing, payroll excluded) and per sir's earlier comment that finance requires external negotiation negotiating agents can't perform. Cost in the negotiation stays a plain comparison number pulled from `Unit_Price`/`Negotiated_Price`, not a modeled financial subsystem.

- **Dashboard scaffold exists.** `apps/dashboard/` — Next.js 16.3.7 + shadcn/ui already initialized by the user (components.json present, `cn()` helper in `lib/utils.ts`, one component — `button` — added). Note: this Next.js version is a pre-release build with breaking changes from the stable Next.js docs/training data typically assume; its own `AGENTS.md` flags this.

- **End product: kept the furniture scenario (decided 2026-09-30).** Considered dropping the Study Desk/Bookshelf end-product idea entirely in favor of a generic "just negotiate over a purchasing category" demo, since the Procurement KPI dataset has no end-product or BOM concept of its own — it only has a flat `Item_Category` field (Office Supplies, MRO, Raw Materials, Electronics, Packaging), no specific item names or SKUs. Decided to keep the furniture end-product instead: `Item_Category = "Raw Materials"` rows are the real-world stand-in for the shared material (the plywood-equivalent) feeding into the BOM; Electronics/Packaging/Office Supplies/MRO categories stay out of scope for the negotiation demo since they don't feed a manufactured end product.
  - Why: keeps this an actual MRP II demo (materials requirements planning needs an end product to plan materials *for*) instead of drifting into generic vendor-selection, and stays continuous with everything already presented to sir/Kavita ma'am (BOM explosion, the negotiation story, Day 1 and Meeting 2 framing) rather than reopening scope from scratch.
  - How to apply: when presenting, state plainly that "Raw Materials" purchase orders are being used as the real-world stand-in for the shared material — not claim the dataset was built for furniture. This is a normal, defensible move with public datasets, not a stretch.

## Built (2026-09-30): working dashboard + chat + seeded DB

`apps/dashboard` is now a real running Next.js app, not just a scaffold. What exists:

- **Neon database** (existing project "mojor project", id `floral-recipe-36721487` — same one `eve-agent-practice` already used, reused rather than creating a new project): `procurement_orders` seeded with all 777 real rows from the Kaggle CSV (copied into `data/procurement-kpi-analysis-dataset.csv`), plus `negotiations` and `negotiation_messages` tables that durably store every message of every run — a real audit trail, not in-memory state.
- **The two SupplierAgent identities are fixed as `Delta_Logistics` (38 Raw Materials orders) and `Gamma_Co` (33 Raw Materials orders)** — the two richest histories among the 5 suppliers, chosen for statistically meaningful computed bids. This resolves the "which two suppliers" open item below. The other 3 (Alpha_Inc, Beta_Supplies, Epsilon_Group) are not wired up yet but the code only needs `AGENT_SUPPLIERS` in `lib/types.ts` extended to add them later.
- **Deterministic bidding** (`lib/bidding.ts`): each SupplierAgent's price/lead-time/reliability is computed from its own seeded Raw Materials rows only (`lib/supplier-stats.ts` enforces the read-only-your-own-batch boundary via the SQL `WHERE supplier = ...`). REFUSE fires if a supplier has no history, or if the requested quantity is more than 3x anything it's ever fulfilled. Scoring uses the exact weighted formula from `docs/02-design/agents-and-negotiation.md` (45% cost / 35% tardiness / 15% lead time / 5% risk).
- **Narration** (`lib/narrate.ts`): Gemini (`gemini-3.1-flash-lite` via the AI SDK) explains each PROPOSE and the final ACCEPT_PROPOSAL in plain language, grounded only in the numbers `lib/bidding.ts` already computed — it never invents or changes a number. An 8-second timeout falls back to a deterministic template sentence built from the same facts, so narration still works with Gemini down (verified live: the decision narration actually hit this fallback path during testing and it read fine).
- **The human-approval message is real**, not just a UI gate: CFP → PROPOSE/REFUSE → REQUEST_APPROVAL (shown to you with every proposal ranked) → APPROVE/REJECT (your click, sent as an actual message) → ACCEPT_PROPOSAL/REJECT_PROPOSAL. All of it persisted to `negotiation_messages` with the full envelope shape (performative, sender, receiver, payload, narration).
- **Dashboard UI** (`app/page.tsx` → `components/negotiation-console.tsx`): a React Flow graph (`components/agent-flow.tsx`, using `@xyflow/react` — swapped in for the unmaintained `reactflow` package for React 19 compatibility) showing "You" and both SupplierAgent nodes labeled with their held batch size, highlighting the recommended/winning/losing supplier; a simple quantity + due-in-days form; and a chat-style transcript (`components/message-bubble.tsx`) rendering every message with its narration.
- **Verified end-to-end live**: ran a real negotiation (1500 units, due in 10 days) through the browser — both suppliers proposed with correct real numbers, Gamma_Co scored lower (0.45 vs 0.55) and was recommended, approving it produced the ACCEPT_PROPOSAL/REJECT_PROPOSAL pair, and the full 7-message transcript persisted in Neon (confirmed by querying it directly).
- Not yet built: this all runs as plain server-side functions inside one Next.js app, not as separate A2A processes/Agent Cards — that's still the Phase 1 spike from `docs/03-planning/build-roadmap.md`, deliberately deferred so the negotiation logic and real data could be proven first. If sir asks, that's the honest framing: same protocol shape, simpler transport, for now.
- Dev server: `npm --prefix apps/dashboard run dev`, or `.claude/launch.json` has a "dashboard" preview config.

## Rebuilt (2026-09-30): all 5 real suppliers, ExplanationAgent, streaming console, data sidebar

Following feedback that the first pass only had one agent type and felt too static, the console was rebuilt around live streaming instead of one-shot fetches:

- **All 5 real suppliers now bid, not a fixed 2.** `lib/suppliers.ts` queries `DISTINCT supplier` from the seeded Raw Materials rows at request time, so Alpha_Inc/Beta_Supplies/Delta_Logistics/Epsilon_Group/Gamma_Co each get their own agent instance per negotiation — genuinely "spinning up an agent per task" rather than two hardcoded identities.
- **A second agent type: ExplanationAgent.** After all suppliers have proposed, it streams a comparative read of the scored proposals ("Epsilon Group offers the lowest score, the most reliable service..."), grounded only in the same numbers already computed — same read-only, never-decides boundary as the per-supplier narration. It's a distinct node in the graph and a distinct sender in the chat, not just more SupplierAgent output.
- **Real streaming, not batch responses.** `app/api/negotiate/stream/route.ts` returns newline-delimited JSON events (`agent_spawn`, `agent_status`, `message`, `narration_delta`, `narration_done`, `done`) over a plain `ReadableStream`; `lib/stream-client.ts` reads it on the client. Gemini narration streams token-by-token into the chat bubble (`lib/narrate.ts` now uses `streamText`, still falling back to a deterministic sentence if Gemini is slow/down — verified live again during this rebuild, Epsilon_Group's proposal narration hit the fallback mid-run and it read fine).
- **React Flow now shows real run state**: each agent node has a status dot (idle/spawning/running/done), the winning agent gets a green ring and green edge, losers dim, and the graph auto-fits via `useReactFlow().fitView()` on both node-count changes and a `ResizeObserver` on the container — confirmed all 5 supplier nodes plus Gateway/You/ExplanationAgent fit the view automatically after a run.
- **Data sidebar** (`components/data-sidebar.tsx`, shadcn `Sidebar` + `Tabs` + `Table`): a right-side panel with three tabs — Orders (777 seeded rows), Negotiations, Messages — each a live query against Neon (`app/api/data/route.ts`), with row counts in the tab labels. Confirmed live: after a run, "Negotiations (3)" and "Messages (43)" reflected the real accumulated rows.
- Old files removed as superseded: `lib/negotiation.ts`, the non-streaming `app/api/negotiate/route.ts` and `[id]/decide/route.ts` — everything now goes through the one streaming endpoint.
- Checked for a dedicated shadcn skill (there isn't one enabled) — used the shadcn CLI directly instead (`table`, `tabs`, `sidebar`, `sheet`, `skeleton`, `tooltip` added this round).
- Still true from before: deterministic bidding/scoring never touches the LLM, human approval is a real message not just a UI gate, Raw Materials only, finance excluded.

## Rebuilt again (2026-09-30): chat-driven tasks, routing split, real shadcn chat primitives

Feedback was that the quantity/due-date form didn't feel chat-native, and that everything lived on one page. Changed:

- **Routing split**: `/dashboard` is now the console; `/dashboard/data` is a dedicated full-page data view; `/` just redirects to `/dashboard`. A left nav `Sidebar` (`components/nav-sidebar.tsx`) with two links (Console, Data) replaces the earlier right-side drawer.
- **No more quantity/due-date form.** A single chat composer (`components/task-composer.tsx`, shadcn `InputGroup`) is how you start work now: type something like "need about 2000 units within 2 weeks" and `lib/intake.ts` — a Gemini `generateObject` call constrained to a zod schema — parses it into `{quantity, dueInDays, summary}`. This is the one place the LLM is allowed to turn plain language into a structured object per the project's own LLM boundary rules; it never decides anything. Verified live: "need about 2000 units within 2 weeks" parsed to `quantity=2000, dueInDays=14` correctly.
- **Multiple independent tasks, not one global negotiation.** Each submitted message spins up its own negotiation (all 5 SupplierAgents + ExplanationAgent, fresh) — genuinely decentralized per task, not a single page-wide state machine. A `Tasks` list (`components/task-list.tsx`) shows every past and current task with its status; clicking an old one re-fetches its full transcript (`/api/negotiate/[id]/messages`) and reconstructs the agent graph from the stored messages (read-only, since it already finished) rather than re-running anything.
- **A real shadcn chat interface**, not hand-rolled divs. Added and used `message-scroller`, `message`, `bubble`, `marker` from the shadcn registry (`components/chat-thread.tsx`) — `MessageScrollerProvider`/`MessageScroller` owns scroll-follow and anchoring, `Message`/`MessageAvatar`/`MessageContent` lay out each row, `Bubble`/`BubbleContent` is the colored surface, `Marker` renders the REJECT_PROPOSAL "hold released" notices as dividers instead of chat bubbles. This replaces the earlier hand-rolled `message-bubble.tsx`.
- **Found and used the project's own shadcn skill.** `npx skills add shadcn/ui` had installed a real skill under `apps/dashboard/.claude/skills/shadcn` (project-scoped, picked up automatically by file path) — it's what specified the correct chat primitives above instead of guessing, and the styling rules (`gap-*` not `space-y-*`, `size-*` not `w-* h-*`, Badge/Skeleton/Empty over custom markup, `render` not `asChild` since this project uses the `base` primitive library not `radix`).
- Old superseded files removed: `components/data-sidebar.tsx`, `components/message-bubble.tsx`, the old single-task `app/page.tsx` content.
- Verified live end-to-end again after the rebuild: typed a natural-language request → correct parse → all 5 suppliers bid with real streamed narration → approved Epsilon Group → task list updated to "committed, Won by Epsilon Group" → reselecting it from the list correctly restored the full transcript and graph from Neon.
- Not yet built: multi-turn conversation *within* an existing task (e.g. "actually make it 2000 units instead" on an already-running task) — the composer always starts a new task for now; interacting with an existing awaiting-approval task only happens through its Approve/Reject buttons.

## Fixes and additions (2026-09-30, later same day)

- **Fixed: React Flow nodes flickering out during generation.** Root cause: `flowAgents` was recomputed as a brand-new array on every render of the console, including on every single `narration_delta` token (many per second while an agent "speaks") — even though narration only ever touches `messages`, never the agent map. That fed `@xyflow/react` a fresh node-list reference many times a second, and the leftmost nodes (You, Gateway) would visually clip out of `fitView`'s frame mid-churn, snapping back on a full reload (which rebuilds cleanly once). Fixed by memoizing `flowAgents` on `[active?.agents, active?.agentOrder]` specifically (both stay referentially stable across narration-only updates) and wrapping `AgentFlow` in `React.memo`. Verified: repeatedly checked mid-stream during a live run, You/Gateway stayed present throughout.
- **Simplified the approval cards.** The raw normalized `score` (e.g. "0.1667") was meaningless without explaining the weighting formula, so it's gone from the UI entirely — proposals now just show `$total · lead-time · reliability%`, with the top-ranked one tagged "Best overall" (`components/chat-thread.tsx`). The score still exists internally for sorting (`lib/bidding.ts` unchanged), it's just not surfaced as a bare number anymore.
- **Dark mode.** `next-themes` + a toggle button (sun/moon) in the dashboard header, defaulting to system preference, class-based (matches the existing `.dark` selector already in `globals.css`). Verified live — clean full-UI switch.
- **Model toggle.** A `Select` next to the composer lets you pick which Gemini model powers narration/intake parsing, threaded through `lib/narrate.ts` and `lib/intake.ts` down to every API route. The model list (`lib/models.ts`) was verified against the official `ai.google.dev/gemini-api/docs/models` pages, not guessed — current options: Gemini 3.1 Flash-Lite (default), 3.5 Flash-Lite, 3.6 Flash, 3.8 Flash, all sharing the same 1,048,576-token context window in this generation (the toggle is really a speed/cost/quality choice, not a context-size one). Verified live: switched to Gemini 3.6 Flash, ran a full negotiation, selection persisted and was used.

## Usage tracking added (2026-09-30)

Asked for "limits left per model." Checked Google's official rate-limits docs first rather than guess — they explicitly say per-account quota depends on your usage tier and is only visible by logging into Google AI Studio yourself (no API exposes it). So instead of fabricating a "72% used" bar, built what's honestly knowable: our own app's real call count per model, per day (`model_usage` table in Neon, incremented in `lib/narrate.ts` and `lib/intake.ts` on every real Gemini call — success or fallback — via `lib/model-usage.ts`). The model dropdown now shows "`N calls today`" per model (and a fallback count if any occurred), plus a direct link to `aistudio.google.com/rate-limit` for the real ceiling. Verified live: ran a negotiation on Flash-Lite, dropdown correctly updated from "no calls today" to "7 calls today" while the other three models stayed at zero.

One known rough edge: "today" is Postgres's `CURRENT_DATE`, which is UTC — since the user is in IST (UTC+5:30), the count resets about 5.5 hours before local midnight rather than exactly at it. Not fixed; noted here in case it causes confusion later.

## Not yet decided

- Exact granularity of the human-approval gate (see open question above) — current build gates only the final accept/commit step, matching the "leaning" from before.
- Whether the A2A protocol spike (Phase 1 in `docs/03-planning/build-roadmap.md`) happens before or alongside expanding this further, since the roadmap's original order was fixture → domain core → framework spike → vertical slice, and this plan skipped straight to a negotiating vertical slice using real data and an in-process simulation of two agents.
