# Testing and success

## Testing principle

Correctness comes from explicit invariants and fixed fixtures, not from a convincing-looking dashboard or fluent LLM explanation.

## Domain tests

Test pure functions for:

- Multi-level BOM explosion.
- Repeated components in different BOM branches.
- Inventory netting with on-hand stock and scheduled receipts.
- Safety-stock protection.
- Supplier lead-time feasibility.
- Work-centre capability matching.
- Slot overlap detection.
- Routing precedence.
- Score normalization, ties, and configurable weights.
- Replanning only the affected dependency chain.

Expected results should be stored beside the versioned scenario and derived by hand.

## Protocol tests

Test:

- CFP receives PROPOSE and REFUSE responses.
- Reply deadline rejects late proposals.
- No reply ends in a timeout.
- ACCEPT_PROPOSAL commits once.
- Duplicate ACCEPT returns the existing commitment.
- REJECT_PROPOSAL and expiry release holds.
- FAILURE starts a new conversation.
- Maximum rounds end in INFEASIBLE.
- Unknown schema version or performative is rejected and logged.

## Integration tests

Run agents as separate processes and prove:

- Two orders can negotiate concurrently.
- One agent stopping does not crash unrelated agents.
- An offline supplier causes fallback selection or a clear infeasible result.
- Message IDs remain traceable across the database and UI.
- Agent restart does not create a second commitment.
- The bridge cannot directly edit owned resource state.

## End-to-end scenarios

### Scenario A — Feasible normal order

Inventory and capacity are sufficient. The order commits and completes without procurement.

### Scenario B — Material shortage

Two suppliers bid. The chosen offer matches the configured cost and due-date policy.

### Scenario C — Competing orders

Two orders request the same stock and CNC slot. Holds prevent double allocation.

### Scenario D — Machine breakdown

The selected machine fails. Completed and unaffected work stays fixed while remaining work is renegotiated.

### Scenario E — No feasible plan

All supplier or capacity offers violate hard constraints. The order becomes INFEASIBLE without an infinite loop.

## LLM contract tests

Test:

- Valid schema response.
- Malformed JSON.
- Correct schema with an unknown order or proposal ID.
- Explanation containing a number not present in the grounded facts.
- Prompt injection inside product or supplier text.
- Timeout.
- Ollama unavailable.
- Model too large or wrong model tag.
- Repeated calls with the same facts.

Every failure must produce a safe fallback and leave operational state unchanged.

## Acceptance criteria

For the fixed scenario:

- BOM gross and net requirements exactly match expected values.
- Committed inventory never becomes negative.
- No work centre has overlapping committed slots.
- Routing precedence is always respected.
- Every accepted proposal creates exactly one commitment.
- Every proposal and commitment is traceable by conversation ID.
- Late or missing replies cannot hang an order.
- At least three important agents run as separate processes or containers.
- A stopped supplier does not stop the rest of the system.
- A machine breakdown replans only affected unfinished work.
- Replanning ends within three negotiation rounds.
- The seeded disruption replans within five real seconds on the demonstration machine.
- A fixed seed produces the same deterministic plan with Llama disabled.
- The dashboard shows cost, completion time, tardiness, utilization, messages, rounds, and replanning latency.
- Stopping Ollama does not block any manufacturing function.

## Useful metrics

These are engineering measurements, not claims of global optimization:

- Feasible-order settlement rate.
- Total planned cost.
- Predicted tardiness.
- Makespan.
- Work-centre utilization.
- Negotiation rounds.
- Messages per negotiation.
- Proposal timeout count.
- Replanning latency.
- Invariant violation count.
- LLM schema failure and fallback rate.

For the deliberately constructed fixture, the negotiated choice should score no worse than a simple first-feasible baseline. This result must not be generalized into a claim that the system finds the best possible schedule for every factory.

