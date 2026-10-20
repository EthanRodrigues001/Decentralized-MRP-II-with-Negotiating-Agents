# Technology decision

Decision status: provisional baseline  
Decision date: 2026-07-29 (revised from the 2026-07-18 SPADE baseline; see DECISION_LOG.md D-009 and D-010)  
Freeze point: after the framework spike

## Recommendation

Use a single TypeScript stack: TypeScript agent services communicating over the Agent2Agent (A2A) protocol, and Next.js for the web application.

Recommended stack:

| Area | Choice | Reason |
|---|---|---|
| Web | Next.js with TypeScript | Matches the existing development skill set and supports a strong interactive dashboard |
| Agent runtime | TypeScript/Node services, one process per agent role | Keeps the whole codebase in one language and removes the earlier Python/TypeScript contract-drift risk |
| Agent-to-agent transport | Agent2Agent (A2A) protocol | Open, Linux Foundation-governed protocol (v1.0 in 2026) with Agent Cards for discovery and a JSON-RPC task/message lifecycle; multi-vendor support across major cloud platforms |
| LLM toolkit | Vercel AI SDK | Unified TypeScript interface for structured output and tool calling across providers; used only for draft-order parsing and the ExplanationAgent |
| LLM provider | Gemini (primary), Ollama/Llama (optional offline) | Matches the existing LLM provider decision; kept out of operational decisions |
| Database | Neon (serverless, cloud-hosted Postgres) | Managed Postgres reachable from TypeScript with no local server to run; handles constraints, atomic holds/commitments, audit data, and UI projections |
| Validation | Zod | Prevents loosely structured agent and LLM data across one language, so no separate JSON Schema is needed for a second runtime |
| Testing | Vitest and Playwright | Covers domain, integration, and browser flows |
| Local orchestration | Docker Compose for agent processes and the bridge (Neon itself is not run locally) | Makes independent processes repeatable |

Exact dependency versions will be pinned only after the spike passes on the target machine.

## Why this replaces the SPADE baseline

The original 2026-07-18 baseline recommended SPADE (Python) with a Next.js dashboard, judged as the safer choice at the time. That recommendation is superseded (DECISION_LOG.md D-002, D-009) because:

- A single-language stack removes the hybrid Python/TypeScript contract-drift risk called out in the risk register.
- SPADE-LLM was still beta and pinned to specific Python versions; the AI SDK is an actively maintained TypeScript toolkit already fitting the team's Next.js background.
- A2A is a maintained, multi-vendor, Linux Foundation-governed protocol rather than a single-project research framework, and is designed specifically for agent-to-agent task delegation and discovery.

Nothing about the negotiation semantics changed: the same simplified FIPA Contract Net flow (D-003), the same deterministic decision rule (D-004), and the same LLM-as-assistant boundary (D-005, D-008) still apply. Only the transport, runtime language, and database changed.

## Framework comparison

| Option | Strength | Problem for this project | Decision |
|---|---|---|---|
| TypeScript agents + A2A | Single language, matches team background, maintained multi-vendor protocol, Agent Card discovery, JSON-RPC task lifecycle | A2A is a transport/discovery protocol, not a negotiation library — Contract Net semantics must still be implemented on top of it | Recommended |
| SPADE (Python) | Distributed XMPP agents, behaviours, embedded server, FIPA metadata, official LLM extension | Requires a second language alongside the TypeScript UI; SPADE-LLM extension was still beta | Superseded, see D-002/D-009 |
| Mesa | Excellent simulation, time, data collection, and agent-based modelling | Primarily an in-process simulation framework, not a distributed negotiation transport | Do not use as the core |
| PADE | Python MAS, FIPA-ACL, and documented Contract Net concepts | Same second-language problem as SPADE, plus older public documentation | Do not use |
| Node.js + NATS + XState | Strong TypeScript fit, explicit distributed services, durable messaging, visible state machines | Requires building and defending a custom agent runtime and FIPA-style negotiation layer without a standard interop protocol | Viable fallback if A2A proves unreliable |
| LangGraph.js | Strong for long-running stateful LLM workflows | It is not the distributed manufacturing message transport and is unnecessary for deterministic negotiation | Do not add to the MVP |

Do not combine SPADE, PADE, Mesa, and the new TypeScript/A2A stack. Running two agent frameworks would increase integration work without adding a required capability.

## Framework spike decision gate

Before the full build, prove the TypeScript + A2A path can do all of the following:

1. Run three agents with separate identities as independent TypeScript/Node processes, each publishing an Agent Card.
2. Complete CFP → PROPOSE → ACCEPT_PROPOSAL → INFORM_RESULT carried as A2A messages/tasks.
3. Reject a late proposal.
4. Log every message with one conversation ID.
5. Stop one agent without stopping the others.
6. Send progress to a minimal Next.js page.
7. Call Gemini once through the AI SDK behind a replaceable provider interface.
8. Complete the same flow when the LLM provider is unavailable (NoLlmProvider fallback).
9. Read and write state in Neon from a TypeScript process.

If items 1–6 and 9 pass, freeze the TypeScript + A2A stack. If A2A proves unreliable after a time-boxed two-day spike, fall back to Node.js, NATS, and XState and record a replacement decision.

## Correct use of the LLM

The project should be LLM-assisted, not LLM-controlled. This is unchanged by the stack pivot.

Use Gemini 3.1 Flash-Lite as the primary provider through the AI SDK. Ollama with Llama 3.2 3B remains an optional offline alternative behind the same provider interface (see llm-provider-decision.md for the full comparison).

All model calls must:

- Use a strict output schema (Zod, via the AI SDK's structured-output support).
- Use a low temperature.
- Have a short timeout.
- Validate referenced IDs against real data.
- Pass domain invariants after schema validation.
- Log the provider, model tag, prompt version, input facts, output, latency, and fallback reason.
- Fall back to deterministic behavior.

## Cloud dependency note

Neon and Gemini are both reached over the internet. Unlike the original local-first assumption, this stack requires network access for the database at all times, and for the LLM unless the optional offline Ollama path is used. This is recorded as a changed assumption in risks-and-open-questions.md.

## License note

Llama models use Meta's custom Community License rather than an Apache or MIT license. Before distributing model-related artifacts, check the model's license, acceptable-use policy, attribution, and notice requirements. Running a locally downloaded model for the optional offline path does not remove those obligations. Do not download or commit model weights into this repository.
