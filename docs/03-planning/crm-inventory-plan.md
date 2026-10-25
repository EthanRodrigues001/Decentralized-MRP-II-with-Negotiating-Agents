# CRM-style Inventory, Orders, Contracts and Event-driven Purchasing: Build Plan

Status: PLAN, awaiting approval. Nothing below is built yet.
App: `apps/dashboard` (Next.js 16, Neon Postgres, Vercel AI SDK + Gemini, `@xyflow/react`).

## 0. Decisions already made

| Topic | Decision |
|---|---|
| Order model | Both: customer orders drive production through a BOM, and a manual purchase request is also possible |
| Auto-buy rule | If the **shortfall** is at or below the threshold (default 200, editable in Settings), the purchasing agent buys with no approval. A larger shortfall goes through the existing negotiation and human approval |
| Contracts | Structured terms plus optional PDF attachment. Terms are enforced deterministically. The LLM never decides |
| Delivery | Phased, with a stop for review after each phase |
| LLM boundary | Unchanged: the LLM may narrate and draft, it never decides quantities, prices, suppliers or approvals |

## 1. Shape of the system

CRM > ERP > MRP II. The dashboard becomes a small ERP-style app with these modules:

```
Orders  ->  Production (BOM)  ->  Inventory  <-  Purchasing  <-  Contracts / Suppliers
                 \________ event bus (DB-backed) ________/
                                   |
                       Agents (subscribe to events)
                                   |
                  Console (chat + agent-run sidebar) and Flow view
```

### Event engine (own build, no external queue)
- Table `events(id, type, entity_type, entity_id, payload, status, created_at, processed_at, attempts, dedupe_key)`.
- Domain code writes a row in the same transaction as its state change (outbox pattern). A processor (`lib/events/processor.ts`) claims rows with `FOR UPDATE SKIP LOCKED` and dispatches to handlers.
- Trigger: the processor is invoked right after a request that emitted events, and also by a poll endpoint (`/api/events/tick`) the UI calls on an interval. This works on serverless without a worker. A cron can be added later.
- Event types: `order.created`, `order.confirmed`, `order.cancelled`, `stock.reserved`, `stock.shortage`, `stock.low`, `purchase.auto_approved`, `purchase.needs_approval`, `purchase.placed`, `delivery.received`, `production.started`, `production.completed`, `contract.expiring`.

## 2. Data model (new Neon tables, migration script `scripts/migrate.mjs`)

- `materials(id, sku, name, unit, reorder_point null, preferred_supplier null)`
- `inventory_balances(material_id, on_hand, reserved, on_order)`. Available = on_hand - reserved. Projected = available + on_order.
- `stock_movements(id, material_id, delta, kind, ref_type, ref_id, created_at)`. This is an **append-only ledger**. Balances are always derivable from it. Kinds: `receipt`, `reserve`, `release`, `consume`, `adjust`.
- `products(id, sku, name)` and `bom_lines(product_id, material_id, qty_per_unit, scrap_pct)`
- `customer_orders(id, customer, product_id, qty, due_date, priority, status, created_at)`. Status: `new, awaiting_stock, ready, in_production, completed, cancelled`.
- `order_allocations(order_id, material_id, qty_reserved, qty_short)`
- `purchase_orders(id, supplier, material_id, qty, unit_price, contract_id, source, status, expected_at, negotiation_id null)`. Source: `auto | negotiated | manual`.
- `suppliers(name, active, ...)` extended from the existing supplier list
- `contracts(id, supplier, material_id null, unit_price, price_min, price_max, min_qty, max_qty, lead_time_days, valid_from, valid_to, payment_terms, penalty_terms, file_url null, status)`
- `settings(key, value jsonb)`. Keys: `auto_buy_threshold` (200), `reservation_policy` (`priority | fifo`), `auto_buy_enabled`, `max_auto_spend`.
- Existing: `negotiations`, `negotiation_messages`, `procurement_orders`, model usage. They stay, and a negotiation gets an optional `purchase_order_id`.
- Agent runs for the UI: `agent_runs(id, agent, trigger_event_id, status, started_at, finished_at)` and `agent_steps(run_id, seq, kind[thinking|tool|result|message], name, input, output, created_at)`. The same agent loop writes its own steps, so **no separate "logger agent"** is needed.

## 3. Agent flow (deterministic core, LLM narration only)

1. `order.created` -> **Planning handler** explodes the BOM (qty x qty_per_unit x (1+scrap)), then tries to **reserve** stock inside one transaction. It never reserves partially across two orders without a lock on the material row.
2. Fully covered -> `stock.reserved`, order `ready`.
3. Shortfall -> `stock.shortage {material, shortfall}`. The **Purchasing agent**:
   - finds contracts valid today for that material (expired or out-of-quantity contracts are excluded)
   - **shortfall <= threshold** -> pick the best contract by the existing score formula, place a PO, emit `purchase.auto_approved` and `purchase.placed`, and add to `on_order`
   - **shortfall > threshold** -> run the existing negotiation across contracted suppliers, emit `purchase.needs_approval`, and wait for the human
4. `delivery.received` -> ledger `receipt`, release `awaiting_stock` orders in priority order, and re-run reservation.
5. `production.completed` -> ledger `consume` for reserved stock.

Auto-buy applies only to the shortfall, never to the whole order, and is capped by `max_auto_spend`.

## 4. Edge cases (real-system failure modes) and how each is handled

| Edge case | Handling |
|---|---|
| Two orders race for the last stock | Row lock on `inventory_balances` inside the reservation transaction. Loser sees a shortage |
| Same event processed twice (retry) | `dedupe_key` unique index plus idempotent handlers |
| Two orders short on the same material both trigger auto-buy | Count `on_order` as supply before computing the shortfall, and take a lock per material. Otherwise we double-buy |
| Many tiny auto-buys (each under 200) bypass approval | `max_auto_spend` and a rolling per-day cap. Over the cap -> needs approval |
| Backlog: new order arrives while older ones are waiting | Reservation order follows the policy (priority then due date, or FIFO). New orders can't jump the queue unless priority is higher |
| Order cancelled or edited after reservation | `release` ledger entries. If a PO is already placed, it stays and increases free stock |
| Delivery partial, late or defective | Receipt records the accepted qty. The remainder stays `on_order` or is closed. Orders stay `awaiting_stock` |
| Supplier has no valid contract | No auto-buy. Escalate to a human with the reason shown |
| Contract expired mid-negotiation | Re-check validity at commit time, not only at bid time |
| Bid price outside contract band, or qty outside min/max | Deterministically rejected and logged as a refusal with the clause cited |
| Inventory goes negative | Prevented by a DB CHECK plus transactional guard. Corrections only via an `adjust` movement with a reason |
| Counted stock differs from system stock | Cycle-count `adjust` flow with audit trail |
| Auto-buy while the Gemini API is down | Purchasing core has no LLM dependency. Only narration degrades |
| Threshold changed while an event is queued | Handler reads the setting at processing time and records the threshold used on the PO |
| Event processor crashes mid-run | Claim has a timeout, rows return to pending, `attempts` is capped, then dead-letter shown in UI |
| Long-running stream timeouts on serverless | Runs are persisted step by step. UI reads from DB and survives refresh |

## 5. UI/UX

Style: the supplied references are dark, dense, Linear-like, with monospace numerals, thin borders, small status chips and a sparkline-heavy metrics page. I will build the style tokens into `globals.css` and use the existing shadcn/base-ui primitives.

Pages (sidebar):
- **Console** (home): a main chat showing everything the agents do, with thinking and tool steps rendered inline in collapsible blocks. A **collapsible right sidebar** lists past agent runs. Each run expands into a dropdown with the tools used and its reasoning, read from `agent_steps`. There is no separate agent for this.
- **Flow**: React Flow canvas that shows **2 or more parallel orders at once**, as swimlanes (one lane per order) sharing common material and supplier nodes. Edge animation shows reservation, shortage and purchase paths. A lane filter and a focus mode are included.
- **Inventory**: materials table (on hand, reserved, on order, projected), movement ledger, low-stock chips, adjust dialog.
- **Orders**: backlog list with status and allocation detail, plus a new-order dialog.
- **Purchasing**: POs, pending approvals, auto-bought items.
- **Contracts**: supplier contract CRUD with the validity timeline and PDF attachment.
- **Settings**: auto-buy threshold, max auto spend, reservation policy, model choice (existing).
- **Data**: existing tables view, extended with the new tables.

Refined flow blocks: one node design for order, material, supplier, agent and approval with title, status chip, one key metric and a footer line. Consistent handles, status colours, the active node highlighted, collapsed detail in the node and full detail in a side panel on click.

Charts: a small custom chart set (sparkline, bar, line, stacked bar) in `components/charts/`, themed with CSS variables. I'll check whether Evil Charts fits before deciding. Custom is the default because it avoids another dependency.

File storage for contract PDFs: Neon object storage if it is available on this project, otherwise a `bytea` column with a size limit. Needs a quick check when Phase 2 starts.

## 6. Phases (stop and review after each)

**Phase 1: Foundation.** Migration script, `settings`, `materials`, `inventory_balances` + ledger, event table and processor, Inventory page, Settings page, seed data for materials/BOM. Auto-purchase engine for a manual "shortfall" trigger using existing suppliers. Unit tests for the ledger, reservation and threshold rule.

**Phase 2: Orders, contracts, parallel flows.** Customer orders and the BOM allocation, backlog handling, contracts CRUD and enforcement, PO lifecycle, deliveries, the multi-order flow view.

**Phase 3: Console and polish.** New chat console, agent-run sidebar, charts, theme pass, refined flow blocks, dead-letter and expiry notices.

## 7. Things I will check or flag when I build

- Next.js 16 conventions in `node_modules/next/dist/docs/` before writing routes (per `AGENTS.md`).
- Whether the Neon `DATABASE_URL` in `.env` is a dev branch. I will not run migrations on a database you use for anything else without telling you first. A Neon branch for development is a good idea.
- Update `context/WORK_LOG.md`, `DECISION_LOG.md` and the docs after each phase (repo maintenance rule).
