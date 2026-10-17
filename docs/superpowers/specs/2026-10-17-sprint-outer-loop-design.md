# Sprint outer loop: from a large PRD to traced, sized, buildable intents

Date: 2026-10-17. Status: draft for the person's approval. Goal context: `docs/GOAL.md`. Research: `docs/research/2026-10-17-findings.md`.
This is project A of three (A outer loop, B codebase index kept fresh, C learning loop). B and C get their own designs.

## 1. Intent

A team ships a product sprint by sprint. Each sprint starts with a large PRD. Today rig covers one change from intent to merge; nothing
turns a PRD into the work that feeds it. The harness (rig, on top of Claude Code) must let the people in four roles do this, with
every artefact traced to a PRD requirement and every claim measurable:

1. **Architect** gives the harness the PRD and gets a list of smaller intents, and updates the product's design and architecture for it.
2. **QA lead** gets a test plan, test cases and test data from the same PRD and the same intents.
3. **Engineers** pick up one intent each, write a mini design, then code, tests and regression, and raise a PR.
4. A person approves the set once before engineers start.

Why now: the single-change loop and its sensors exist and work (registry, contracts, sync, lifecycle, evaluator, eval runner). The outer
loop was cut on 2026-10-16 as an "invention" with no measurement behind the cut. It is the largest gap with no native Claude Code answer
and no competitor that checks requirement-to-task-to-test traceability by machine (research §2, §1).

## 2. Goals, non-goals, anti-goals

**Goals**
- G1. Every intent traces to at least one PRD requirement; every PRD requirement is covered by an intent and a test case. A script checks this, with no model call.
- G2. Every intent is small: an engineer finishes it (code, tests, regression, PR) in 1 to 2 days. A sprint is 10 days.
- G3. Each intent has a brief that states what the hidden acceptance (the QA cases and the contract checks) will test, so the engineer's agent needs no guessing.
- G4. The architecture document reflects the PRD after the architect's pass, with each change explained.
- G5. Everything is measurable: coverage, intent size accuracy, rework, cost, and the quality of the generated chart against known answers.
- G6. As thin as possible: native Claude Code for orchestration, plan mode, review, memory and CI where it covers the job; small deterministic scripts for what it does not.

**Non-goals**
- Capacity planning, story points, automatic owner assignment, tracker sync (Jira, Linear; reachable later through MCP).
- The code index and wiki (project B) and the learning loop (project C).
- Changing the single-change lifecycle (`start`, `plan`, `build`, `test`, `pr`), except for the links in §7.

**Anti-goals** (a failure even if it technically works)
- An intent that traces to no requirement, or invents scope the PRD never asked for.
- A harness the architect has to fight: a long form to fill, or an approval that goes stale on trivial edits.
- Briefs so long that writing them costs more than the build.

## 3. Constraints

- Build on the current registry, contracts, sync and lifecycle (`scripts/registry.ts`, `contracts.ts`, `sync.ts`, `lifecycle.ts`, `sdlc.ts`); core scripts name no language or tool (`neutrality.spec.ts`).
- The person chose: artefacts live under `.rig/product/`; own eval runner (`eval/`), not `claude plugin eval`.
- New code stays small. The person raised the harness cap in `scripts/size.spec.ts` from 3,900 to **5,000 lines** (it stands at 3,869). This project's budget is about 800 lines across scripts, 2 skills, the architect agent and templates (old chart layer: about 450 script lines plus about 160 template lines); the rest of the headroom is for projects B and C and the gaps in `docs/research/2026-10-17-playbook-gap-analysis.md`. The per-file limits (scripts 500, skills 60) stay.
- Hooks: no new hook events. Reuse model recording (`agent-launch`/`agent-done`) to record architect and QA launches.
- Only a person approves (`SDLC_HUMAN=1`, existing human-only approve mechanics).

## 4. Roles and flow

```
PO + BA     write .rig/product/prd/sprint-N.md                                        (human, template)
Architect   /rig:chart <prd>      one turn, no stops
              1. architect agent (Opus): intents + brief per intent + architecture.md + ADRs
              2. chart check N    (script, 0 tokens): trace and size rules
              3. at most one fix round for the step that owns the gaps, then check again
QA lead     /rig:testplan N      QA agent (Sonnet): plan.md, cases.md, data/ from the PRD and the intents
              chart check N again (adds the test-case rules)
Architect + QA lead + PO review; one of them runs /rig:approve chart-N                 (human gate, once per sprint)
Engineer    /rig:next            lists ready intents (approved, dependencies shipped, no change yet)
            /rig:start .rig/product/intents/<slug>.md  -> plan (mini design) -> build -> test -> pr   (existing lifecycle)
Anyone      rig chart report N   live trace and progress report for the sprint
```

Sprint 0 / greenfield: if `.rig/sensors.json` is missing, `/rig:chart` stops and prints the `/rig:init greenfield "<stack and goal>"` line. The decompose step always emits a
`walking-skeleton` intent that every other sprint-0 intent depends on. Sprint 1 onward, and any brownfield repo: the architect reads the
previous `architecture.md`; where no architecture document exists yet it reads the code with read-only `Explore` agents (haiku) until project B supplies the index.

Native Claude Code does the rest: skills and the `Agent` tool for orchestration, plan mode for the engineer's mini design, `/code-review` and the existing `evaluator` for the PR,
`/goal` for unattended builds once a plan is approved, GitHub Actions for CI.

## 5. Artefacts (all under `.rig/product/`)

```
prd/sprint-<N>.md          PO + BA. frontmatter sprint: N. Requirements FR-<n> and NFR-<n>, stable across sprints. Template: recover from `git show 8e2f3df:templates/prd-format.md`.
brief.md                   the living product brief (existing template `templates/brief.md`): context, non-goals, architecture, constraints, interfaces.
architecture.md            living, at most 200 lines, frontmatter sprint/updated. Ends with `## Concerns` (gaps with owners) and `## Open questions`.
adr/NNNN-<kebab>.md        status proposed | accepted | superseded-by NNNN; never edited once accepted.
intents/<slug>.md          one brief per intent (§6).
testplan/plan.md           strategy, levels, environments, entry and exit criteria.
testplan/cases.md          one table, one row per case (§8).
testplan/data/             fixtures and seed scripts; synthetic only, no real personal data.
```
Templates for architecture and test plan: recover from `git show 8e2f3df` (templates added by that commit). Frontmatter is flat strings; lists are flow style on one line.

## 6. The per-intent brief

An intent file is the brief for one small piece of work, in the shape of Jain's application brief but holding only what that intent adds
(his full brief is about 2,000 words for a whole service; ours is a slice, typically 40 to 100 lines).

Frontmatter: `sprint: N`, `prd: [FR-3, NFR-2]`, `depends: [slug, slug]`, `estimate_days: 1 | 2`, `kind: boundary | internal`, `owner:` (left empty), `status: draft`.

Sections: `## Intent` (why, who, what done looks like), `## Non-goals` (prohibitions, as in the product brief), `## Interfaces` (the interface this intent adds or changes), `## Behaviours`, `## Tests required`.

- **Behaviours** are numbered `B1`, `B2`, … within the intent, one per line, stated from outside the system, each ending with the requirement it serves: `- B1 (FR-3): …`.
- **`kind: boundary`** (the intent adds or changes an HTTP, message or downstream interface): `## Interfaces` names the contract file and the example files it adds or edits, with exact statuses, headers and numbers, as Jain's brief does. These files are contract files, so they freeze at plan approval (existing behaviour).
- **`kind: internal`**: `## Interfaces` may be `none`; behaviours and tests are enough.
- The chart's decompose step drafts the brief; the engineer refines it in `/rig:start` and `/rig:plan` within the intent's non-goals. Changing a behaviour's requirement citation after the sprint approval makes the chart stale (§7).

## 7. Traceability: the chain and the rules

Chain: **FR/NFR → intent → behaviour (`slug#B1`) → test case (`TC-n`) → test (named or commented with the behaviour number, existing `traceability` sensor) → verify.json**.

`rig chart check N [--json]` is a pure script over the files. Exit 0 except when the PRD is missing. Findings are `block` (stops approval) or `report`.

| Rule | Severity |
|---|---|
| An intent cites no requirement (`prd:` empty or any behaviour without a requirement) | block |
| An intent or behaviour cites an ID the PRD does not define | block |
| A requirement has no intent | block |
| A requirement has no test case | block |
| A test case cites no requirement, or names a missing intent or behaviour | block |
| A test case's data path does not exist | block |
| An intent's `estimate_days` is missing or above 2 (split it) | block |
| `depends` names a missing intent, or forms a cycle | block |
| A `kind: boundary` intent names no contract file or no example | block |
| `## Concerns` has an unresolved bullet, or `## Open questions` is not `none` (in the PRD, architecture or intents) | block |
| Sum of `estimate_days` for the sprint above 10 per engineer-slot declared in the PRD (`engineers: n`) | report |
| A behaviour has no test case yet, or an approved behaviour has no test in the repo yet (progress) | report |

`/rig:approve chart-N` (human-only): refuses while any `block` finding stands; writes `{slug: chart-N, stage: chart, by, at, digest, files}` to the approvals log. The digest covers
the PRD, `architecture.md`, `adr/*`, `testplan/*`, every `intents/*.md` of sprint N and the contract files they name, so editing any of them makes the approval stale.
CI's existing `human-approval` check already refuses approval rows a PR adds unless someone other than the author approved the head commit.

**Links into the existing lifecycle**
- `S new --source <intent file>` refuses an intent that is not ready: blocked by an unshipped dependency, chart not approved, or chart stale. A stale chart blocks new starts only; started changes continue.
- `/rig:start` copies the intent's behaviours into the change's `spec.md` (same B-numbers). A sync check fails when `spec.md` drops an intent behaviour or adds one with no requirement. Behaviours the engineer adds must cite a requirement already in the intent's `prd:`; otherwise the engineer raises it to the architect (the intent file is edited, the chart goes stale, a person re-approves).
- An intent is shipped when its change has a committed `verify.json` and the PR has merged; `depends` and `rig next` read that.

ID scope: B-numbers stay per change (the current `traceability` sensor reads them per change); chart-level references use `slug#B<n>`. The builder confirms this against `sensors.ts` before building and records any collision it finds.

## 8. Test plan, cases and data

`cases.md` row: `| ID | Requirement | Intent | Behaviour | Level | Data | Expected |` with `ID` = `TC-<n>`, `Level` = unit | contract | integration | acceptance | api | perf | security | manual, `Data` = a path under `testplan/data/` or `-`.
`plan.md` carries strategy, environments, entry and exit criteria, and the regression scope. The QA agent writes the cases from the PRD and the intents, so cases and the engineer's unit tests
meet only at the behaviour number. Contract-level cases reference the example files of the matching `boundary` intent, so Jain's contract tests, QA cases and the engineer's checks share one source.

## 9. Agents and skills (thin)

- `agents/architect.md` (restore from `git show d3c7fb6^:agents/architect.md` and shrink): model `claude-opus-5-5`, tools Read, Grep, Glob, LSP, Write, Edit. Used for decompose + architecture.
  The QA step launches the same agent with `model: sonnet`; the model-recording hooks warn if a launch's resolved model differs from its role.
- Skills: `skills/chart/SKILL.md` (architect command) and `skills/testplan/SKILL.md` (QA command), plus a `next` command in `sdlc.ts`. The old `decompose` and `architecture` skills fold into `chart`. Briefs to agents at most 40 lines.
- `scripts/chart.ts` (digest, approval state, trace report, readiness) and a few lines in `sdlc.ts`, `lifecycle.ts`, `sync.ts`. Recover logic and tests from the commits listed in §14, then adapt to the registry; do not copy the old tier or state-machine parts.
- Templates: `templates/prd-format.md`, `architecture-format.md`, `testplan-format.md`; extend `templates/brief.md` into `templates/intent-format.md`.

## 10. Measurement (G5)

Run-time, from the files and git, with no new telemetry:
- **Coverage:** requirements covered by intents, by test cases, by tests that exist, by tests that pass; untraced intents (must be 0 after approval).
- **Size accuracy:** per intent, `estimate_days` against actual (the change folder's creation to merge, from git timestamps), reported per sprint.
- **Rework:** times the chart went stale after approval; behaviours added or removed per intent between chart approval and merge.
- **Cost:** tokens and dollars of the chart run (`claude -p --output-format json` fields), per step.

Eval (in `eval/`, own runner, extending the existing arms):
- **Chart-quality task:** two or three sprint PRDs with a known answer key (requirement list, a valid decomposition, dependency edges). Score: requirement recall, **invented-intent rate** (intents whose behaviours cite nothing the PRD requires), size-rule compliance, dependency-cycle correctness, plus cost.
- **Arms:** Opus architect vs Sonnet architect; with vs without the per-intent brief. For the second, build the generated intents on the shop app and compare accepted rate and cost per accepted intent against the existing single-brief arm.
- **Rule** (spec 2026-10-16 §9): a part that shows no lift after two passes is a candidate for removal. Honest limit: with about 10 runs per arm and one task family, results are weak evidence.

## 11. Tests

- Specs (`npm test`): `chart.spec.ts` covers the digest changing on any chart file edit, add or remove (and not for another sprint's intent), approval refusing without `SDLC_HUMAN=1`, refusing with a block finding, being idempotent; each rule in §7 fails on a fixture and passes when fixed; `depends` and readiness; `new --source` refusal reasons; the spec/intent sync rule; vendor copies the new skills.
- E2e: a new stage that charts a sprint PRD for the shop app (scripted driver, free), asserts the trace report, approves, starts one intent, and sees the chart go stale when an intent is edited. A live run belongs to the eval pass.

## 12. Decisions made by the person

- Order: outer loop first, then index and learning loop. Artefacts in `.rig/product/`. Own eval runner.
- Everything measurable and traced to the PRD; an intent is at most 2 engineer-days; a sprint is 10 days.
- A brief for every intent.
- Everything runs inside rig and Claude Code.

## 13. Calls I made (check these)

- The per-intent brief is a slice with `kind: boundary | internal`, and full contract files only for boundary intents.
- Intents live in `.rig/product/intents/`; the old `.rig/intent/` inbox is not restored.
- Hard limit of 2 days is enforced as a `block` finding on a model-made estimate; estimates are checked against actuals afterwards.
- The sprint capacity sum is a `report` only.
- One approval per sprint (not per intent); engineers keep their own plan approval per change.
- B-numbers stay per change; chart-level IDs are `slug#B<n>`.
- Two skills (`chart`, `testplan`) and one restored agent, `architect`.

## 14. Left to the builder

File layout of `chart.ts`, exact frontmatter parsing, the PRD, architecture and test-plan template wording, the fixtures for the eval answer keys, and how to render `rig chart report`.
Recover from history: `06d2c48` (chart core), `e5252d1` (inbox readiness and `depends`), `bb456ee` (trace report, `--source` refusals), `8e2f3df` (templates), `0d80562` (skills), `d5835ec` (review fixes for `/rig:chart`, worth reading first), `4244194` (the deletion).

## 15. Open items

- Whether the old inbox's `--ready/--sprint/--owner` filters are worth restoring or `rig next` alone is enough.
- Where `engineers: n` (for the capacity report) is declared; the PRD frontmatter is the default.
- Project B must provide `.rig/wiki/` (or equivalent) as the architect's as-built input; until then `Explore` agents read the code.
