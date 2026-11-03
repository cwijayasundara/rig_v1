# PRD topics a source must say something about

`/rig:chart` reads the client's `source.md` (never `prd.md`) and writes `coverage.md`, one row per topic below. A topic is **covered**
when the source says something a test could assert about it, in the client's own words; a topic the source never mentions is
**absent**, and an absent topic is never filled from imagination: a person answers it, it stays `open` (the client is asked, and
approval waits), or it does not apply (`n/a`, with the reason).

Rows: `- <id> covered source.md:<line> "<quote>"` | `- <id> answered <AC/DR/NFR ids>` | `- <id> open` | `- <id> n/a[ by <who>] — <reason>`.
`answered` points at criteria a person confirmed; the agent's own `(proposed at chart)` value is not an answer.

| Id | Topic | Covered when the source says |
|---|---|---|
| failure | Failure handling | what happens on bad input, a down dependency or a failed step: the error, the status, what stays unchanged |
| escalation | Escalation and hand-off | when and to whom the system hands over, and what that person receives |
| ground-truth | Ground truth and sample data | real or labelled examples with expected outputs that define "correct" |
| security | Security and access | who may do what, how they are identified, what must never be exposed or logged |
| rollout | Rollout and operations | how it goes live, who runs it, how it is monitored and rolled back |
| accuracy | Accuracy benchmark | a number the model must reach on the ground-truth set (agent products) |
| autonomy | Autonomy limits | what the agent may do alone and what needs approval (agent products) |
| fallback | Confidence and fallback | the confidence or failure level at which it stops, and the fallback (agent products) |
| budget | Cost and latency budget | numbers for cost per run and time per answer (agent products) |
| audit | Audit trail | what is recorded per decision and for how long (agent products) |

The five agent-product topics are `n/a — no model, agent or classifier in this product` when the source has none.
