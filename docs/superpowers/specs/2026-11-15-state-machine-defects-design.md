# Catching state-machine defects: model verification, a mechanism gate, and a state-aware feature map

2026-11-15. Sources: the talk "All Code Is Slop (Except Mine)" (Lauren Tan, AI Engineer CODE 2026, official machine-generated transcript);
pstack's `create-formal-verification-skill` and `maintain-formal-verification-skill` (cursor/plugins); a secondhand summary of
Cindy Sridharan's "How to effectively debug when you no longer understand the code" (the article itself was not readable: Medium 403).
Applies with `docs/proposals/2026-11-14-implementation-order.md` and `2026-11-14-inner-loop-from-poteto-mode.md`.

## Intent and why

The maintainer wants fewer escaped defects on **state-machine bugs** (ordering, races, retries, lifecycle transitions) with rig on.
Tests rarely reach the interleaving that breaks these, and a reviewer cannot see them in a diff. Three small additions give rig-on a
way to catch them and a way to keep that check honest as the code changes:

1. **`/rig:model` and `/rig:model-sync`** (skills) with a **`model-drift`** built-in sensor: verify one risky property with a model
   checker or generated-input tests, and make staleness visible deterministically.
2. **A mechanism gate** in `plan-check` for `bugfix` changes: no fix without a written, falsifiable cause.
3. **A state-aware feature map**: extend what `/rig:app` already writes, so each feature can name its states and its model.

## Goals, non-goals, anti-goals

Goals: a state-machine defect that rig-on lets through today is caught at ci cadence or at plan; a verification that no longer matches
its code is reported, not silently trusted; zero new commands; about 150 script lines in total, none removed.

Non-goals: Lean or proof assistants; auto-fixing a failing model; a UI for counterexamples; an equivalence check for refactors (the
article's last point; deferred, `refactor` already runs red-proof in `green` mode); changes to the frozen rig-start workflow or the wiki.

Anti-goals (failure even if it works): an agent can weaken the property or move the confirmed commit to make a check pass; a model
that was never shown to fail on a broken variant counts as coverage; the mechanism gate becomes a keyword filter that agents satisfy
with boilerplate.

## Constraints

- Size: the harness is about 13,500 of 15,000 lines, and skill bytes are capped (`size` and `neutrality` specs). ~150 script lines fit.
- CLAUDE.md: a spec per item that fails without it; `npm run test:changed` only; e2e and evals run by a person.
- Fix the harness, not the generated code: nothing is hand-edited in a target repo.
- The order doc builds an item only after an eval shows a rig-on escape. The maintainer asked for this work first; this design records
  that as a **deliberate exception**, and adds a measure afterwards (see Verification).

## Approaches considered

Formal verification. **A** skills only: no script lines, but staleness depends on prose. **B** skills plus a `model-drift` sensor:
the sensor is deterministic and runs on every check, at about 80 lines (**chosen by the maintainer**). **C** FV as a chart or test-plan
step: lives in the frozen workflow, so rig-on never sees it; rejected.

Feature map. Recon found it already exists: `/rig:app` writes `.rig/verify/<app>/features/<feature>.md` with `entry:` lines, and
`scripts/app.ts:49-51` reports an `entry:` path that no longer exists. So a new map or a code-derived map (which would overlap W6's
dependency graph) is rejected; this design only extends the files.

Mechanism gate. Put it in `plan-check` (chosen: it runs locally and at CI from one function, `plancheck.ts`, and a CI recompute exists
already), not in a skill alone (not enforceable) and not in a new sensor (more registry surface).

## The design

### 1. Model verification

- **Skills** (text only, `skills/model/SKILL.md`, `skills/model-sync/SKILL.md`), ported from pstack with rig's wording: choose the
  strongest promise where a bug costs most and tests reach least; let the question pick the tool (TLA+ with TLC for ordering,
  a code-level verifier for memory or data-structure invariants, and when no verifier fits or Java is absent, generated-input property
  tests against the **real code**, not a hand-written model); show it fails on a broken variant before trusting it; report real bugs
  with counterexamples as short step lists and never weaken the property; state bounds and exclusions.
- **Record** `.rig/models/<id>.json`: `{ id, property, tool, covers: [globs], run: "<one command>", confirmedAt: "<sha>", breaksOn: "<how the broken variant was made>" }`.
  The model files live beside it (`.rig/models/<id>/`).
- **`model-drift` built-in sensor** (add to `BUILTIN_IDS` and `BUILTIN_DEFAULTS` in `registry.ts:10,26`; run in `sensors.ts`): for each
  record, if any file matching `covers` changed between `confirmedAt` and HEAD, report a finding naming the files and the id. Default
  cadence `commit`, `blocks: false` (a warning); a repo may set `blocks: true`. Reports a malformed record or a missing `run` as a block.
- **The model's own command** is an ordinary registry command sensor (`cadence: ci`, `blocks: true`) that runs `run`. No new runner.
- **Tamper protection:** `.rig/models/**` is a harness path (`harness-tamper`, `risk.alwaysHuman`): an agent cannot edit a property or
  move `confirmedAt`; a person confirms through `/rig:model-sync`'s handover, as `/rig:rule` hands over `.rig/rules.json`.

### 2. Mechanism gate

For a change whose type is `bugfix` (`lifecycle.ts:11`), `planCheck` in `plancheck.ts` blocks unless `spec.md` has:
- `## Mechanism`: one sentence of the form "X causes Y because Z" (must contain `because`), with none of the hedge words
  `presumably`, `probably`, `likely`, `seems`, `maybe`, `in practice`, `looks equivalent`; and
- `## Falsified by`: a non-empty line naming an observation that would disprove it.
If the mechanism names state or ordering (`race`, `retry`, `order`, `state`, `concurrent`, `timeout`, `lifecycle`), a warning asks for a
`model: <id>` line pointing to `.rig/models/<id>.json`, or `model: none - <reason>`. Mitigations (bounds, retries, caches) are not a
mechanism: the skill text says so. `/rig:start`'s bugfix path states the order: reproduce, mechanism, falsifier, fix, fail-first.
Anti-gaming: the gate checks shape only; the CI AI review and the person still read the sentence (the check does not claim it is true).

### 3. State-aware feature map

Optional lines in a feature file: `states: a, b, c` and `model: <id>`. `app.ts` extends the existing stale-`entry:` check: a `model:`
id must exist in `.rig/models/` (block), and a feature with no journey step naming it gets a warning (~20 lines). `/rig:app` text
tells the agent to ask for the states when a feature has a lifecycle.

### Calls I made after the builder check (mark in the plan; overrule if wrong)

- **Broken-variant evidence.** `breaksOn` stays prose, but `model-drift` also requires the broken variant to exist as a file
  `.rig/models/<id>/broken.*` and blocks when it is missing. `/rig:model` must run `run` against it and show the failing output at
  handover. This is a deterministic floor (the artifact exists and is covered by the record), not proof that it fails; the person and the
  PR review see the failing run. A stronger check (the sensor re-running the broken variant) is deferred.
- **Creating the first record.** The agent writes `.rig/models/<id>.json`, the model files and the registry sensor entry on the
  change branch with Write and Edit. Because `.rig/models/**` is an `alwaysHuman` path, the PR needs a person's approval, which is
  the confirmation; the skill never edits `confirmedAt` to a commit that has not been through that PR. The builder confirms against
  `sensors.ts:253-261` that a Write/Edit creation is not blocked and only out-of-band or weakening changes are.
- **Unreachable `confirmedAt`** (rebase, squash, shallow clone): treated as stale, a warning that names the id and says to re-confirm
  via `/rig:model-sync`; never an error and never silently fine. One spec fixture covers it.

## Left to the builder

Exact regexes and hedge list placement; how `plancheck.ts` reads the change type; the TLA+ and property-test templates inside the
skills; the file layout for models; Java-absence detection; spec fixtures. Builder's calls are marked in the plan.

## Verification

Specs that fail without each change (`scripts/*.spec.ts`): `model-drift` fires on a covered-file change after `confirmedAt` and not
otherwise; a bugfix `spec.md` with no `## Mechanism` or a hedge word blocks, a good one passes; a `model:` id that does not exist
blocks. Run `npm run test:changed`; say, in one line, that the person should run the eval.
Measure afterwards (person-run, costs money): a `state` trap variant (a lifecycle or retry bug that unit tests pass) on rig-on, 3 runs.
Keep the model path only if rig-on then catches the trap that it let through before; otherwise cut it. This is the order doc's escape
rule applied after the build instead of before, which the maintainer asked for.

## Order

One branch, one plan, one PR (W5b): the mechanism gate first (smallest, no new surface), then `model-drift`, then the skills,
then the feature-map lines. At most 3 subagent launches; no review unless asked.
