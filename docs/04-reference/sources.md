# Sources

Reviewed on 2026-07-18, updated 2026-07-29 for the TypeScript/AI SDK/A2A/Neon stack pivot. Technical versions and package status may change, so verify them again when dependencies are pinned.

## Current stack (AI SDK, A2A, Neon)

- [AI SDK by Vercel](https://ai-sdk.dev/docs/introduction) — unified TypeScript interface for LLM providers, structured output, and tool calling.
- [Vercel: How to build AI agents with Vercel and the AI SDK](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk) — multi-step agents, tool definitions, and monitoring.
- [Vercel: AI SDK 6](https://vercel.com/blog/ai-sdk-6) — agent abstractions, tool calling, and human-in-the-loop approval flags.
- [Agent2Agent (A2A) — Wikipedia overview](https://en.wikipedia.org/wiki/Agent2Agent) — origin, purpose, and governance summary.
- [Linux Foundation: Agent2Agent Protocol project launch](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents) — governance move from Google to the Linux Foundation.
- [Linux Foundation: A2A surpasses 150 organizations](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year) — adoption and v1.0 status as of 2026.
- [Google Developers Blog: Google Cloud donates A2A to the Linux Foundation](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/) — origin and hand-off of governance.
- [Neon — GitHub repository](https://github.com/neondatabase/neon) — serverless Postgres architecture, storage/compute separation, branching, and scale-to-zero.
- [Neon pricing](https://neon.com/pricing) — current free-tier and usage-based pricing; re-check before the final demonstration.

## Manufacturing planning

## Manufacturing planning

- [Siemens: Manufacturing Resource Planning II](https://www.siemens.com/en-us/technology/manufacturing-resource-planning-mrp-ii/) — MRP II resources, BOM and inventory inputs, capacity, scheduling, suppliers, and change handling.
- [Oracle manufacturing glossary](https://docs.oracle.com/cd/E22655_01/nav/JD_Edwards_World_Glossary_A91.pdf) — classic definition of MRP II as linked operational, capacity, material, simulation, and financial planning functions.

## Negotiation standard

- [FIPA Contract Net Interaction Protocol](https://www.fipa.org/specs/fipa00029/SC00029H.html) — CFP, proposal or refusal, deadline, acceptance or rejection, result, and failure flow.
- [FIPA ACL specifications](https://www.fipa.org/repository/aclspecs.html) — message structure and communicative-act references.

## SPADE (superseded, kept for historical reference — see DECISION_LOG.md D-002, D-009)

- [SPADE official site](https://spadeagents.eu/) — current framework overview.
- [SPADE on PyPI](https://pypi.org/project/spade/) — release and Python support status.
- [SPADE agent model](https://spade-mas.readthedocs.io/en/latest/model.html) — connection, dispatcher, behaviours, and XMPP communication.
- [SPADE quick start](https://spadeagents.eu/docs/spade/usage) — asynchronous agents and embedded or dedicated XMPP setup.
- [SPADE agent communication](https://spadeagents.eu/docs/spade/develop/agents.html) — messages, templates, and FIPA-style metadata.
- [SPADE-LLM on PyPI](https://pypi.org/project/spade-llm/) — beta status, supported Python versions, Ollama, structured outputs, and provider integration.
- [SPADE-LLM quick start](https://spadeagents.eu/docs/spade_llm/getting-started/quickstart/) — local Ollama example.

## Other framework options considered

- [Mesa documentation](https://mesa.readthedocs.io/stable/index.html) — Python agent-based modelling, simulation, visualization, and data collection.
- [PADE repository](https://github.com/grei-ufc/pade) — current Python 3.12 modernization and runtime information.
- [PADE documentation](https://pade.readthedocs.io/en/latest/) — older FIPA-ACL and Contract Net documentation; instructions must be checked against the current release.
- [LangGraph.js overview](https://docs.langchain.com/oss/javascript/langgraph/overview) — durable stateful LLM orchestration and its intended scope.
- [XState actors](https://stately.ai/docs/actors) — isolated actor state, asynchronous events, state-machine actors, persistence, and testing.
- [NATS documentation](https://docs.nats.io/) — publish/subscribe, request/reply, and JetStream persistence for the TypeScript fallback.
- [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream) — durable streams, acknowledgements, replay, and delivery semantics.

## Local LLM

- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) — JSON Schema output and Zod examples.
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling) — JavaScript and Python tool-call support.
- [Ollama Llama 3.2](https://ollama.com/library/llama3.2) — locally packaged 1B and 3B variants and approximate file sizes.
- [Meta Llama model repository](https://github.com/meta-llama/llama-models) — official model list, download flow, model cards, and licenses.
- [Meta Llama 3.2 model card](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md) — intended uses, sizes, context, limitations, and license reference.

