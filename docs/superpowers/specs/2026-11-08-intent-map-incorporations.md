# Intent map incorporations from the PDD trial and the 2026 verification literature

Date: 2026-11-08. Status: built (all eight items; plans `../plans/2026-11-08-intent-map-incorporations-wave1.md` and `-wave2-3.md`). Item 2 runs as `intent-recheck`, a step of the `rig-maintain` workflow template (opt-in `RIG_INTENT_RECHECK`), not a separate workflow file. Builds on `2026-11-07-intent-map-design.md` (built, merged).
Evidence base: the Verus-only trial at `../pdd_kit_research_v1.0/trial/` (protocol, mutants, smoke
lesson), the survey note `../pdd_kit_research_v1.0/research_notes/PDD kit trial plan/related_work_formal_plus_empirical.md`,
and a read of `scripts/intentmap.ts` + `eval/fixtures/intent-map/login/`. Nothing here re-opens a
non-goal that the base design set deliberately (no quiz chrome, no pictures, no reviewer agents).

## What the base design already covers (no action)

Frozen approval with `harness-tamper`; both-ways as a named decision; planted bugs per clause with
`unmutated`/`vacuous`; "evidence, not proof" receipt wording; `prune` for tests that only restate a
clause; `spec.md` Behaviours projected from the map; opt-in per change. These match the published
PDD Kit flow point for point — the gaps below are the residue.

## Incorporations

### 1. Adjudicated survivors — a surviving mutant is a finding with three exits, not two

Today `m.holds === true` → `vacuous`, ship blocked (`scripts/intentmap.ts:134`). But the trial's
toolchain check hit the third case first: `>=`→`>` survived *correctly* — the mutant is not a bug.
Equivalent mutants are unavoidable in mutation testing; an agent that plants a lazy "bug" (a
statement reorder that commutes) produces a false alarm today and learns nothing recorded.

Change: `Mutant` gains an optional adjudication, stored in `.rig/changes/<slug>/adjudications.json`:
`{ "<mutant id>": { "verdict": "non-bug" | "clause-vacuous", "because": "<one line>", "by": "<approver>" } }`.

- `non-bug` + approver → no finding; receipt shows `adjudicated non-bug` with the reason.
- `clause-vacuous` → finding stays, and the *only* fix is a new approval of a repaired clause
  (`harness-tamper` already blocks the quiet edit).
- No adjudication → `vacuous`, as today.

Rule id: reuse `vacuous` with the adjudicated branch; no new sensor id needed. A person approves the
adjudication — same bar as a waiver. **(my call)**

### 2. The receipt has a shelf life — re-run the frozen checks on main

Empirical rows are recorded against a commit (`E1` → `8b8b70f`) and the formal command is frozen in
the map, but nothing re-runs either after ship. Dependency upgrades change trusted components
(bcrypt verdicts, jwt defaults, sqlite behaviour); refactors move files. PDD Kit's `pdd-ship` exists
for exactly this — Verus in CI — and [arXiv:2610.36328](https://arxiv.org/abs/2610.36328) shows
verified-code guarantees breaking under refactors.

Change: a scheduled (weekly, CI) `intent-recheck` that, for every change under `.rig/changes/` whose
map is on `main`, re-runs the frozen formal command and the pinning commands of empirical rows, and
opens a tier-1 finding on drift. No map edit, no approval change — the map stays frozen; only the
world moved. **(my call)**

### 3. The formal column must bind to the shipped code, not a side copy

Known gap in the base design: the formal checker is written during build and only its command line
is frozen. A checker that imports a restatement (`model.py` rewritten to match the bug) produces
verdicts about the tool, not the code — surface B of
[arXiv:2611.05590](https://arxiv.org/abs/2611.05590) (99.1% verifier acceptance, 1.9% binding).

Change: rule `formal-targets-diff`. Grid mode: `model.py`/`run.py` must import the clause-bearing
symbols from files this change touches (resolve the import; compare paths with the diff). Command
mode: the frozen command line must name a file in the diff. A checker whose target resolves outside
the diff → `formal-failed` with that reason. Cheap: one import-resolution check in
`intentmapio.ts`. **(my call)**

### 4. Trusted-boundary completeness — every clause dependency is pinned or named

The map's formal clauses lean on `check_password`, the lookups, the signer, the clock. PDD Kit signs
per-piece trust cards; the trial froze six (D6) and pinned each with a test (`trusted_boundary.rs`,
10 tests). Today the map lists what is not promised (N1) but nothing requires the trusted set to be
enumerated or pinned.

Change: a `## Trusted` section — one row per wrapper: name, one-line contract, pinning command.
Rule `trusted-unpinned`: a formal row whose clause text names a symbol that appears in no row and no
Trusted entry. The login fixture gains E1/E2 (already there) plus Trusted rows for lookup, signer,
clock (the trial's exact six). **(my call)**

### 5. One-way decisions need a recorded reason

The base design's grill can ask the both-ways question; the durable record only shows `both-ways`
when present. PDD Kit's point is that an agent left alone picks one direction *silently* — the fix
is not forcing both ways, it is forcing the choice to be *said*.

Change: rule `one-way-unjustified` at plan time: a formal row whose decision is not both-ways and
whose D-line lacks `one-way-because: <sentence>` fails the plan gate. The login map would carry
`D2: one-way-because: the words only promise refusal, not success` for the refusal row. Skill +
oracle change, two lines each.

### 6. Back `intent-results.json` with the run ledger (closes known gap 1)

A hand-written `pass` is possible today. `evidence/runs.jsonl` already records formal runs; extend
`intent-record` to write a `run` id into each result, and add rule `result-unbacked`: a ship-time
`pass` whose `run` id is absent from `runs.jsonl`, or whose command/commit differ from the ledger
line, fails closed. No hashing of results into the approval (keeps decision 5 of the base design). **(my call)**

### 7. A sampled-evidence tier between scenarios and CrossHair

GWT scenarios are concrete; CrossHair is every-input but heavyweight and Python-only. The trial's
recommendation for dynamic stacks sits between: hypothesis/fast-check property suites over the pure
core. Change: an optional `## Property command` section, same freeze/record mechanics as the formal
command, receipt label `(evidence, sampled, not exhaustive)`. This keeps the honesty ladder explicit:
grid = every modelled input; property = every generated input; scenario = the named case. **(plan time)**

### 8. Mutant completeness per clause (closes known gap 4)

`formalFindings` reads only the last mutant of a clause. Change: `mutants.json` entries group as
`{ clause, bugs: [{id, ...}] }` (or keep flat and check all); every mutant's verdict is read; the
receipt lists each. `unmutated` fires only when a clause has zero. Distinct ids enforced; duplicate
`holds` contradiction (one clause both holds and not) is `formal-failed`.

## Deliberately not proposed

- Flowchart/mental-model pictures in the map — the base design's non-goal stands; a plan skill may
  still print a mermaid of clause outcomes in the PR body (generated, unchecked, not frozen).
- Decision-card UI, quiz, reviewer agents — unchanged.
- CrossHair as a dependency — stays opt-in per map via the formal command line.

## Order of attack

1 and 6 close real escape hatches (false alarm, false pass) with small diffs — first.
3 is the anti-side-copy backstop before the lift arm measures anything — second.
2, 4, 5 ride along; 7 and 8 last. Dogfood all of it through rig's own `/rig:start` with the login
fixture as the first map, and let the lift arm decide whether the map earns its cost.
