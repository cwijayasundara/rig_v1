# /rig:chart: the sprint outer workflow

Date: 2026-10-11. Status: draft for review.

## Problem

rig runs one change from intent to merge (the inner workflow). A team building a product sprint by sprint also needs an
outer workflow that rig does not have: a PRD per sprint, broken into intents with dependencies, an architecture that
evolves each sprint, and a test plan with cases and data traced to the PRD. Today `/rig:intent` captures one idea at a
time, intents carry no dependencies, the only architecture document is the wiki's as-built page, and tests exist only
per change.

## Decisions already made

- **Enforcement:** scripts enforce intent dependencies and the sprint gate only. Traceability is reported, never blocks.
- **Layout:** everything under `.rig/product/`; intents stay in `.rig/intent/`.
- **Commands:** one per role (`/rig:architecture`, `/rig:decompose`, `/rig:testplan`) plus `/rig:chart`, which runs all
  three automatically.
- **One human gate per sprint:** `/rig:approve chart-<N>` over every sprint-N artifact. No per-intent dependency override.
- **Inner workflow unchanged:** each intent still meets its own design gate. The chart approves *what*, design approves *how*.

## Flow

```
PO + BA write .rig/product/prd/sprint-N.md (templates/prd-format.md)       human
/rig:chart .rig/product/prd/sprint-N.md                                     one turn, no stops
  1. architecture + decompose   rig:architect, Opus, one launch
  2. testplan                   rig:architect, model sonnet, one launch
  3. sdlc.ts chart check N      script, 0 tokens
  4. at most one fix round      re-launch only the step that owns the gaps, then check again
  5. commit on branch rig/chart-N, open a PR (gh when present) with the check report in the body
◆ PO + architect + test lead review the PR; one of them runs /rig:approve chart-N   human
sdlc.ts inbox --ready → engineers run /rig:start .rig/intent/<x>.md                  inner workflow
```

Sprint 0: if `.rig/sensors.json` is missing, `/rig:chart` stops and prints
`/rig:init greenfield "<stack and goal from PRD §8 and §1>"`. Decompose always emits a `walking-skeleton` intent that
every other sprint-0 intent depends on (directly or through another intent). Sprint 1 onwards: the architect reads the
previous `architecture.md`, `.rig/wiki/architecture.md` (as built, when rig-brain is on) and PRD §12, and writes each gap
between intended and as-built as a `## Concerns` bullet with an owner (the format the design skill uses).

## Layout in a target repo

```
.rig/product/prd/sprint-<N>.md        frontmatter sprint: N; FR-<n> and NFR-<n> ids, stable across sprints
.rig/product/architecture.md          living; frontmatter sprint: N, updated: YYYY-MM-DD; ≤ 200 lines
.rig/product/adr/NNNN-<kebab>.md      status: proposed | accepted | superseded-by NNNN; never edited once accepted
.rig/product/testplan/plan.md         strategy, levels, environments, entry and exit criteria
.rig/product/testplan/cases.md        one table, format below
.rig/product/testplan/data/           fixtures and seed scripts; synthetic only, no real PII
.rig/intent/<kebab>.md                unchanged home, new optional frontmatter
```

New intent frontmatter, all optional (existing intents keep working):
`sprint: N`, `cluster: <kebab>`, `owner: <name>` (left empty by decompose unless the PRD names one; the lead fills it),
`depends: [a, b]` (inbox file names without `.md`), `prd: [FR-3, NFR-2]`. Lists are flow style on one line. `frontmatter()` returns
flat strings, so `chart.ts` adds `listField(value)` (splits `[a, b]` on commas, trims, drops empties) rather than changing
the parser every other reader uses.

`cases.md` table, one row per case:
`| ID | Requirement | Intent | Level | Data | Expected |` with `ID` = `TC-<n>`, `Requirement` = one or more FR/NFR ids,
`Intent` = an inbox name, `Level` = unit | integration | acceptance | api | perf | security | manual,
`Data` = a path under `testplan/data/` or `-`.

## Scripts

**`scripts/chart.ts` (new)**, imported by `sdlc.ts` and `inbox.ts`:
- `chartFiles(n)`: sorted repo-relative paths: `prd/sprint-<n>.md`, `architecture.md`, `adr/*.md`, every file under
  `testplan/`, and every `.rig/intent/*.md` whose frontmatter has `sprint: <n>`.
- `chartDigest(n)`: sha over `path\ncontent\n` of each file, in that order. Adding, removing or editing any of them makes
  the approval stale.
- `chartApproval(n)`: `approved | stale | missing`, from the latest `approvals.jsonl` row with `slug: chart-<n>`,
  `stage: chart`.
- `chartCheck(n)`: the trace report (below). Pure over the files read, so it is unit-testable.

**Trace report** (`sdlc.ts chart check <N> [--json]`, always exit 0 unless the PRD file is missing):
`uncovered` (FR/NFR with no intent citing it), `untested` (FR/NFR with no TC row), `unreferenced` (sprint intents with no
`prd:`), `unknownIds` (ids cited by intents or cases that the PRD lacks), `orphanCases` (TC rows naming a missing intent),
`missingData` (a `Data` path that does not exist), `deps` (missing targets and cycles, from `inbox.ts`), and
`changedSinceApproval` (paths whose content differs from the files hashed by the last approval: the approval row also
stores `files: [{path, sha}]` so this list can be computed).

**`scripts/inbox.ts`:**
- `InboxEntry` gains `sprint`, `depends`, `blockedBy: string[]` and `ready: boolean`.
- Accepted: an intent with `sprint: N` is accepted when `chartApproval(N)` is `approved` and its `status` is not
  `closed`; an intent without `sprint:` keeps today's `status: accepted` rule.
- `blockedBy`: each `depends` entry whose intent is not `shipped` (same rule as today: its change has a committed
  `ship.json` on HEAD); a missing file shows as `missing:<name>`; every member of a cycle gets `cycle:a→b→a`.
- `ready` = accepted, no change yet, `blockedBy` empty.
- `cmdInbox`: `--ready`, `--sprint N`, `--owner X` filters; plain output adds `blocked by a, b` and a header line
  `chart-N: approved | stale | missing` for each sprint present.
- `pendingIntents()` (rig-spec workflow) additionally requires `ready`, so CI never drafts a blocked or unapproved intent.

**`scripts/sdlc.ts`:**
- `new --source` refuses an intent that is not `ready`, naming why: `blocked by: a, b`, or
  `chart-N is stale: run /rig:approve chart-N after reviewing (changed: …)`, or `chart-N is not approved`. A stale chart
  blocks new starts only; changes already created are unaffected.
- `approve chart-<N>` (human-only, as every approval): refuses when the PRD is missing, when any chart file has an
  unresolved `## Concerns` bullet, or when `## Open questions` in the PRD or architecture is not `none`; appends
  `{slug: "chart-N", stage: "chart", by, at, digest, files}`; idempotent like the other stages. It is handled before
  `checkSlug`, since `chart-N` is not a change folder.
- `chart check <N>` as above.

The CI `human-approval` check already refuses approval rows a PR adds unless a code owner other than the author approves
the head commit; that covers chart rows with no change.

## Skills, agents and templates

| File | Purpose |
|---|---|
| `skills/chart/SKILL.md` | The orchestrator above. Argument: the PRD path; reads `sprint:` from it. Briefs ≤ 40 lines. |
| `skills/architecture/SKILL.md` | Architect alone: refresh `architecture.md` and ADRs from the PRD. |
| `skills/decompose/SKILL.md` | BA + architect: write sprint-N intents (≤ 40 lines each, the `/rig:intent` sections plus the new frontmatter). In `/rig:chart` it runs in the same launch as architecture. |
| `skills/testplan/SKILL.md` | Test lead: `plan.md`, `cases.md`, `data/` from the PRD and the sprint's intents. |
| `templates/prd-format.md` | The PRD template agreed in conversation (12 sections, FR/NFR ids, §12 changes since last sprint). |
| `templates/architecture-format.md` | `architecture.md` sections (context, containers and modules with dependency direction, data, integrations, NFR tactics mapped to NFR ids, deployment, ADR index, `## Concerns`, `## Open questions`) and the ADR format. |
| `templates/testplan-format.md` | `plan.md` sections and the `cases.md` table. |
| `skills/design/SKILL.md` | One added line: when `.rig/product/architecture.md` exists, give the architect its path and the TC rows whose `Intent` is this change's source; design.md should cite ADRs and TC ids it relies on (not checked). |
| `templates/readme-rig.md`, `README.md` | A "Path C: a team, sprint by sprint" section in the user guide; the command table gains the four commands. |
| `DESIGN.md`, `CHANGELOG.md` | The outer workflow row and the reasoning for one gate per sprint. |

Agents: no new agent. Architecture and decompose launch `rig:architect` with `model: opus`; testplan launches
`rig:architect` with `model: sonnet`. Decompose writes intents with `status: draft`; they need no per-intent acceptance.

## Verification

New `scripts/chart.spec.ts` and additions to `scripts/inbox.spec.ts`, each failing without the change:

1. `chartDigest` changes when a chart file is edited, added (a new sprint-N intent) or removed, and not when an intent of
   another sprint changes.
2. `approve chart-N` without `SDLC_HUMAN=1` fails; with it, writes one row; a second run adds nothing; it refuses with an
   unresolved concern or open question.
3. inbox: a sprint intent is not accepted before approval, accepted after, not accepted once a chart file is edited;
   an intent without `sprint:` follows `status:` as before (existing tests unchanged).
4. `depends` on an unshipped intent → `blockedBy`; after the dependency's `ship.json` is committed → `ready`; a missing
   target → `missing:x`; a two-node cycle → both blocked.
5. `inbox --ready`, `--sprint`, `--owner` filter correctly; `pendingIntents()` excludes blocked and unapproved intents.
6. `new --source` refuses a blocked or unapproved intent with the reason, accepts a ready one; an existing change is not
   affected by a later stale chart.
7. `chart check` reports each gap kind from a fixture PRD, intents and `cases.md`, and `changedSinceApproval` after an edit.
8. vendor copies the four new skills: `vendor.ts` already enumerates `skills/` and `vendor.spec.ts` walks the result, so
   no vendor change is needed; the spec asserts `rig-chart/SKILL.md` is among them.

`npm test` passes. A follow-up, not part of this change: an e2e phase P5 that charts sprint 0 and sprint 1 of the cart
PRD in a throwaway repo.

## Out of scope

Capacity planning, story points per sprint, automatic owner assignment, tracker sync (Jira and the like reference the
files), blocking on traceability gaps, and a per-intent dependency override.
