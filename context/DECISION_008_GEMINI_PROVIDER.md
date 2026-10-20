# D-008 — Prefer Gemini API with optional local Llama

- Date: 2026-07-18
- Status: provisional, awaiting provider spike
- Supersedes: the provider choice in D-005; the deterministic LLM boundary remains unchanged

## Decision

Use Gemini 3.1 Flash-Lite as the primary provider for structured draft input and grounded explanations. Keep Ollama with Llama 3.2 3B as an optional offline provider and keep NoLlmProvider as the required fallback.

## Reason

- Gemini does not load a model into the development PC's RAM or GPU.
- Its current free tier is enough for small synthetic development scenarios, subject to changing quotas.
- It supports structured JSON and the official JavaScript SDK.
- Local Llama remains useful for an offline demonstration or local privacy.

## Conditions

- Only synthetic, non-confidential data may use the unpaid Gemini tier.
- The API key remains server-side.
- No model performs MRP II calculations or operational decisions.
- Operational results must be identical when every model provider is unavailable.
- Recheck pricing, limits, terms, and model names when implementation starts.

## Detailed record

See [Gemini API versus local Llama](../docs/03-planning/llm-provider-decision.md).

