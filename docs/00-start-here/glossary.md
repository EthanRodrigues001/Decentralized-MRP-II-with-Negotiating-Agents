# Glossary

## Manufacturing terms

**MRP — Material Requirements Planning**  
Calculates which components are needed, how many are needed, and when they are needed.

**MRP II — Manufacturing Resource Planning II**  
Extends MRP by also considering capacity, machines, labour, suppliers, scheduling, cost, and feedback from production.

**BOM — Bill of Materials**  
A product recipe. It lists the parts and subassemblies required to make one unit.

**BOM explosion**  
Expanding a finished product into all required lower-level parts and quantities.

**Gross requirement**  
The total amount of a material required before available stock and expected receipts are considered.

**Net requirement**  
The amount still required after usable inventory and scheduled receipts are subtracted.

**Routing**  
The ordered operations needed to make a product, such as cutting, drilling, finishing, and assembly.

**Work centre**  
A machine, production line, or crew that performs an operation.

**Capacity**  
The amount of work a resource can perform during a period.

**Commitment**  
An accepted and reserved quantity, delivery, or time slot that an agent has promised to provide.

**Replanning**  
Creating a corrected plan when demand, inventory, supplier delivery, or machine availability changes.

## Agent terms

**Agent**  
An independent software process with its own state, rules, objective, and ability to communicate and act.

**Decentralized decision-making**  
No single global planner owns every decision. Each resource agent makes decisions about the resource it controls.

**CFP — Call for Proposals**  
A message asking suitable agents to submit offers for a task or resource.

**Proposal**  
An offer containing facts such as quantity, price, start time, finish time, and expiry.

**Refusal**  
A response saying that an agent cannot make a valid offer, together with a reason.

**Contract Net Protocol**  
A standard negotiation pattern: request proposals, receive proposals or refusals, accept or reject offers, then report success or failure.

**Performative**  
The intention of a message, such as CFP, PROPOSE, ACCEPT_PROPOSAL, or FAILURE.

**Conversation ID**  
A unique value tying all messages from one negotiation together.

**Temporary hold**  
A short reservation made while an offer is open. It prevents the same stock or time slot being promised to two orders.

**Utility score**  
A transparent numeric score used to compare feasible proposals using cost, lateness, lead time, and risk.

## Technology terms

**AI SDK**  
The Vercel AI SDK, a TypeScript toolkit used here only for the pieces of the system that call an LLM: structured draft-order parsing and grounded explanations. It does not make manufacturing decisions.

**A2A — Agent2Agent protocol**  
An open, Linux Foundation-governed protocol that independent agents use to discover each other (through Agent Cards) and exchange messages and tasks over HTTP/JSON-RPC. Used here as the transport for Contract Net negotiation messages, replacing XMPP.

**Agent Card**  
A metadata document an A2A agent publishes describing its identity and capabilities, letting other agents find and address it.

**Neon**  
A serverless, cloud-hosted Postgres database. Used here for operational state and the append-only audit/read model, replacing a locally hosted PostgreSQL server.

**Ollama**  
A local model server used to run Llama or another supported model on the development machine. Kept as an optional offline LLM provider behind the same provider interface as Gemini.

**LLM — Large Language Model**  
A text model used here only for constrained input assistance and human-readable explanations.

**Deterministic logic**  
Code that gives the same result for the same input. It is used for all manufacturing arithmetic, validation, scoring, and commitments.

**Audit log**  
An append-only history of messages, decisions, state changes, and failures.

## Superseded terms

**SPADE**  
A Python multi-agent framework whose agents communicated through XMPP. Used in the original 2026-07-18 baseline; replaced by TypeScript agent services over A2A (DECISION_LOG.md D-009).

**XMPP**  
The message protocol SPADE used to identify agents and route messages. Replaced by the A2A protocol.

