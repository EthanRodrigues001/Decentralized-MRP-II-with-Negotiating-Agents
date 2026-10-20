# Project context

Last updated: 2026-07-29

This file preserves the stable facts and instructions needed to continue the project without reconstructing the conversation.

## User-provided facts

- This is a major project for Computer Engineering.
- Working problem statement: Decentralized MRPII with negotiating agents.
- Initial framework candidates were Mesa, SPADE, or PADE with Llama, with permission to consider a better alternative.
- The project is implementation-focused and is not intended to be a research project.
- The primary development background is JavaScript, Node.js, and Next.js.
- Explanations and documentation must remain simple and presentation-ready.
- The current request is planning and internet-backed technology orientation, not implementation.
- Deeper research will be requested later.

## Stable project interpretation

Build an MRP II-lite prototype in which independent order, inventory, supplier, and work-centre agents negotiate for materials and capacity. The system must create a feasible plan, keep a full decision trace, and renegotiate affected unfinished work after a disruption.

## Current provisional decisions

- Recommended core (updated 2026-07-29, see D-009): a single TypeScript/Node stack. Every agent (Order, Inventory, Supplier, WorkCenter, Explanation) is a TypeScript service. The Agent2Agent (A2A) protocol replaces XMPP as the agent-to-agent transport. The Vercel AI SDK is used only where an LLM is actually called (draft-order parsing, explanations), through a Gemini provider. SPADE, Python, and XMPP are dropped (see D-002, superseded).
- Negotiation: simplified FIPA Contract Net, carried as the domain payload inside A2A messages/tasks.
- Decision logic: deterministic and testable, in plain TypeScript. This did not change with the stack pivot — the AI SDK never decides or scores a negotiation.
- Local model: Ollama with a small Llama candidate remains an optional offline provider.
- LLM role: structured input assistance and read-only explanations only.
- Storage (updated 2026-07-29, see D-010): Neon (serverless, cloud-hosted Postgres) with explicit state ownership and append-only audit events, replacing a locally hosted PostgreSQL server.
- Scenario: one furniture factory, two products, two orders, competing suppliers and work centres.
- Project boundary: MRP II-lite, not a full ERP.

All technology choices remain provisional until the documented spike succeeds.

## Deployment reality (added 2026-07-29)

The system now depends on outbound internet access for both its database (Neon) and its primary LLM provider (Gemini API). It is not a fully local/offline deployment — only the optional Ollama/Llama path can run without internet, and only for the LLM-assistance features, not for the database. Documentation should describe this accurately rather than imply a fully local system.

## Non-negotiable engineering rules

- No LLM-generated BOM arithmetic, inventory balance, capacity feasibility, or direct state mutation.
- Planning and replanning must work with Ollama stopped.
- No hidden global scheduler in the dashboard, gateway, or database.
- Every accepted proposal must map to exactly one resource commitment.
- Every important message must be versioned, traceable, and idempotent.
- Completed and unaffected commitments remain fixed during partial replanning.
- Do not claim global optimization.
- Do not add blockchain unless the project definition explicitly changes.

## Information still needed

- Submission date and milestone dates.
- Runtime hardware for the optional local model.
- Whether a named framework or strict FIPA compliance is mandatory.
- Required final artifacts and deployment environment.
- Confirmation of the furniture scenario.
- Whether the coordinator/supervisor needs to be told explicitly that the database (Neon) and primary LLM (Gemini) are cloud-hosted rather than local.

## Maintenance rule

After every material instruction or completed work session:

1. Update this file if a stable fact, constraint, or decision changed.
2. Append a dated entry to WORK_LOG.md.
3. Add or supersede a record in DECISION_LOG.md when an architecture choice changes.
4. Do not erase old decisions; mark them superseded and link the replacement.

