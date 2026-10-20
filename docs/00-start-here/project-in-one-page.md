# Project in one page

## Clean problem statement

Build a decentralized Manufacturing Resource Planning II system in which independent agents negotiate for inventory, supplier deliveries, and production capacity. The application must generate a feasible production plan, react to disruptions, and show why each decision was made.

## The idea in one sentence

Instead of one master scheduler deciding everything, each order asks independent resource agents for offers, accepts the best valid combination, and negotiates again when a commitment fails.

## A simple example

Two orders need the same plywood and CNC machine:

1. Each order calculates the materials and operations it requires.
2. The inventory agent offers the stock it can reserve.
3. Supplier agents offer the missing material at different prices and delivery dates.
4. Work-centre agents offer available production slots.
5. Each order rejects impossible offers and scores the remaining offers using visible rules.
6. The winning offers become commitments.
7. If a machine breaks down, only the affected unfinished work is negotiated again.

The dashboard shows the proposals, accepted plan, rejected alternatives, cost, completion time, and the revised plan after the disruption.

## Why this is MRP II

Basic MRP answers what material is needed, how much is needed, and when it is needed. MRP II also considers production resources such as machines, people, capacity, supplier constraints, schedules, costs, and feedback from actual events.

This project implements an MRP II-lite subset:

- Multi-level bill-of-material explosion.
- Inventory netting and reservation.
- Supplier selection for shortages.
- Finite work-centre capacity.
- Operation order and timing.
- Cost and due-date trade-offs.
- Negotiation and commitment.
- Failure-driven replanning.
- A complete decision trace.

## What decentralized means here

Decentralized means the decisions are distributed, not that every piece of infrastructure disappears.

- Each agent owns its availability, constraints, offers, and commitments.
- Agents cannot edit another agent's private state.
- Agents coordinate through versioned messages.
- The XMPP server routes messages but does not choose a plan.
- The database stores data and history but does not secretly act as the scheduler.
- The dashboard observes and sends commands but does not make manufacturing decisions.

Blockchain, cryptocurrency, and distributed consensus are not required.

## Main deliverable

A locally runnable web application that can:

- Load a fixed manufacturing scenario.
- Start at least two competing orders.
- Produce a valid material and capacity plan through agent negotiation.
- Display the negotiation and resulting schedule.
- Inject a supplier delay or machine failure.
- Replan affected unfinished work.
- Continue planning when the local LLM is unavailable.

## Technology direction

The provisional baseline is a single TypeScript stack:

- Next.js and TypeScript for the web interface.
- TypeScript agent services for the distributed multi-agent runtime, communicating over the Agent2Agent (A2A) protocol instead of a Python/XMPP agent framework.
- The Vercel AI SDK with Gemini as the primary LLM provider; Ollama with local Llama remains an optional offline alternative.
- Neon (cloud-hosted, serverless Postgres) for storage.
- Deterministic domain code for all quantities and commitments — the LLM never performs this calculation, regardless of which agent runtime or LLM provider is in use.

This replaces an earlier SPADE/Python/XMPP/local-PostgreSQL baseline (see the decision log for the superseded record). The final framework choice is frozen only after a short working spike proves messaging, timeouts, logging, and UI updates.

The primary database and LLM are cloud services reached over the internet. This is not a fully local/offline system.

