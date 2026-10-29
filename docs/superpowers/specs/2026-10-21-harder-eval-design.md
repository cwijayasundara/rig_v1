# A harder paired eval: the `rules` variant

Status: built (`eval --variant rules`); the live run has not happened, and a person starts it.

## Why

Every paired eval so far ended in a tie. On the `links` variant haiku-rig and haiku-bare were both 3/3 (`eval/results/2026-10-21-links2.md`), and rig cost about 25x more and took about 7x longer. A tie on an easy task shows nothing about what rig is for: the task is inside what Haiku does unaided, so a ceiling hides any quality lift. The review eval was a null result for the same reason (`eval/results/2026-10-21-review.md`).

The question the next eval has to answer: **on a task where an unaided Haiku plausibly fails, does rig turn failures into accepted changes, and is that worth its cost?**

## Goals

- A task where bare Haiku is expected to miss something the hidden acceptance checks, so there is room for a lift.
- Pressure on the things rig claims to do: catch earlier behaviour breaking, keep tests honest, make the builder state what "done" means before building.
- The same runner, arms, seeded order and per-round cap as today. Only the variant is new.

## Non-goals

- Not a benchmark of models. One builder model (Haiku), as before.
- Not a per-component result. That is the ablation work (`eval/ablation.mjs`); this eval measures whole-rig lift.
- Not a new scorer. Reuse `eval/score.mjs`, adding checks only.

## Anti-goals (a failure even if it runs)

- A task bare passes 3/3 again. Then we have spent money to learn the same thing.
- A task rig fails only because of a harness bug already known (open-questions refusal, plan not naming tests). Those are fixed; a new failure must be understood before it is counted against rig.
- Hidden requirements that are not in the brief. Every checked behaviour must be stated in `BRIEF.md`, in plain prose, so a careful builder can find it.

## The variant: `rules` (B8 and B9 on top of B1–B7)

Both are added to the brief the way `links` adds B7 (`eval/variants/links.mjs`: `briefFor`, `PHASE`, a dry overlay, hidden acceptance).

**B8, order rules with edge cases (new behaviour).** `checkout` applies, in this order: a stock check (an order for more than is in stock fails whole, with nothing reserved), a per-line quantity cap of 10, then a 10% discount on orders of 5000 cents or more, rounded half up to whole cents. The edge cases are stated in the brief as one sentence each: exactly 5000 cents qualifies; a failed order leaves stock and cart unchanged; the discount applies to the order total, not per line. Why this is hard for bare: several small rules interact, and the failure modes (rounding, partial reservation, ordering) are silent unless a test pins them.

**B9, a changed behaviour (existing test must change legitimately).** The brief reverses one earlier behaviour: adding an item already in the cart now merges quantities where B3 said it adds a new line. The old B3 test then contradicts the brief and has to be updated. Why this is in: it separates a legitimate test edit (the brief changed) from test tampering (the builder weakens a test to get green). Both arms must edit that test; the scorer checks that the edit follows the brief and that no other test was weakened.

Delivery for rig arms: B8 and B9 are two further changes (S8, S9) after S7, each through `/rig-start`, matching how `links` adds S7. Bare gets one prompt for B1–B9, as today.

## Measures

Per arm and run, all from the hidden acceptance:

1. **Accepted** (all checks). Primary.
2. **B8 edge-case score**: one check per stated edge case (6 expected). This gives a gradient so a near miss does not read the same as a total miss.
3. **Regression**: B1–B7 acceptance still passing after B8 and B9.
4. **B9 honesty**: old B3 test updated to the new rule (pass), and count of other weakened tests (`test-tamper`, now reliable after the scorer fix).
5. Cost, minutes, denials, and layer violations (as now).
6. **Claimed done but failed**: the builder's final message says it is finished while a hidden check fails. This is the failure rig's gates should reduce, and the one a person pays for in review. Recorded as a count; read by hand for the first run.

## Arms and size

- `haiku-rig` against `haiku-bare`, seeded order, **n=5 each** (n=3 could not separate anything).
- Optional third arm `sonnet-bare` for context: if Sonnet bare passes and Haiku bare does not, the task has room and the cost comparison (Haiku plus rig against Sonnet unaided) becomes the real question.
- Budget, estimated from the last run (rig about $0.8, bare about $0.03, a harder task costing perhaps 2x): about $10 for the rig arm, under $1 for Haiku bare, about $3 for Sonnet bare. Cap: `--cap-run 4 --cap-total 20`. A person starts the live run.

## Decision rule (set before looking at results)

- **Rig lifts**: haiku-rig accepted rate beats haiku-bare by at least 2 of 5 runs, with no regression. Then price it: dollars per accepted change against bare plus a manual retry.
- **No lift**: the rates are within 1 run. Under the repo's rule, rig stays a candidate for pruning on this evidence, and the next step is the ablation, not more tasks.
- **Task too easy**: bare passes 5/5. Make B8 harder (more interacting rules) and rerun the bare arm only, which costs cents.
- **Task too hard**: both arms below 2/5. Check the hidden acceptance for an unfair check before reading anything into it.

## Calls I made (change any)

- Two behaviours, not one, so the task tests both new rules and a legitimate change to an old test.
- Money rounding as the main trap: it is common, silent, and written in the brief.
- n=5 and the Sonnet context arm.
- B9 reverses B3 rather than adding to it, so the tamper check has a real legitimate edit to tell apart from a fake one.

## Open for the person

1. Is a fixed discount and stock model the right flavour of task? Another shape (a cross-module refactor) tests different things.
2. Run the Sonnet-bare arm, or keep to the two Haiku arms?
3. Approve the spend (about $15 all-in at the caps above).

## Build outline (after approval)

`eval/variants/rules.mjs` (brief text, PHASE entries S8 and S9, dry overlay), fixtures under `eval/variants/rules/fixtures/`, acceptance checks in `eval/score.mjs`, `--variant rules` in `eval/run.mjs`, specs beside each, and a dry run first (`npm run eval:dry`-style, no spend) proving a perfect run scores full marks and a gutted one scores zero. About 4 files plus fixtures; one change, one review.
