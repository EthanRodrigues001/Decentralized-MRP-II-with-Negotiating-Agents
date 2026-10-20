# Agents and negotiation

## Agent rule

Create an agent only for something that owns a decision. Do not create an agent for every database row.

## Agent responsibilities

| Agent | Owns | Main decisions | Must never do |
|---|---|---|---|
| OrderAgent | One order's requirements, due date, offers, and commitments | Which feasible offers to accept and when to replan | Directly edit inventory, supplier, or work-centre state |
| InventoryAgent | On-hand stock, safety stock, holds, and reservations | How much stock can be offered and committed | Promise unavailable stock |
| SupplierAgent | One supplier's catalogue, capacity, lead time, price, and holds | Whether and on what terms to bid | Change another supplier's offer |
| WorkCenterAgent | One resource's capabilities, calendar, holds, and commitments | Which feasible time slot and cost to offer | Double-book a committed slot |
| ExplanationAgent | Read-only structured audit facts | How to summarize a completed decision | Calculate or change the operational plan |
| Gateway/Observer | Commands, status updates, and audit projection | No manufacturing decision | Select proposals or change commitments |

There will be multiple OrderAgent, SupplierAgent, and WorkCenterAgent instances. They may share implementation code but must have separate identities and owned state.

## Negotiation protocol

Use a simplified FIPA Contract Net flow.

### 1. CFP

The initiating OrderAgent sends a call for proposals containing:

- Conversation ID.
- Required item or capability.
- Quantity or duration.
- Earliest start.
- Need-by or due time.
- Maximum allowed cost when relevant.
- Reply deadline.
- Schema version.

### 2. PROPOSE or REFUSE

A resource agent returns one of:

- PROPOSE: quantity, price, start, finish, reliability value, hold token, and offer expiry.
- REFUSE: a machine-readable reason such as insufficient stock, unsupported operation, no valid slot, or deadline impossible.

The resource makes a temporary hold before sending a proposal. This keeps concurrent proposals honest.

### 3. Validate

The OrderAgent rejects any offer that:

- Arrived after the reply deadline.
- Is already expired.
- Has an invalid schema.
- Does not meet the required quantity or capability.
- Breaks routing precedence.
- Exceeds a hard budget or due-date constraint.

### 4. Score

Only feasible proposals are scored. A simple initial rule is:

Final score = 0.45 × normalized cost  
            + 0.35 × normalized tardiness  
            + 0.15 × normalized lead time  
            + 0.05 × normalized risk

Lower is better. Weights are scenario configuration, visible in the dashboard, and sum to 1. Hard constraints are checked before scoring; a low score cannot make an impossible proposal valid.

### 5. ACCEPT_PROPOSAL or REJECT_PROPOSAL

- The winner receives ACCEPT_PROPOSAL with its hold token.
- Other bidders receive REJECT_PROPOSAL.
- Rejected holds are released.

### 6. Commit

The winning resource atomically converts its valid hold into one commitment. A repeated ACCEPT message must return the existing result rather than create another commitment.

### 7. Result or failure

- INFORM_RESULT reports a completed delivery or operation.
- FAILURE reports a broken commitment and its reason.
- CANCEL requests release of work that has not started.

The affected OrderAgent then opens a new conversation for remaining work.

## Required message envelope

Every agent message should include:

| Field | Purpose |
|---|---|
| messageId | Makes duplicate processing safe |
| conversationId | Groups one negotiation |
| correlationId | Links nested negotiations and replans to the order |
| causationId | Points to the message that caused this message |
| sender | Agent identity |
| receiver | Target agent or role |
| performative | CFP, PROPOSE, REFUSE, ACCEPT_PROPOSAL, REJECT_PROPOSAL, INFORM_RESULT, FAILURE, or CANCEL |
| type | Domain message name |
| timestamp | When it was sent |
| replyBy or expiresAt | Prevents indefinite waits and stale offers |
| schemaVersion | Supports controlled contract changes |
| payload | Versioned domain data |

The shared contract should be defined with Zod (or JSON Schema derived from it) so every agent, all written in TypeScript, validates the same wire format. These fields are carried as the domain payload inside the Agent2Agent (A2A) protocol's own message/task envelope rather than inside a custom XMPP stanza.

## Concurrency rules

- Stock and calendar offers use short-lived holds.
- A hold belongs to one conversation and resource.
- Accepting a hold is an atomic compare-and-set operation.
- Expired, rejected, or cancelled holds are released.
- Message handlers store processed message IDs.
- A negotiation has a maximum of three rounds.
- No valid result becomes an explicit INFEASIBLE state; it does not loop forever.

## Replanning rules

When a disruption occurs:

1. Mark the failed commitment and identify dependent unfinished work.
2. Preserve completed operations and unaffected commitments.
3. Release only invalid future holds and commitments.
4. Recalculate the remaining requirement.
5. Send a new CFP with a new conversation ID and the original order correlation ID.
6. Commit a replacement or mark the order infeasible.

## LLM boundary

This applies equally to Gemini (primary, via the AI SDK) and Llama through Ollama (optional offline provider).

The LLM may:

- Turn a plain-language order or priority statement into a draft structured object.
- Explain why one already-selected proposal won.
- Summarize the effect of a disruption from audit facts.
- Later choose an identifier from a set of candidates already proven feasible.

The LLM may not:

- Perform BOM or inventory arithmetic.
- Invent supplier, stock, or calendar facts.
- Decide whether a slot is feasible.
- Write operational state.
- Bypass deterministic constraints.
- Be required for negotiation to finish.

All model output is schema-validated and then checked against domain invariants. A timeout, invalid value, or unavailable model triggers a deterministic fallback. This boundary does not depend on which agent runtime or transport is in use.

