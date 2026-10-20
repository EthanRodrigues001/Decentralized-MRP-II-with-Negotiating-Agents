# MRP II validation

## Verdict

The planned system is an MRP II-lite prototype, not only an MRP application.

Basic MRP stops mainly at material questions:

- What components are required?
- How many are required?
- When are they required?
- What must be purchased or produced?

MRP II continues into the other manufacturing resources needed to execute the plan. The project therefore must include capacity, routing, production scheduling, supplier constraints, resource costs, execution feedback, and replanning. Siemens describes MRP II as extending material planning with production equipment, personnel, production rates, supplier capacity, maintenance, and scheduling. Oracle's classic definition also includes capacity planning, execution feedback, cost information, and what-if simulation.

## Required MRP II coverage

| Capability | Basic MRP or MRP II? | Planned implementation | Evidence in the final demonstration |
|---|---|---|---|
| Demand and master production schedule | Both | Released production orders, quantities, priorities, and due dates form a simple MPS | Order list and due-date timeline |
| Multi-level BOM explosion | Basic MRP core | Expand Study Desk and Bookshelf requirements | Gross-requirement table |
| Inventory netting | Basic MRP core | Subtract usable stock and scheduled receipts while preserving safety stock | Net-requirement and reservation table |
| Purchasing and supplier planning | Closed-loop MRP / MRP II | Supplier agents offer quantity, price, capacity, and delivery dates | Accepted and rejected supplier proposals |
| Capacity requirements planning | MRP II | Calculate required time against finite work-centre calendars | Capacity load and utilization view |
| Routing and production scheduling | MRP II | Negotiate CNC, drilling, finishing, and assembly slots in precedence order | Gantt-style schedule |
| Labour or crew capacity | MRP II | Represent the assembly crew as a work-centre resource | Crew calendar and commitment |
| Resource cost feedback | MRP II | Roll up material, supplier, machine, setup, and lateness costs | Original and revised planned-cost summary |
| Shop-floor execution feedback | MRP II | Agents report completion, delay, breakdown, or failed commitment | Event and message timeline |
| Closed-loop replanning | MRP II | Recalculate affected unfinished work after actual events | Before-and-after plan |
| What-if capability | MRP II | Inject a machine failure or supplier delay into a copied scenario | Scenario comparison and KPI change |

## Features that prevent the project from collapsing into basic MRP

These are mandatory:

1. A simple master production schedule containing production orders and due dates.
2. Finite capacity checks for machines and a crew.
3. Routing precedence and actual time-slot commitments.
4. Supplier capacity, delivery time, and price negotiation.
5. Planned resource-cost roll-up.
6. Execution feedback from completed, delayed, or failed commitments.
7. Partial replanning after a disruption.
8. What-if comparison between the original and disrupted scenario.

If the implementation stops after BOM explosion, inventory netting, and purchase requirements, it is only MRP. The capacity, execution, feedback, cost, and replanning layers are what make this project MRP II.

## Honest scope label

The application should be described as:

> A decentralized MRP II prototype implementing material planning, capacity planning, supplier and work-centre negotiation, finite scheduling, cost feedback, and closed-loop replanning.

It should not be described as a complete commercial MRP II or ERP suite. Full sales and operations planning, general ledger, payroll, invoicing, and enterprise-wide financial accounting remain outside the first version. A planned-cost summary is included because financial feedback is part of MRP II, but it is not an accounting system.

## Acceptance rule

The MRP II claim is accepted only when the fixed demonstration proves all of the following together:

- Correct material requirements.
- Feasible inventory and supplier commitments.
- Feasible machine and crew capacity.
- A routing-respecting production schedule.
- Planned resource cost.
- Actual event feedback.
- Automatic partial replanning.
- A before-and-after what-if comparison.

Sources:

- [Siemens — Manufacturing Resource Planning II](https://www.siemens.com/en-us/technology/manufacturing-resource-planning-mrp-ii/)
- [Oracle — MRP II glossary definition](https://docs.oracle.com/cd/E22655_01/nav/JD_Edwards_World_Glossary_A91.pdf)

