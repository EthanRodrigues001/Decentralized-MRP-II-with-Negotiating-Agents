# Work log — Gemini, MRP II audit, and paper discovery

Date: 2026-07-18

## Request recorded

- Confirm that the project is MRP II rather than only MRP.
- Compare Gemini API with locally hosted Llama because local hardware may be limited.
- State whether Gemini is better and whether its API is free.
- Find exactly 25 published papers from recognized libraries such as IEEE Xplore, Elsevier/ScienceDirect, SpringerLink, and Taylor & Francis.
- Give only short paper descriptions for now; detailed processing will be requested later.
- Treat papers as background support with only minor influence on project decisions.

## Outcome

- Added an explicit MRP II capability audit and acceptance boundary.
- Confirmed that capacity planning, routing, finite scheduling, crew resources, cost feedback, actual-event feedback, and what-if replanning remain mandatory.
- Recommended Gemini 3.1 Flash-Lite as the primary model for a modest PC.
- Retained Ollama with Llama 3.2 3B as an optional offline provider.
- Preserved deterministic MRP II decisions and the no-LLM fallback.
- Added exactly 25 publisher-verified papers:
  - 10 IEEE.
  - 9 Elsevier.
  - 4 Taylor & Francis.
  - 2 Springer.
- Marked the two explicit MRP II papers separately from papers that support only one project layer.

## Files added

- docs/01-requirements/mrpii-validation.md
- docs/03-planning/llm-provider-decision.md
- docs/04-reference/paper-shortlist.md
- context/DECISION_008_GEMINI_PROVIDER.md
- context/WORK_LOG_2026-07-18_GEMINI_PAPERS.md

