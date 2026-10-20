# Decision log

## D-001 — Use an MRP II-lite boundary

- Date: 2026-07-18
- Status: provisional
- Decision: Implement materials, inventory, supplier procurement, finite capacity, scheduling, cost/due-date trade-offs, feedback, and replanning. Exclude full ERP functions.
- Reason: This is the smallest scope that still demonstrates MRP II instead of only material planning.
- Revisit when: A mandatory feature list is supplied.

## D-002 — Prefer SPADE with a Next.js dashboard

- Date: 2026-07-18
- Status: superseded by D-009 (2026-07-29)
- Decision: Use SPADE for independent negotiating agents and Next.js/TypeScript for the interface.
- Reason: SPADE is current, distributed through XMPP, supports behaviors and FIPA-style metadata, and has an Ollama-capable extension.
- Alternative: Node.js, NATS JetStream, and XState if the hybrid integration fails or Python is rejected.
- Revisit when: The two-day framework spike is complete.

## D-003 — Use simplified FIPA Contract Net negotiation

- Date: 2026-07-18
- Status: provisional
- Decision: Use CFP, PROPOSE or REFUSE, ACCEPT_PROPOSAL or REJECT_PROPOSAL, then INFORM_RESULT or FAILURE.
- Reason: It is simple, standard, explainable, and directly matches resource bidding.
- Revisit when: Counteroffers or another negotiation method become a required feature.

## D-004 — Keep operational decisions deterministic

- Date: 2026-07-18
- Status: accepted baseline
- Decision: BOM, netting, feasibility, proposal values, scoring, holds, and commitments are code-controlled.
- Reason: These decisions must be correct, repeatable, testable, and safe when the model is unavailable.

## D-005 — Limit the LLM to assistance

- Date: 2026-07-18
- Status: accepted baseline
- Decision: Use Ollama and Llama for validated draft input and grounded explanations. Provide NoLlmProvider fallback.
- Reason: This creates visible LLM value without making manufacturing correctness probabilistic.
- Revisit when: The deterministic vertical slice and LLM contract tests are complete.

## D-006 — Define decentralization by state and decision ownership

- Date: 2026-07-18
- Status: accepted baseline
- Decision: Agents own private resource state and communicate only through messages. Shared transport and storage are infrastructure, not planners.
- Reason: This is a practical and demonstrable form of decentralized decision-making without unnecessary blockchain or consensus.

## D-007 — Use one fixed furniture demonstration

- Date: 2026-07-18
- Status: provisional
- Decision: Use Study Desk and Bookshelf orders competing for plywood, supplier delivery, and CNC time.
- Reason: The scenario is easy to understand, contains shared materials and capacity, and supports a visible disruption.
- Revisit when: The manufacturing domain is confirmed.

## D-009 — Replace SPADE/Python/XMPP with a TypeScript AI SDK + A2A stack

- Date: 2026-07-29
- Status: provisional, awaiting spike
- Supersedes: D-002. The FIPA Contract Net negotiation semantics from D-003 are unchanged; only the transport and runtime change.
- Decision: Drop the Python/SPADE agent engine and XMPP transport. Implement every agent (Order, Inventory, Supplier, WorkCenter, Explanation) as a TypeScript/Node service. Use the Agent2Agent (A2A) protocol (JSON-RPC over HTTP, Agent Cards for discovery, task/message lifecycle) as the agent-to-agent transport in place of XMPP. Use the Vercel AI SDK only for the pieces of the system that call an LLM (structured draft-order parsing and the ExplanationAgent), through its Gemini provider.
- Reason: A single-language stack removes the Python/TypeScript contract-drift risk noted in the risk register, removes the SPADE-LLM beta-extension dependency, and matches the team's existing Next.js/TypeScript background. A2A is a maintained, multi-vendor, Linux Foundation-governed protocol (v1.0 in 2026, 150+ supporting organizations) rather than a single-project research framework.
- Conditions:
  - The non-negotiable rule from PROJECT_CONTEXT.md is unchanged: BOM explosion, inventory netting, capacity feasibility, and proposal scoring remain plain deterministic TypeScript code. The AI SDK is never used to make or score a negotiation decision, only to parse draft input or explain an already-decided outcome.
  - The Contract Net performatives (CFP, PROPOSE, REFUSE, ACCEPT_PROPOSAL, REJECT_PROPOSAL, INFORM_RESULT, FAILURE, CANCEL) are carried as the domain payload inside A2A messages/tasks; A2A supplies the envelope and delivery mechanics, not the negotiation rules.
- Revisit when: A short spike proves A2A message delivery, task lifecycle, and timeout/reject handling work end-to-end between at least three independently running TypeScript agents (see the updated Phase 1 spike in build-roadmap.md).

## D-010 — Use Neon (serverless Postgres) instead of a local PostgreSQL server

- Date: 2026-07-29
- Status: provisional
- Decision: Use Neon as the operational and audit/read-model database instead of a locally hosted PostgreSQL instance.
- Reason: Removes local database setup and matches the rest of the stack pivot toward managed, cloud-hosted services reachable from a TypeScript codebase without a Docker Compose Postgres container.
- Conditions:
  - This makes the application dependent on outbound internet access for its database, not only for the LLM. The earlier working assumption "local execution is more important than cloud deployment" (risks-and-open-questions.md) no longer holds and has been updated.
  - Only synthetic, non-confidential scenario data may be stored in Neon, consistent with the existing rule for the unpaid Gemini tier.
  - State ownership rules from D-006 are enforced through schema/table boundaries and application code, exactly as they would be on a local server; moving to a hosted database does not relax those rules.
- Revisit when: Neon's free-tier limits (compute hours, storage, branches) are checked against actual demo load before the final demonstration.

