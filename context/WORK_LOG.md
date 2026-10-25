# Work log

## 2026-07-18 — Initial project planning

### Request recorded

- Break down the problem statement “Decentralized MRPII with negotiating agents” simply.
- Consider Mesa, SPADE, or PADE with Llama and identify better options if appropriate.
- Keep the project implementation-focused rather than research-focused.
- Use the existing JavaScript, Next.js, and Node.js background where practical.
- Create organized Markdown folders plus a durable context file and logs.
- Make the explanation easy to relay to the project team and coordinator.
- Do not mention audience capability assumptions outside the logs.
- Perform current internet-backed planning now; deeper research will be requested later.

### Workspace inspection

- The Git repository contained no project files or commits.
- The repository was indexed in the codebase knowledge graph.
- The index contained only the project node, confirming a greenfield workspace.

### Internet review

- Reviewed current official material for MRP II, FIPA Contract Net, SPADE, SPADE-LLM, Mesa, PADE, LangGraph.js, XState, NATS, Ollama, and Meta Llama.
- SPADE 4.1.4 was current and marked stable at the time of review.
- SPADE-LLM 0.3.0 was current and marked beta at the time of review.
- Mesa was confirmed as primarily an agent-based simulation framework.
- PADE had a modernized 3.0 codebase while its main public documentation still contained older setup information.
- A TypeScript stack using NATS and XState was retained as the strongest custom fallback.

### Planning decisions

- Recommended SPADE plus Next.js as the provisional baseline.
- Defined a simplified FIPA Contract Net negotiation.
- Defined logical decentralization through agent state and decision ownership.
- Restricted Llama to validated assistance and explanation.
- Selected a furniture factory as the provisional demonstration.
- Produced a 10–12 week phased roadmap and measurable acceptance criteria.

### Files created

- Root README.
- Documentation map.
- Plain-language project summary and glossary.
- Requirements, scope, and demonstration plan.
- Agent, protocol, architecture, and repository design.
- Technology decision, roadmap, testing plan, and risk register.
- Official source list.
- Project context, decision log, and work log.


## 2026-10-24 — CRM-style inventory and event-driven purchasing, Phase 1

Plan: `docs/03-planning/crm-inventory-plan.md`. Built in `apps/dashboard`:

- `scripts/migrate.mjs` (idempotent, additive) added `settings`, `materials`, `inventory_balances`, `stock_movements` (append-only ledger), `events`, `purchase_orders`, `agent_runs`, `agent_steps` to the existing Neon database, with 6 seeded raw materials. Existing tables untouched.
- DB-backed event queue (`lib/events.ts`, `lib/event-processor.ts`): SKIP LOCKED claims, dedupe key, 3 attempts then dead-letter. Processor is poll-driven (`POST /api/events/tick`), no worker needed.
- Deterministic purchasing agent (`lib/purchasing.ts`, `lib/auto-buy.ts`): shortfall at or below the threshold (default 200, editable in Settings) is bought automatically from the best-scored supplier; larger shortfalls wait for approval. Stock already on order counts as supply, and a per-day auto-spend cap forces approval. Writes its own steps to `agent_runs`/`agent_steps`.
- UI: Inventory page (stock, purchasing, ledger), Settings page, extra Data tabs.
- Verified: 8 unit tests pass (`node --test lib/auto-buy.test.ts`), typecheck clean, and a live API run showed 150 requested vs 95 on hand gave an auto PO for 55, a second request only bought the 45 not already on order, 440 foam needed approval, double approve/receive were rejected, and ledger sums matched balances. Test rows were then cleared.

Next: Phase 2 (customer orders + BOM, contracts, parallel flows).

### 2026-10-24 — Inventory UI refinement

- Inventory page rebuilt with small-size shadcn components (added `ui/dialog`): summary stats, status badges (OK/Low/Out) with a stock bar and reorder tick, material filter, and an Adjust dialog replacing `window.prompt`.
- New `components/info-tip.tsx`: hover/focus "i" icon on every stock column and stat explaining on hand, reserved, available, on order, projected, reorder point, status and the ledger.

### 2026-10-24 — Local LaTeX report scaffold

Asked whether the Overleaf project could be edited directly. It cannot: there is
no Overleaf connector, and Overleaf's Git and Dropbox sync are both premium
features tied to the *project owner's* subscription (confirmed against Overleaf's
own docs). Community Overleaf MCP servers exist but are either wrappers around
the same paid Git bridge or hold a live Overleaf session cookie; none were
adopted. See D-012.

Built `report/` as a local-first LaTeX project instead:

- `main.tex` is a thin master; `metadata.tex` holds every college-specific
  field; `preamble.tex` holds packages and formatting. One file per chapter
  under `sections/`, front matter under `frontmatter/`, so a chapter can be
  replaced wholesale when merging Overleaf content.
- Eight body chapters and full front matter (title page, certificate,
  declaration, acknowledgement, abstract, TOC, LOF, LOT, abbreviations),
  skeletoned from the existing planning docs. Abstract and the constraints,
  scope, and agent-role sections carry real content; the rest are `\todo`
  placeholders that render in red.
- `references.bib` seeded with 16 entries from `docs/04-reference/sources.md`
  plus Smith's 1980 Contract Net paper. Peer-reviewed agent-manufacturing
  papers are still missing — the literature review cannot be written until
  the shortlist is read.
- `build.ps1` wraps latexmk, writes to `build/` (git-ignored), and counts
  remaining placeholders. LaTeX aux files added to `.gitignore`.
- Verified: builds clean on the installed MiKTeX — 30 pages, zero errors, zero
  warnings, zero overfull boxes, bibliography and cross-references resolving.
  59 placeholders remain.

Fixed during the build: BibTeX parses an "at" sign as an entry start even
inside a comment, which broke the bibliography; the title page overflowed onto
a second page until `\vfill` replaced fixed spacing; long reference URLs ran
into the margin until `xurl` was added.

Not done: nothing has been reconciled with the existing Overleaf project yet.

Next: merge the Overleaf content chapter by chapter, and fill `metadata.tex`.

## 2026-10-24 — Phase 2: orders, BOM, contracts, parallel flow

- Migration extended (additive): `products`, `bom_lines`, `customer_orders`, `order_allocations`, `contracts` (with optional document stored in the row, 4 MB cap), `materials.std_cost`, `purchase_orders.contract_id`. Seed: 3 furniture products with BOMs and 14 supplier contracts (one expired, one expiring, one with a small max quantity to exercise edge cases).
- Order engine (`lib/orders.ts`): `order.created` explodes the BOM, posts it to the chat, reserves free stock without taking units that better-ranked waiting orders are queued for (priority, then due date, then arrival), and raises one shortage per material using total unmet demand. `delivery.received`, `stock.released` and `stock.adjusted` hand freed stock to waiting orders in rank order. Start, complete (consumes reserved stock) and cancel (releases it) are single guarded statements.
- Purchasing now buys only under a contract that is active, in date and covers the quantity; price and lead time come from the contract, and validity is re-checked in the statement that commits the purchase. Excluded contracts are cited with the reason.
- UI: Orders page (new-order dialog with live BOM preview), Contracts page (CRUD, terminate, attach document), Flow page (parallel orders as colour-coded lanes over shared materials and open purchases, click to focus), and order threads in the Console. A message naming a product ("25 bookshelves due in 12 days") becomes a customer order. Chat cards: order, commercial indented BOM (level, part no., qty/unit, UoM, scrap, gross qty, unit and extended cost, lead time, stock status, totals), allocation, purchase (with Approve), status.
- Layout fix: wide chat cards no longer push the page sideways (`min-w-0` through the shell).
- Tests: 17 unit tests (auto-buy rule, BOM maths, contract rules). Live run of three overlapping orders verified reservation, shortage-to-purchase, delivery, and re-allocation; a chat order showed an expired contract excluded and an over-threshold purchase held for approval. Test data was cleared afterwards.

Next: Phase 3 (new chat console with collapsible agent-run sidebar, charts, theme pass, refined flow blocks in the negotiation view).

## 2026-10-24 — Phase 3: chat sidebar, recurring orders, thinking, agent runs

- Chat list redesigned like the T3 thread list: status per chat (Working, Waiting for stock, Needs approval, Ready, Done, Cancelled), finished chats get a Settle button on hover, "Settle all", and a collapsible Settled (n) section with undo. `negotiations.settled_at` added; only finished chats can be settled. The nine earlier raw-material test chats were settled once (migration marker `legacy_threads_settled`) so the list starts clean; they remain under Settled.
- Recurring orders (`recurring_orders`, `lib/recurring.ts`): "10 tables for Acme every 2 weeks" in the chat, or a repeat field on the Orders page. The first order is raised immediately; the scheduler (the same poll that runs events) raises later ones. Each template is claimed by one statement that moves next_run past today, so ticks cannot double-raise and a long gap raises one order, not a pile; a failed raise restores the claim. One-off orders keep working alongside. Orders page has a Recurring tab (pause, resume, delete).
- Thinking is back and richer: agents log thinking, tool calls and results per run, linked to the chat (`agent_runs.thread_id`). Each run shows in the chat as a collapsed block just before that agent's message, and a collapsible right panel lists every run with a dropdown to its steps.
- Agent graph restored for order chats (planning, inventory, purchasing, production chain), now behind a compact strip that opens on demand; agents spin up live because orders stream through `/api/orders/stream` one event at a time.
- Custom Stock position chart (no chart library) on the Inventory Overview tab.
- Parsing (`lib/intake-parse.ts`, tested): repeat interval and customer name come from fixed rules, not the LLM.
- Incident: a Python edit truncated `negotiation-console.tsx` (cp1252 write error). Rebuilt from git plus replayed edits; all edits now use UTF-8.
- Tests: 20 unit tests pass; typecheck clean. Live: recurring scheduler verified (rewound 40 days: one order, no duplicate on second tick, next date aligned), settle guard, streaming order. Test data cleared.

Not done: visual theme restyle toward the reference screenshots.

### 2026-10-24 — Agent run log fix, order button labels

- The inventory agent showed in the graph but had no run in "Agents already ran" because the reservation work was logged under the planning agent. Allocation is now its own InventoryAgent run (also for re-allocation after a delivery, release or adjustment), and the production agent logs a run for start, finish and cancel. Chats created before this fix keep their old single planning run.
- Orders page: "Start" is now "Start production" and "Complete" is "Finish production", with hover text and an Actions info icon.

## 2026-10-25 - Chats are conversations, material requests, urgent orders
- Typing in a selected chat is now an instruction for that chat (`lib/chat-command.ts`, `lib/chat-handler.ts`, `POST /api/threads/[id]/command`): ok/continue/start production, received, done, cancel, status, "add one more", "make it 15". Text that names a product or material with no instruction, or starts with "new", still creates a new chat. Stray text like "ok" with no chat selected no longer creates a "1000 units of raw materials" chat; it shows a hint.
- Direct raw-material requests ("3 foam padding") are matched to the material (`lib/material-request.ts`, `POST /api/requests`, `negotiations.material_id`). Stock is reserved from the ledger, shortages go to purchasing, "ok" issues (consumes) the stock. Held quantity is read back from stock_movements (ref_type request).
- `amendOrder` releases the order's stock, resets it and re-plans (new BOM, allocation, purchase). Shortage dedupe key now includes the planning event id.
- High-priority orders ("urgent", "asap", "rush") start production automatically once fully reserved.
- Purchases: "ok" approves what the chat is waiting on, "received" books the delivery into stock and re-allocates; the purchase card also has a "Mark delivery received" button and reads its live status.
- Legacy supplier-negotiation path is no longer reachable from the composer.

## 2026-10-25 - Dashboard, daily production limit, currency
- `/dashboard/overview` (new nav item "Dashboard"): revenue, gross profit and margin, open-pipeline profit, purchasing spend, saved vs other vendors, missed by vendor choice, profit per day, today's production vs the daily limit, vendors, better-vendor table, profit by product, inventory value, contracts and agent stats. Data from `lib/analytics.ts` via `GET /api/analytics`.
- Profit basis: revenue = qty x `products.sale_price` (first fill: BOM cost x 1.4, editable in the DB only for now), cost = BOM at standard cost, both on completed orders.
- Settings: `daily_order_limit` (default 5) - `runDailySchedule` in orders.ts starts ready orders in rank order up to the limit (urgent ones always start); runs when an order becomes ready and on every tick. `customer_orders.started_at` counts starts per day.
- Currency: USD or INR with an editable rate (default 83). Money is stored in USD; `lib/currency.ts` + `CurrencyProvider` format everything (BOM, purchase cards, contracts table, inventory purchases, dashboard).
- Purchasing: a contract up to its max overrides the "bigger than anything the supplier shipped" bid refusal.
