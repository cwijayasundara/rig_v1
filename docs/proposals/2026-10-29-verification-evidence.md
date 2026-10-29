# Verification evidence: measure the reviewer, show the proof, add a non-model layer

Status: agreed 2026-10-29 (decisions at the end). Item 1 built and run twice (results in eval/results/2026-10-29-review.md) and item 4 built, on `feat/verification-evidence`.

## The ask

> Verifying the agent generated code is the major challenge in AI SDLC right now. Explore both and recommend if we can
> improve further on this aspect which is critical.

Sources:
- Talk: *How Anthropic Merges 30,000 Code Changes a Day*, Manish Kapur (Sonar) and Addy Osmani (Anthropic), AI Engineer,
  2026-10-28 (youtube AnsXWH2_EBU). Read from its chapters and description only: the transcript download was rate-limited.
- Osmani's X post (status 2114604912520921136) points to *Solving code review at Anthropic*, already read in full and built as
  `docs/proposals/2026-10-27-risk-tiered-review.md`.
- Osmani, *Software factories* (addyosmani.com/blog/software-factories): lights-on vs lights-out loops.
- Willison, *Redesigning source control at Anthropic* (2026-10-13): adversarial review is effective but "myopic"; engineers
  steer Claude away from over-engineering against hypothetical concerns.
- Sonar, *State of Code* survey (2026-01): 96% of developers do not fully trust AI-written code, 48% always verify it.
  Vendor survey; Sonar sells verification tooling.

## What the talk adds to what rig already built

The risk-tiered review proposal covered the article's seven layers (finders + verifier, tiers 0/1/2, always-human paths, PR
Risk / How to revert, revert circuit breaker, reverts as eval cases). The talk adds three points:

1. First-pass review by Claude is "backed by real verification evidence": the reviewer and the person read proof, not a
   claim that checks passed.
2. Every loop needs independent, multi-layered verification: not one model checking another model's work.
3. Adversarial review can be myopic (Willison): findings against hypothetical concerns push over-engineering.

## Where rig stands

| Point | rig today | Gap |
|---|---|---|
| Measuring the reviewer | `eval/review.mjs`, 6 cases; last run (`eval/results/2026-10-21-review.md`) 100% recall in both arms | **saturated: it cannot tell a better reviewer from a worse one**, so every reviewer change since (Opus evaluates Sonnet, tier escalation, brief edits, the parked finder/verifier split A2) went in unscored |
| Myopic findings | "Fails when" evidence in the brief; a dismissed finding raises the tier | one clean control, so false findings on a correct change are barely measured |
| Evidence | `prbody.ts:31` `## Evidence` is one line: `verify: pass on tree X` | no red-then-green output per B-number, no e2e summary, no mutation survivors |
| Independent layer | lint, types, duplication, layers, mutation-diff (deterministic) | correctness and security are judged by models only (`/security-review`, CI ai-review) |
| Live data | tiers, breaker, revert mining built | never run with `risk.enforce` on; the breaker has no data |

## Proposal

### 1. A review eval that discriminates (first)

1a. **Hard cases.** Defects a careful reviewer catches and a skimming one misses:
- cross-file: the change is correct in the file it touches and breaks a caller it does not touch;
- missing edge case: a new method whose spec names an edge the code and its test skip;
- test weakened to match: the builder edits an existing test so a spec-breaking change passes;
- stale state: a cache that is never invalidated, caught only by reading two methods together.

1b. **Bait controls.** Correct changes in places that invite hypothetical concerns (a new discount code, a new read
endpoint). Any finding on a control is a false one: this measures Willison's myopic failure directly.

1c. **The reviewer sees the whole (small) source tree**, as a reviewer with tools would; cross-file cases need it.

1d. **Arms by model.** `--models a,b` and `--arms clean` so Sonnet against Opus, and later one reviewer against finders +
verifier, score on the same cases. The report splits recall into easy and hard and counts false findings on controls.

1e. Later, each behind its own evidence gate: a reviewer with tools that runs the tests; a long real builder transcript
for the same-context arm; real reverts from shop_app (C3's `/rig:learn` mining) as cases.

Gate: a live run (a person starts it: 12 cases x 2 models x 3 runs = 72 calls, roughly $6-8, capped by `--max-usd`) must show the hard cases below 100% for at
least one arm. If both models catch every hard case, the cases are still too easy: make them harder before using the
eval to decide anything.

Result (2026-10-29, `eval/results/2026-10-29-review.md`): gate not met. Sonnet and Opus both caught 100% of the hard
cases and raised 0 findings on the three clean controls; Opus cost twice as much. The cases are too small and too
spec-explicit. Rows now keep the review text.

Real-code cases (built 2026-10-29, `eval/review/cart-cases.mjs`, `--base cart`): shop_app at 26f1105 (about 900 lines of
Python with tests; smaller than the "thousands" first planned, but real agent-written code) and its next change, cart-cli,
with its real intent and 15-behaviour spec. A correct cart-cli (262-line diff) and a handler refactor are the controls; six
cases each seed one bug the builder's tests still pass: except-clause order (B13/B14, tests loosened to `!= 0`), `environ or
os.environ` reading the real environment, `--file ""` silently ignored, trimming in the CLI, a catch-all `except
Exception`, and an optional subcommand that crashes. A spec runs a Python probe per case to prove each bug is real.
shop_app has no reverts yet, so none are mined.

Result of the real-code run (2026-10-29, second section of `eval/results/2026-10-29-review.md`, $5.36): every catch audited
from the review text is the seeded bug. Five of six cases were caught in every run by both models; `--file ""` was seen in
all 6 reviews but filed as a finding only once (Opus), the rest deferred, because the spec is silent on empty values. One
marginal false finding (Sonnet, 1 of 6 clean runs). The gap that showed was outside the scoring: an unseeded
raise-after-commit in shop_app `storage.py` (`_fsync_directory` after `os.replace`), which Opus raised in 17 of 24 reviews
and Sonnet in 6. Decision: seeded single-bug recall no longer separates the models, so stop making seeded cases harder.
Next eval step, if any: score pre-existing bugs in the code around a diff. Item 2 goes ahead now.

Branch review (Opus, 2026-10-29) fixes: the e2e-stacks CI job installs Semgrep (with `CI=true` the sast sensor blocked
every stack's good edit); `/rig:upgrade` holds `sast` back while the team's workflow does not install Semgrep; outside CI
a Semgrep scan error other than findings (offline, rules not loaded) prints the "CI scans this change" line instead of
blocking; the cart pytest checks skip by name; the dry runner is handed its case; the per-case table counts defects for
multi-defect cases; the spending cap stops the loop and still prints the summary. Known limit, not fixed: `{changed}` is
whole files, so a pre-existing Semgrep finding in a touched file blocks the change (`--baseline-commit` needs the PR's base,
which sensors are not given today); a timed-out call does not count toward `--max-usd`.

### 2. Evidence, not claims, in the PR body

`prbody.ts` `## Evidence` lists per B-number: the test that failed before the change and its failure line, the same test
passing on the head tree, the e2e stage summary, and mutation-diff survivors. The review brief asks the reviewer to flag a
B-number with no evidence. Builds on the queued "red-proof failure content" item.

### 3. Live run in shop_app

`/rig-upgrade`, then a change with `risk.enforce` on, so tiers and the breaker produce data before any tier-0 merge.

### 4. Semgrep as the non-model layer

A `sast` sensor in every stack pack, at `commit` cadence (so also in CI), blocking:
`semgrep scan --config p/default --error --metrics=off --disable-version-check --quiet {changed}`.

- `{changed}` scans only the change's own source files, so old code never blocks a change and no baseline is needed.
- The guard is `semgrep --version`, not `command -v`: a broken install (seen on the owner's machine: a Python dependency
  clash) crashes with exit 1, the same code as a finding. Locally a Semgrep that does not run is skipped with a message;
  in CI (`$CI` set) it fails, so a PR is never passed unscanned.
- `rig-check.yml` runs `pipx install semgrep==1.182.1` before the sensors; the pin makes a rules-engine update a reviewed change.
- `--metrics=off` keeps usage data off Semgrep's servers; `p/default` is fetched from the registry at scan time (a team may
  point `--config` at a local ruleset instead).
- Existing repos get it from `/rig:upgrade`, which proposes any pack sensor the repo's `sensors.json` lacks.
- A `nosemgrep` comment is a suppression: the `suppression` sensor blocks it unless it carries a reason, like `eslint-disable`.

## Not copied

- Labelling agent-written PRs: every rig PR is agent-written.
- Nightly review of old code: a candidate lights-out loop once the breaker has data.
- SonarQube: Semgrep is free, CLI-first and runs in the sensor shape rig already has.

## Order

1 (eval) → 4 (Semgrep, small, independent) → 2 (evidence) → 3 (live run, the person starts it).

## Decisions (2026-10-29)

1. Start with item 1.
2. The non-model layer is Semgrep.
