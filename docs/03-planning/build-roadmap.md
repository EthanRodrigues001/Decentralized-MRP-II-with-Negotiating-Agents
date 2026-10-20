# Build roadmap

The safest order is domain correctness first, distributed negotiation second, UI third, and LLM assistance last.

## Phase 0 — Freeze the demonstration

Target: Week 1

Build:

- Furniture scenario v1.
- Exact product BOMs and routings.
- Initial stock, supplier data, calendars, costs, and due dates.
- One machine-failure event and one supplier-delay event.
- Hand-calculated expected material requirements and at least one valid schedule.
- Version 1 message schemas.

Exit check:

- Every expected quantity and time in the fixture can be explained without running the application.
- Scope exclusions are accepted.

## Phase 1 — Framework and UI bridge spike

Target: Week 2, maximum two working days for the core proof

Build:

- Three minimal TypeScript agents, each with its own A2A Agent Card.
- One Contract Net conversation carried over A2A messages/tasks.
- Reply timeout.
- Message audit output, written to Neon.
- Minimal Next.js status page.
- AI SDK Gemini adapter plus NoLlmProvider.

Exit check:

- The nine checks in the technology decision pass.
- The framework decision is frozen and logged.

## Phase 2 — Deterministic MRP domain core

Target: Weeks 2–3

Build:

- Product, BOM, routing, order, inventory, supplier, calendar, offer, hold, and commitment models.
- Recursive BOM explosion.
- Inventory netting.
- Slot feasibility and routing precedence.
- Score normalization and ranking.
- Invariant checks.

Exit check:

- Unit tests match the hand-calculated fixture.
- Domain code has no dependency on A2A, the AI SDK, or Ollama.

## Phase 3 — Single-order vertical slice

Target: Weeks 4–5

Build:

- One OrderAgent.
- Inventory negotiation.
- Supplier negotiation for a shortage.
- Work-centre negotiation in routing order.
- Atomic acceptance of holds.
- A complete feasible plan and audit trace.

Exit check:

- One order moves from submitted to committed.
- Every plan line links to accepted proposal messages.

## Phase 4 — Concurrent orders and safe commitments

Target: Week 6

Build:

- Two simultaneous OrderAgent instances.
- Competing stock and machine proposals.
- Hold expiry and release.
- Idempotent message handling.
- Atomic stock and calendar commitments.

Exit check:

- Repeated runs never create negative stock, overlapping slots, or duplicate commitments.

## Phase 5 — Failure and partial replanning

Target: Week 7

Build:

- Machine breakdown.
- Supplier delay or offline supplier.
- FAILURE and CANCEL handling.
- Dependency impact calculation.
- Replacement negotiation.
- Explicit INFEASIBLE outcome.

Exit check:

- Completed and unaffected commitments do not move.
- Affected unfinished work is replaced or clearly marked infeasible.

## Phase 6 — Full dashboard

Target: Weeks 8–9

Build:

- Scenario reset and start.
- Agent status.
- Inventory and reservations.
- Negotiation timeline.
- Proposal comparison.
- Gantt-style schedule.
- KPI cards.
- Disruption controls.
- Original versus revised plan.

Exit check:

- The complete deterministic demonstration can be operated from the browser.

## Phase 7 — LLM assistance

Target: Week 10

Build:

- Read-only explanation from structured audit facts.
- Optional natural-language order draft with explicit confirmation.
- Schema and semantic validation.
- Timeout and deterministic fallback.
- LLM-on, LLM-invalid, LLM-timeout, and LLM-off tests.

Exit check:

- Stopping Ollama does not prevent planning or replanning.
- Explanations do not invent values that are absent from the supplied facts.

## Phase 8 — Hardening and final demonstration

Target: Weeks 11–12

Build:

- Clean Docker Compose or equivalent startup.
- Separate important agent processes.
- Seeded replay.
- End-to-end and failure tests.
- Setup guide and troubleshooting notes.
- Final demonstration script.
- Limitations and future-work notes.

Exit check:

- A clean machine can follow the documented setup.
- The full demonstration succeeds repeatedly.

## Critical path

The critical path is:

Scenario fixture → correct domain core → one negotiated order → concurrent safe commitments → disruption and replanning → dashboard → LLM assistance

Do not begin with:

- UI polish before a working vertical slice.
- LLM prompts before deterministic planning works.
- Advanced auctions or counteroffers.
- Additional products before the fixed fixture is reliable.
- Cloud deployment before local repeatability.

## If the schedule becomes tight

Keep:

- Two products and two orders.
- Inventory, supplier, and work-centre negotiation.
- Holds and commitments.
- One disruption and partial replan.
- Audit trace and basic schedule UI.
- No-LLM fallback.

Cut first:

- Natural-language order creation.
- Multiple disruption types.
- Advanced charts.
- A dedicated multi-container deployment if independent local processes are reliable enough.
- Alternative LLM comparisons.
- Counteroffers and more than one scoring policy.

