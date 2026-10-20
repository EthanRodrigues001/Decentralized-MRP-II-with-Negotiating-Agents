# Work log — Stack pivot away from SPADE

Date: 2026-07-29

## Request recorded

- Drop SPADE (assessed as not worth using) in favor of the Vercel AI SDK and the Agent2Agent (A2A) protocol.
- Use Neon (serverless Postgres) instead of a local PostgreSQL server.
- The database and primary LLM (Gemini API) are cloud-hosted, not local, regardless of what was represented verbally elsewhere.
- Keep the deterministic core rule unchanged: BOM, netting, capacity, and scoring remain plain code, never LLM-decided.
- Documentation should describe the real architecture accurately.

## Outcome

- Recorded D-009 (AI SDK + A2A replace SPADE/Python/XMPP) and D-010 (Neon replaces local PostgreSQL) in DECISION_LOG.md. D-002 marked superseded; nothing erased.
- Updated PROJECT_CONTEXT.md provisional decisions and added a "Deployment reality" note: the system requires internet access for both its database and primary LLM and is not a fully local/offline deployment.
- Rewrote the current-state docs (README, project-in-one-page, system-architecture, technology-decision, agents-and-negotiation, build-roadmap Phase 1, risks-and-open-questions, glossary, sources, llm-provider-decision) to describe the TypeScript/AI SDK/A2A/Neon baseline instead of SPADE/XMPP/local PostgreSQL.
- Did not change the negotiation semantics (Contract Net performatives, scoring formula, replanning rules) or the non-negotiable engineering rules — only the transport, runtime language, and database changed.

## Files touched

- context/DECISION_LOG.md
- context/PROJECT_CONTEXT.md
- README.md
- docs/00-start-here/project-in-one-page.md
- docs/00-start-here/glossary.md
- docs/02-design/system-architecture.md
- docs/02-design/agents-and-negotiation.md
- docs/03-planning/technology-decision.md
- docs/03-planning/build-roadmap.md
- docs/03-planning/risks-and-open-questions.md
- docs/03-planning/llm-provider-decision.md
- docs/04-reference/sources.md
