# Problem breakdown

## The real problem being solved

A production order needs several resources at the correct times:

- Materials from inventory or suppliers.
- Machines or work centres.
- An ordered routing.
- Enough capacity before the due date.
- A cost that stays within the configured policy.

The difficult part is that multiple orders can want the same limited resources. A valid system must avoid negative stock, overlapping machine bookings, and plans that ignore lead times.

This project distributes those choices across negotiating agents. Each resource agent protects its own constraints and each order agent builds a plan from the commitments it can obtain.

## Core input

The first version needs:

- Products.
- A multi-level BOM for each product.
- Routing and operation duration.
- Initial inventory and safety stock.
- Supplier prices, lead times, capacity, and reliability value.
- Work-centre capabilities, calendars, setup time, and cost rate.
- Production orders with quantity, release time, due time, and priority.
- Negotiation weights and reply deadlines.
- Seeded machine-failure and supplier-delay events.

## Core output

For every order, the system should produce:

- Gross and net material requirements.
- Inventory reservations.
- Purchase commitments for shortages.
- A finite-capacity operation schedule.
- Expected completion time.
- Expected material and production cost.
- Accepted and rejected proposals.
- An explicit feasible, late, failed, or infeasible status.
- A trace linking the final plan to every negotiation message.

## End-to-end flow

1. A production order is created.
2. Its order agent expands the BOM.
3. The order agent requests inventory offers.
4. Any shortage starts supplier negotiations.
5. The order agent requests work-centre slots in routing order.
6. Invalid offers are removed.
7. Valid offers are scored with visible deterministic rules.
8. Winners are accepted and their temporary holds become commitments.
9. The complete plan is displayed.
10. A disruption invalidates one or more commitments.
11. Completed and unaffected commitments stay unchanged.
12. Only the affected unfinished requirements are negotiated again.

## Functional requirements

**FR-01 — Scenario loading**  
Load a fixed, versioned scenario without manual database setup.

**FR-02 — BOM calculation**  
Correctly expand at least a two-level BOM for an order quantity.

**FR-03 — Inventory netting**  
Calculate shortages and prevent negative or duplicate reservations.

**FR-04 — Supplier negotiation**  
Request and compare at least two supplier proposals for a shortage.

**FR-05 — Capacity negotiation**  
Request valid slots from alternative work centres and preserve routing order.

**FR-06 — Concurrent orders**  
Allow two orders to negotiate at the same time without double booking.

**FR-07 — Transparent selection**  
Show why one feasible proposal scored better than another.

**FR-08 — Commitments**  
Atomically accept a hold once and release rejected, cancelled, or expired holds.

**FR-09 — Timeouts and idempotency**  
Do not wait forever for offline agents and do not process duplicate messages twice.

**FR-10 — Replanning**  
React to a machine breakdown or supplier delay without restarting the scenario.

**FR-11 — Auditability**  
Record messages, decisions, failures, and plan revisions with correlation identifiers.

**FR-12 — Dashboard**  
Show agent status, inventory, proposals, schedule, KPIs, and before/after plans.

**FR-13 — Optional LLM assistance**  
Explain decisions or parse a draft instruction through validated structured output.

**FR-14 — No-LLM operation**  
Complete every manufacturing function when the model server is stopped.

## Quality requirements

- A fixed scenario and seed must be repeatable when the LLM is disabled.
- Every message must have a schema version and unique message ID.
- Invalid messages must be rejected and logged.
- No plan may violate stock, capacity, routing, or commitment invariants.
- Important agents must be runnable as separate processes or containers.
- A single unavailable supplier must not crash unrelated agents.
- The main demonstration must be runnable from documented commands.

## What this project is not

- It is not a complete ERP product.
- It is not a claim of globally optimal scheduling.
- It is not an LLM chatbot with manufacturing words added to it.
- It is not a blockchain project.
- It is not a factory-control or safety-critical system.
- It is not a new negotiation theory.

