# Gemini API versus local Llama

Decision date: 2026-07-18, cloud-dependency note added 2026-07-29  
Status: provisional until tested on the demonstration machine

## Cloud dependency note (2026-07-29)

This decision already recommended Gemini (a cloud API) as the primary provider. What changed on 2026-07-29 is the database: the project now uses Neon (cloud-hosted Postgres, see DECISION_LOG.md D-010) instead of a local PostgreSQL server. Combined, this means the application depends on outbound internet access for both its database and its primary LLM, not only for the LLM as originally framed. Only the optional Ollama path can run without internet, and only for LLM assistance — stopping Ollama must still not block manufacturing functions, but there is no offline path for the database itself. Project documentation should describe this accurately.

## Short answer

For this project on a modest Windows PC, Gemini API is the better primary option.

Use:

- Gemini 3.1 Flash-Lite for structured order input and normal explanations.
- Gemini 3.5 Flash only if an explanation genuinely needs the stronger model.
- Ollama with Llama 3.2 3B as an optional offline alternative.
- NoLlmProvider as the guaranteed fallback.

Gemini avoids loading a model into local RAM or GPU memory and will normally give stronger, faster output. Local Llama is better only when offline operation, local privacy, or independence from API quotas matters more.

## Comparison

| Question | Gemini API | Llama through Ollama |
|---|---|---|
| Runs on the PC? | No, inference runs in Google's cloud | Yes |
| Requires internet? | Yes | No after the model is downloaded |
| Uses local RAM/GPU? | Negligible model load | Yes |
| Free? | A free tier currently exists, with changing limits | No token charge; electricity and hardware are local costs |
| Unlimited? | No; model, account, RPM, TPM, and daily limits apply | No provider quota, but hardware and queue limits apply |
| Output quality on modest hardware | Usually better | Depends strongly on model size and hardware |
| Setup | API key and server-side SDK | Ollama installation plus model download |
| Privacy | Free-tier data may be used to improve Google products | Local-only prompts can remain on the PC |
| Offline demonstration | No | Yes |
| Structured JSON | Supported | Supported |
| Failure risk | Internet, quota, API availability, or key error | Slow inference, insufficient memory, or local service failure |

## Is Gemini actually free?

As of 2026-07-18, Google lists a Gemini Developer API free tier with free input and output tokens for selected models, including Gemini 3.1 Flash-Lite and Gemini 3.5 Flash.

Important limits:

- Free does not mean unlimited.
- Rate limits depend on the model, account, project, and current usage tier.
- Google says the current limits should be viewed in Google AI Studio rather than copied as one permanent number.
- A limit can produce a 429 RESOURCE_EXHAUSTED response.
- Free-tier availability depends on region.
- Pricing and limits can change, so they must be checked again when implementation starts.

New accounts can begin on the free tier. Enabling a paid tier requires a Cloud Billing account and payment setup.

## Free-tier privacy warning

Google's current terms say that for unpaid Gemini API services:

- Submitted content and generated responses may be used to improve Google products.
- Human reviewers may read, annotate, or process input and output.
- Sensitive, confidential, or personal information should not be submitted.

For this project, only synthetic factory scenario data should be sent through an unpaid API. Do not send real company records, credentials, personal data, unpublished confidential material, or API secrets.

Google states that paid-service prompts and responses are not used to improve its products. The exact terms must still be reviewed before moving beyond a synthetic demonstration.

## Will local Llama load on the PC?

That cannot be guaranteed without the machine's RAM, CPU, and GPU details.

Current Ollama package sizes provide a useful first indication:

- Llama 3.2 1B: approximately 1.3 GB model download.
- Llama 3.2 3B: approximately 2.0 GB model download.
- Llama 3.1 8B: approximately 4.9 GB model download.

The model file is not the complete memory requirement. Runtime state, context, concurrent requests, and other applications require additional RAM or VRAM.

If local inference is tested, start with Llama 3.2 3B. Do not run a separate model instance for every manufacturing agent; all optional LLM requests should use one shared provider service.

## Project recommendation

### Primary

Gemini 3.1 Flash-Lite through the official JavaScript SDK in a server-side Node.js or Next.js route.

Use it for:

- Turning a natural-language order into a draft JSON object.
- Explaining a completed negotiation from supplied audit facts.
- Summarizing the effect of a machine or supplier disruption.

### Optional stronger call

Gemini 3.5 Flash only for an explanation that fails the grounding test with Flash-Lite. It is not required for normal MRP II operation.

### Optional offline provider

Ollama with Llama 3.2 3B. It offers an offline demonstration and avoids cloud data use, but should not be compulsory on a machine that cannot run it comfortably.

### Required fallback

NoLlmProvider:

- Natural-language input falls back to the normal structured form.
- Explanation falls back to a deterministic template or an unavailable status.
- Planning and negotiation continue immediately.
- Operational commitments and event traces remain identical whether the LLM is available, invalid, timed out, or disabled.

## Implementation boundary

Create one provider-neutral interface:

    ModelProvider
      parseOrderDraft(input, schema)
      explainDecision(facts, schema)

Implement:

- GeminiProvider.
- OllamaProvider.
- NoLlmProvider.

Rules:

- Store the Gemini key only in a server environment variable.
- Never call Gemini directly from browser code.
- Never commit an API key.
- Use a strict JSON Schema.
- Apply a timeout and limited retry.
- Validate every returned identifier and value against real project data.
- Keep explanations asynchronous and outside the negotiation critical path.
- Log provider, model, prompt version, latency, validation result, and fallback reason.

## What the model never decides

Gemini and Llama must not:

- Explode a BOM.
- Calculate inventory.
- Check capacity or routing feasibility.
- Create supplier or machine bids.
- Score or accept proposals.
- Reserve stock or commit time slots.
- Change the production plan.

The model explains or drafts. Deterministic MRP II and agent code decides.

## Official sources

- [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Ollama on Windows](https://docs.ollama.com/windows)
- [Ollama Llama 3.2](https://ollama.com/library/llama3.2)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)

