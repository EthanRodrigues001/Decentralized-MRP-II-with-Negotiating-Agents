# System architecture

## Component view

| Component | Technology direction | Responsibility |
|---|---|---|
| Dashboard | Next.js and TypeScript | Scenario controls, live status, negotiation timeline, inventory, schedule, KPIs, and explanations |
| API bridge | Small HTTP plus SSE/WebSocket service, TypeScript | Converts UI commands into agent messages and projects status back to the UI |
| Agent engine | TypeScript/Node services, one per agent role | Runs Order, Inventory, Supplier, WorkCenter, and optional Explanation agents |
| Message transport | Agent2Agent (A2A) protocol (JSON-RPC over HTTP, Agent Cards for discovery) | Routes messages and task lifecycles between independent agent identities |
| Operational storage | Neon (serverless, cloud-hosted Postgres) | Reference data plus state owned by each agent domain |
| Audit/read model | Neon append-only events and projections | Supports trace, replay, dashboard queries, and explanation grounding |
| LLM provider | Vercel AI SDK with Gemini as primary provider | Runs draft-order parsing and the ExplanationAgent's grounded explanations |
| Optional offline model | Ollama with local Llama | Optional offline alternative behind the same AI SDK provider interface |
| Local environment | Docker Compose where practical for the agent processes and dashboard | Starts repeatable infrastructure and independent processes |

This replaces the earlier SPADE/Python/XMPP/local-PostgreSQL component view (see DECISION_LOG.md D-009 and D-010). The negotiation semantics, message envelope fields, and state-ownership rules below are unchanged by the stack pivot.

## Runtime flow

User command → Next.js dashboard → API bridge → Gateway agent → A2A → domain agents

Domain agents → versioned messages and audit events → read model → dashboard

Structured audit facts → ExplanationAgent → AI SDK (Gemini, or Ollama offline) → validated explanation

The API bridge, A2A transport, database, and dashboard are shared infrastructure. They do not calculate the winning manufacturing plan.

## Cloud dependency

Neon and Gemini are both cloud services reached over the internet. This is not a fully local/offline deployment: stopping the LLM provider (Ollama or Gemini) must not block manufacturing functions per the existing non-negotiable rule, but the database itself requires network access to Neon. Only the LLM-assistance path has a documented offline alternative (Ollama); the database does not.

## State ownership

Logical decentralization is enforced through ownership:

- OrderAgent can write only its order, negotiation, and plan state.
- InventoryAgent can write only inventory balances, holds, and reservations.
- Each SupplierAgent can write only its own capacity, offers, holds, and commitments.
- Each WorkCenterAgent can write only its own calendar, holds, and commitments.
- The audit writer appends events but cannot edit resource state.
- The dashboard reads projections and sends commands but cannot directly mutate agent-owned tables.

One Neon project/database is acceptable for the prototype if separate schemas or repository boundaries enforce these rules. Independent database servers are not necessary to prove distributed decision-making.

## Planned repository structure

    major-project/
      apps/
        dashboard/                 Next.js and TypeScript
      services/
        gateway/                   UI-to-agent bridge
        agent-system/              TypeScript package and agent entry points
          src/mrpii-agents/
            agents/
              order.ts
              inventory.ts
              supplier.ts
              work-center.ts
              explanation.ts
            domain/
              bom.ts
              inventory.ts
              capacity.ts
              scoring.ts
              replanning.ts
            protocols/
              contract-net.ts
              messages.ts
              a2a-adapter.ts
            persistence/
            llm/
            api/
      packages/
        contracts/                 Shared versioned Zod/JSON schemas
      scenarios/
        furniture-v1/              Seed data and expected hand calculations
      tests/
        contract/
        integration/
        end-to-end/
        failure/
      infra/
        compose/
        scripts/
      docs/
      context/

The agent-system code is one reusable package, but final demonstration processes use different entry points and agent identities. Multiple suppliers and machines are created from configuration, not copied source folders. Because every agent is now TypeScript, one shared package can define the domain, protocol, and contract layers without a cross-language schema (the earlier JSON Schema-for-both-languages requirement no longer applies).

## Important boundaries

### Domain core

Pure functions for BOM explosion, netting, capacity checks, score normalization, and invariant validation. These functions do not know about A2A, HTTP, the UI, or the LLM.

### Protocol layer

Turns domain requests and results into versioned messages. It owns deadlines, conversation state, retries, and performatives.

### Agent layer

Owns local state and decides when to call the domain and protocol layers.

### Presentation layer

Displays facts and sends explicit commands. It does not become a hidden global scheduler.

### LLM layer

Uses a provider interface, implemented through the Vercel AI SDK, with GeminiProvider, LocalLlamaProvider (Ollama), and NoLlmProvider implementations. This keeps planning independent of one model or runtime.

## Development and final runtime

During the first spike, agents can run as separate local Node processes exchanging A2A messages directly over HTTP on localhost ports. The final multi-process demonstration should use the same pattern, one process per important agent role, whether run locally or in containers.

Docker Compose (where used) should start the bridge and separate agent processes; Neon is a managed cloud service and is not started locally. Ollama may run on the host when offline LLM operation is being demonstrated; its URL stays configurable.

