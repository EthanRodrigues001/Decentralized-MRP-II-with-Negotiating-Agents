# Risks and open questions

## Current assumptions

- The target is an implementation project, not a new research contribution.
- The stack is a single TypeScript codebase (agents, dashboard, and bridge); the earlier hybrid TypeScript/Python assumption no longer applies (see DECISION_LOG.md D-009).
- The first release is a simulated factory, not connected hardware.
- Updated 2026-07-29: the database (Neon) and the primary LLM (Gemini) are both cloud services reached over the internet. The earlier assumption that local execution is more important than cloud deployment no longer holds for this baseline; only the optional Ollama path can run offline, and only for LLM assistance, not for the database.
- Logical decentralization is acceptable; blockchain is not required.
- The exact fixture and framework are frozen before the main implementation.

## Main risks

| Risk | Effect | Mitigation |
|---|---|---|
| Scope grows into full ERP | Core negotiation never becomes reliable | Keep the written exclusions and one fixed factory |
| Framework looks good in docs but integration is awkward | Time lost after domain work begins | Run the two-day framework and UI bridge spike first |
| Hybrid language contracts drift (resolved 2026-07-29) | Was a risk when Python and TypeScript could interpret messages differently; no longer applicable now that every agent is TypeScript (D-009) | Kept for history; still keep one versioned Zod/schema source and contract tests as good practice |
| Shared database becomes a hidden central planner | Decentralization claim becomes weak | Enforce state ownership and prohibit cross-agent writes |
| Concurrent offers double-book a resource | Invalid plans | Temporary holds, expiry, atomic commit, and idempotency |
| LLM invents facts or arithmetic | Unsafe or irreproducible decisions | Read-only facts, schemas, semantic checks, and deterministic fallback |
| Model is too slow for available hardware | Demonstration stalls | Start with a small model, short context, timeout, and NoLlmProvider |
| AI SDK or A2A library behavior changes | Integration breakage | Keep both behind small adapters and pin the proven versions |
| Dashboard work consumes the schedule | Strong visuals but incomplete engine | Build the browser flow only after the vertical slice |
| Disruption handling rewrites the entire plan | Unstable and unrealistic result | Preserve completed and unaffected commitments |
| No proposal arrives | Infinite waiting | Reply deadlines, maximum rounds, and explicit INFEASIBLE |
| “Optimal” is overclaimed | Result is difficult to defend | Describe transparent heuristic negotiation and measured fixture results |
| A2A is newer to this team than a research-established framework | Spike could reveal gaps the SPADE evaluation would have already covered | Run the same time-boxed spike discipline used for the SPADE evaluation before committing further |
| Neon or Gemini is unreachable during a demonstration (no internet, outage, or quota) | The whole system stalls, not just the LLM path | Confirm venue internet access before the final demonstration; keep the Ollama offline path documented and tested even though it is optional |
| What was told to the supervisor about local execution does not match the actual cloud-dependent architecture | Risk of the discrepancy surfacing during review or a demonstration without internet | Keep project documentation accurate to the real architecture (this file and the rest of docs/ now do); decide deliberately whether and how to correct the record with the supervisor |

## Questions to settle before coding

1. Is a framework outside the original list formally allowed?
2. Is a cloud-hosted database (Neon) and cloud LLM (Gemini) acceptable, given the project was described to the supervisor as running locally?
3. What is the final submission and demonstration date?
4. What CPU, RAM, and GPU would run Ollama if the optional offline path is used during development or demonstration?
5. Must the final runtime work without internet access? If so, the current Neon-based baseline needs a local-Postgres fallback plan.
6. Is the furniture factory acceptable, or is another manufacturing domain required?
7. Is the Agent2Agent (A2A) protocol an acceptable agent-to-agent transport, or is a specific framework/protocol mandated?
8. Is a cloud-hosted Postgres (Neon) acceptable, or must the database run locally?
9. Which outputs are mandatory: report, source code, video, hosted URL, or only live demonstration?
10. Are formal FIPA messages required, or is a clearly documented FIPA-inspired JSON contract carried over A2A sufficient?

## Decisions that require a spike

- Whether A2A message delivery and task lifecycle work reliably between independent local TypeScript processes.
- Gateway implementation and live-update mechanism.
- Database boundaries and restart behavior on Neon.
- Llama 3.2 3B versus a larger local model, for the optional offline path.
- Whether the AI SDK's built-in provider abstraction is enough, or a thinner custom adapter is needed.

These questions should be answered with a small executable proof, not only documentation.

