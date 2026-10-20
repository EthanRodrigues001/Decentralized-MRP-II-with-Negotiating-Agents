# Scope and demonstration

## First-version scope

The first release is a practical MRP II-lite prototype for one simulated furniture factory.

It includes:

- Two finished products: Study Desk and Bookshelf.
- At least one two-level BOM.
- Fixed product routings.
- Two simultaneous make-to-order production orders.
- One inventory agent.
- Two supplier agents with different cost and speed.
- Alternative CNC work-centre agents.
- A finishing work centre.
- An assembly work centre or crew.
- Inventory, supplier, and capacity negotiation.
- Deterministic proposal scoring.
- Temporary holds and atomic commitments.
- Machine and supplier disruption events.
- Partial replanning.
- A schedule view, negotiation trace, and KPIs.
- Optional read-only Llama explanations.

## Suggested factory fixture

### Products

**Study Desk**

- Desktop panel.
- Leg subassemblies.
- Hardware kit.
- Varnish.

**Bookshelf**

- Side panels.
- Shelf panels.
- Back panel.
- Hardware kit.
- Varnish.

### Routing

1. CNC cutting.
2. Drilling.
3. Finishing.
4. Assembly.

### Competing resources

- BudgetTimber: cheaper plywood with a longer lead time.
- RapidTimber: more expensive plywood with a shorter lead time.
- CNC-A: faster and more expensive.
- CNC-B: slower and cheaper.

Exact quantities, durations, calendars, and prices must be frozen in a versioned scenario file and checked by hand before implementation.

## Demonstration script

1. Reset and load the fixed scenario.
2. Show initial inventory, supplier data, and work-centre calendars.
3. Submit a Study Desk order and a Bookshelf order with different due dates.
4. Show the BOM explosion and the shared plywood shortage.
5. Show inventory proposals and reservations.
6. Show supplier CFP, proposal, refusal if applicable, acceptance, and rejection messages.
7. Show both orders competing for CNC capacity.
8. Display the committed material plan and Gantt-style production schedule.
9. Display total cost, predicted completion, tardiness, utilization, and negotiation rounds.
10. Inject a failure into the selected CNC machine or supplier.
11. Show the FAILURE message and identify affected unfinished operations.
12. Renegotiate only the affected work.
13. Compare the original and revised plans.
14. Request a plain-language explanation of the changed choice.
15. Stop Ollama and repeat a planning action to prove the core system still works.

## Deliberate exclusions

The first version excludes:

- General ledger, invoicing, payroll, and HR.
- Sales and operations planning.
- Demand forecasting.
- Real factory devices or PLC control.
- Quality inspection logic and scrap.
- Material substitutions.
- Advanced lot sizing.
- Multiple factories or companies.
- Blockchain and distributed consensus.
- Reinforcement learning.
- LLM fine-tuning.
- Unrestricted natural-language negotiation.
- Production-grade high availability and security.

## Completion boundary

The project is complete enough for its first release when the fixed scenario passes all acceptance tests and the complete demonstration can be repeated from a clean local setup. Extra algorithms or additional screens do not replace a reliable vertical flow.

