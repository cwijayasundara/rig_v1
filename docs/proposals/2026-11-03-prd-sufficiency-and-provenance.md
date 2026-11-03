# Proposal: did the client write enough, who said what, and when is a bug a bug

Date 2026-11-03. Status: proposal, nothing built. Sources: colleague feedback 3 (Gresham UC2-4 PRDs) and feedback 4 ("only one bug, and it needs a hand-edited data file"); `docs/feedback/feedback_1.html`, `feedback_2.html`; `skills/chart/SKILL.md`, `templates/prd-format.md`, `templates/edge-cases.md`, `scripts/prdformat.ts`, `scripts/chartcheck.ts`, `agents/evaluator.md`.

## What the code does today

| Concern | Today | Gap |
|---|---|---|
| Fidelity ("did we keep what the client wrote") | `source.md` kept; `conversion.md` maps every sentence; `prd check` / `prd map` script-checked; evaluator conversion mode (`weakened`, `invented`, `ledger`) | Strong. Not the problem. |
| Sufficiency ("did the client write enough") | Gap pass asks only: technology, NFRs, ambiguities that change an expected value, contradictions with tests. `edge-cases.md` runs later, at the architect, over *intents*, and is CLI-shaped (concurrency, symlinks, option parsing, exit codes) | Nothing looks at the *source* for missing whole topics. Nothing is agent-shaped: no failure handling, accuracy benchmark, escalation, autonomy limits, rollout. |
| Provenance ("who said it") | Free-text markers: `(answered at chart)`, `(default at chart)`, `(decided at chart)`, `(out of scope: ... decided by <who>)`. Only `answered` is parsed (`prdformat.ts:59`); the ledger knows rule / answer / context / out-of-scope | `default` and `decided` (the agent's own inventions) are invisible to the ledger, the review and the PR. `invented` is judged only by the LLM evaluator. A line the converter or the brainstorm made up can look identical to one the client wrote. |
| "Is it a bug" | Adversarial runs report anything that breaks; `edge-cases.md` already encodes the three bugs of the first report | No statement of what the product's trust boundary is, so a finding that needs a hand-edited file cannot be classified. |

## Change 1: PRD sufficiency probe (colleague point 1)

**Principle:** find what the source never mentions, and send it back to the person who owns the PRD. Never fill it from the model's imagination (that is where "an agent tries to invent values" comes from).

1. `templates/prd-topics.md`: a table of topics, each with `id`, what counts as covered, and when it applies.
   - Core (every product): failure handling, security and access, ground truth / sample data and acceptance values, rollout and operations, non-goals, success metric.
   - Agent products (applies when the source mentions an LLM, agent, classifier or model): accuracy benchmark with labelled ground truth and a threshold, escalation / human hand-off, autonomy limits (what may act without a person), confidence threshold and fallback, cost and latency budget, audit trail.
   - The five the colleague named (failure, escalation, security, ground truth, rollout) are all in.
2. `coverage.md` beside `conversion.md`, written by the chart from `source.md` only (never from `prd.md`, so the conversion cannot hide a gap): one row per applicable topic, `covered` with cited `source.md:<line>` quotes, or `absent`. Same pattern as `conversion.md`.
3. `S prd coverage <N>`: script check that every applicable topic has a row, every cited line exists and the quote matches (reuses the `prd map` machinery). Cheap, deterministic, no model needed for the check.
4. What happens to an `absent` topic, **without adding a question wave** (feedback 2 complained of 20 questions):
   - The top 4 by risk go into the *existing* gap-pass batch.
   - All of them are written to `client-gaps.md`: a plain document the person can send to the client ("your PRD does not say what happens when X"). That is the real fix, since the BA, not the developer, owns the answer.
   - An absent topic left unanswered becomes an `## Open questions` line, which already blocks `/rig:approve chart-N`; `/rig:waive` with a reason (e.g. "no model in this sprint") already clears it. No new approval machinery.
5. Eval before keeping (project rule): a synthetic agent-PRD fixture with known topics deleted. Metrics: recall of the deleted topics, false-absent rate on a complete PRD, questions asked per chart (must stay within the existing cap), cost delta.

## Change 2: provenance on every rule (colleague point 2)

Closed set of three origins, one per `AC` / `DR` / `NFR` / decision line:

- **client**: the line is mapped to a `source.md` sentence in `conversion.md`. Derived by script, not typed.
- **confirmed**: a named person answered at chart. Marker `(confirmed at chart by <who>)`, replacing `(answered at chart)`.
- **proposed**: the agent or the brainstorm supplied it. Marker `(proposed at chart)`, replacing both `(default at chart)` and `(decided at chart)`, including the "you decide" answers.

Script rule: a numbered line that is none of the three is an `unattributed` block finding. This turns "invented" from an evaluator opinion into a deterministic check.

Follow-through:
- `requirements.md` ledger gets an `Origin` column; intents, the test plan and the PR body show how many behaviours rest on `proposed` values.
- The chart's final message opens with a **Proposed by the agent** table (line, value, why), so the one review sees exactly what the client did not say.
- A `proposed` line becomes `confirmed` only by a person (`/rig:approve chart-N` approves the list as shown, or the person edits one line); the build and the PR review treat `proposed` rows as lower-trust and never silently tighten or change them.
- The design doc and ADRs carry the same tag on each decision, since that is where the brainstorm inventions live.

## Change 3: trust boundary, so a hand-edit finding can be classified (feedback 4)

I do not have the report for the single bug, so this is from the shape you gave me. If it needs a hand-edited data file, the question nobody answered is **"is the data file an input to the product?"**. The loader bugs of report 1 (reused, duplicate, negative ids) say yes; a bug that only exists after tampering says it depends. Today neither the PRD, the gap pass nor `edge-cases.md` asks.

- Add one core topic and one edge-case row, "state file trust", asked once at chart with the recommended option first: *app-owned* (hand edits unsupported; the app need not survive them) or *user-editable* (validated on load; any invalid content exits non-zero, names the path and changes nothing). The answer is recorded as a `DR`, `confirmed`.
- Findings from adversarial or journey runs get one more field, **reach**: `via the product's interface` or `needs tampering with state`. Triage (`tests/e2e/journey/triage.json`, the existing decision file) marks the second kind `out of contract` when the file is app-owned, and `bug` when user-editable. That answers "can it count as a bug" with a recorded decision instead of an argument.
- Note the trend: report 1 had three loader bugs, report 2 had three chart-origin bugs, this run has one. The checklist and ledger are working; this change is about the last class of finding, not a regression.

## Order, size, cost

| Step | Content | Notes |
|---|---|---|
| 1 | Provenance tags, `unattributed` check, ledger `Origin` column, chart summary table | Smallest, fully deterministic, no eval needed beyond specs. Migrate old markers in `/rig:upgrade`. |
| 2 | `prd-topics.md`, `coverage.md`, `S prd coverage`, `client-gaps.md` | Needs the fixture eval before it is kept. |
| 3 | State-file-trust topic + edge-case row, `reach` field in triage | Needs the bug report to confirm the diagnosis first. |

Three steps, each one change: implement inline, `npm test` once, one Opus review of the diff (CLAUDE.md budget: at most 4 subagent launches, about $8 each).

## Decisions I need

1. An unanswered `absent` topic: block the chart approval until answered or waived (recommended, reuses `Open questions` and `/rig:waive`), or only warn?
2. `proposed` lines: allowed at approval as long as they are listed (recommended; one gate stays one gate), or must each be confirmed individually?
3. Send me the one-bug report (or its text), so step 3 is built from the real finding rather than my reading of it.
