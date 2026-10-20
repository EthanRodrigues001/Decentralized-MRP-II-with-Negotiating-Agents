# Decentralized MRP II with Negotiating Agents

Status: planning baseline v0.2  
Last updated: 2026-07-29

This project will be a working manufacturing-planning prototype in which independent software agents negotiate for materials, supplier deliveries, and production capacity.

The recommended baseline is:

- Next.js and TypeScript for the dashboard.
- TypeScript agent services for every negotiating agent (no separate Python runtime).
- The Agent2Agent (A2A) protocol for agent-to-agent messages.
- Neon (serverless, cloud-hosted Postgres) for reference data, owned state, and the audit/read model.
- The Vercel AI SDK with Gemini as the primary provider for constrained input assistance and explanations; Ollama with a small Llama model remains an optional offline fallback.
- Deterministic code for BOM calculations, inventory, scheduling, proposal scoring, and commitments.

The database and primary LLM are cloud services. This is not a fully local/offline system — only the optional Ollama path runs without internet, and only for LLM assistance, not for the database.

The first demonstration will use two furniture orders competing for limited plywood and machine time. A machine failure or supplier delay will force the affected order to negotiate a replacement plan.

## Start here

1. [Project in one page](docs/00-start-here/project-in-one-page.md)
2. [Problem breakdown](docs/01-requirements/problem-breakdown.md)
3. [Scope and demonstration](docs/01-requirements/scope-and-demo.md)
4. [Agents and negotiation](docs/02-design/agents-and-negotiation.md)
5. [System architecture](docs/02-design/system-architecture.md)
6. [Technology decision](docs/03-planning/technology-decision.md)
7. [Build roadmap](docs/03-planning/build-roadmap.md)
8. [Testing and success criteria](docs/03-planning/testing-and-success.md)

Project context and history are kept under [context](context/PROJECT_CONTEXT.md).

## Current state

Only the planning and documentation baseline exists. No application code has been selected, generated, or implemented yet. The stack changed on 2026-07-29 from Python/SPADE/XMPP/local PostgreSQL to a single TypeScript stack using the AI SDK, the A2A protocol, and Neon (see [context/DECISION_LOG.md](context/DECISION_LOG.md) D-009 and D-010). Framework versions and integration assumptions must still be proven by the short spike described in the roadmap before the main build begins.

