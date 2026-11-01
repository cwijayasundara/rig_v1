# Run your claims: reproducible review findings and a claim-vs-evidence check

Date: 2026-11-01. Status: draft for approval. Source: second read of cursor/plugins pstack (`interrogate`, `show-me-your-work`), after the 2026-10-30 review (`docs/HISTORY.md`, "pstack-and-hillclimb") parked item 1.

## Why

rig checks the outputs of an agent (tests, sensors, review) but takes two things on trust:

1. **A reviewer's finding and the confirm pass's verdict are judged by reading.** `templates/review-brief.md` asks for "the concrete input or state, from code you read"; `templates/confirm-brief.md` is read-only. Nothing makes a finding show that it fails. Our own eval found Opus raised 17 of 24 unseeded bugs against Sonnet's 6, so findings differ by model and some are wrong or missed; a finding that ships with a command that fails is checkable by anyone.
2. **The builder's account of what it did is never checked against what it did.** A review finding marked `→ fixed` is believed. A plan phase ticked `- [x]` is believed. A finding's `path:line` is not required to exist.

Goal: more confidence in what agents generate, with checks that need no judgement wherever possible.

## Non-goals and anti-goals

- No new agent launches per change. The target in `CLAUDE.md` stays at most 4 subagent launches per Spec-2-sized change.
- No decision-log file the builder writes by hand (pstack's `decisions.tsv`). A log the agent writes about itself is another claim to trust. Item 2 derives its evidence from git and files that already exist.
- No model reviewer for item 2 in this change. Add one only if an eval shows the script checks miss things.
- Nothing in this change blocks a PR. Item 2's checks suggest only. Item 1 never drops a finding for lacking a `Repro:`.
- Anti-goal: a recall drop. If seeded recall falls, item 1 does not ship.

## Item 1: `Repro:` on review findings

**Behaviour.** A finding in `review.md` may end with `Repro: <command>` after `Fails when:`. The command, run from the repo root on the current tree, exits non-zero (or prints the failing output the finding quotes) while the problem exists.

- `templates/review-brief.md`: the reviewer may run read-only commands today ("node --test on existing tests"). Add: when a finding can be shown by running an existing test, or a one-line script that writes only under the temp directory, give it as `Repro:`. A finding with no `Repro:` is still valid; it is not dropped. Reading stays sufficient.
- `templates/confirm-brief.md`: for each finding with a `Repro:`, run it once. If it still fails the way the finding says, answer `reopened: reproduces (<first output line>)`. If it passes, the finding is `confirmed`. A finding without `Repro:` is judged by reading, as today. The confirm agent still edits nothing; a `Repro:` that would write outside the temp directory is not run and is reported `unrun: <why>`.
- `review.md` shape: the finding line grows an optional trailing `Repro: <cmd>`. Parsing that reads findings (`scripts/prbody.ts`, `scripts/carry.ts`, `scripts/risk.ts`) must keep working on lines with and without it.
- `scripts/prbody.ts`: the PR body's Evidence shows how many findings carry a `Repro:` and lists the claims suggestions. (Per-finding reproduce status is dropped: the confirm pass already writes confirmed or reopened.)

**Where rig decides this is safe.** The reviewer already may run read-only commands. `Repro:` adds no new permission; the confirm pass gains only the right to run a reviewer-supplied command, which the brief restricts to existing tests or temp-dir scripts. The spec leaves the exact enforcement (an `allowed-tools` pattern, or the brief alone) to the builder, but if the brief alone, the confirm agent's launch prompt in `skills/pr/SKILL.md` must repeat the restriction.

**Eval gate.** `eval/review.mjs` runs reviewers with no tools, so it cannot test this. Add a tools-enabled arm (`--arms clean,tools`) that gives the reviewer read-only Bash in the staged repo. Ship only if, on the existing cases (`eval/review/cases.mjs`, `cart-cases.mjs`), recall of the tools arm is not below `clean` and false findings on the baited controls do not rise. Seeded cases whose defect is a failing behaviour should show a `Repro:` that fails on the defect and passes on the fixed variant; record that rate as the headline number. A live run costs money and a person starts it; `--dry` must pass first.

## Item 2: claim-vs-evidence check (script only)

A new check, `S claims <slug>`, run by `S pr` before it commits and by `S verify`'s report. It compares what files say against git and the tree. It has no model call. Nothing here blocks: every rule only suggests (a warning in the report and PR body).

| Rule | Claim | Evidence it must match |
|---|---|---|
| C1 | A finding line in `review.md` cites `path:line`. | `path` exists in the tree, and `line` is within the file. A finding the reviewer placed under Pre-existing is exempt. |
| C2 | A finding is marked `→ fixed`. | The cited file has a diff between the commit `review.md` was written at and now (`git diff <review-sha> -- <file>` is non-empty), or a file named in the finding's own `→ fix` text changed. Otherwise: `fixed but untouched`. |
| C3 | `plan.md` `## Files` lists a file. | The file differs from `<base>` or is new. A listed file with no change is suggested for a look (phases list no files, so a per-phase check is not possible). |
| C4 | `amendments.md` lines cite `(B<n>)`. | Each `B<n>` exists in `spec.md`. |
| C5 | A finding has `Repro:` and was marked `→ fixed (confirmed)`. | The repro should now pass. Suggestion only. |

Stamp for C2: the fixes are uncommitted until `S pr`, so a commit sha cannot mark the review. `S claims stamp <slug>` records the blob hash of each cited file into `.rig/changes/<slug>/claims-stamp.json`; the pr skill runs it right after writing `review.md`, before the fix wave. C2 compares the file's hash now. A missing stamp skips C2.

Output: `.rig/changes/<slug>/claims.json` listing each rule, the claim text, and pass / fail / skipped, and a one-line summary in the PR body next to the existing `## Evidence`.

`S claims` overlaps nothing that exists: `traceability`/`untestedAcs` (B and AC names reach tests) and the scope check (changed files are in `plan.md`) stay as they are. C3 may reuse the scope check's file list.

## Constraints

- Node/TypeScript in `scripts/`, with a `*.spec.ts` that fails without the fix (`CLAUDE.md`: fix the harness with a spec). `npm test` and `npm run typecheck` must pass; quote the output.
- Windows CI: paths through the existing helpers; no shell quoting in `Repro:` handling beyond passing the string to the same runner the sensors use.
- Skill text and templates stay short. `skills/skilltext.spec.ts` and `scripts/reviewbrief.spec.ts` pin wording; update them with the change.
- Per `CLAUDE.md`: implement inline or with at most one Sonnet implementer, run `npm test` once, one Opus review of `git diff main...HEAD`.

## Decided by the person

Approved 2026-11-01. Never block, suggest only: C1-C5 are all warnings. Live tools-arm eval is not yet decided; build the arm and `--dry` test, leave the live run to the person.

## My calls, for you to check

1. Item 2 is script only. The pstack audit asks a second model to read the trail; I would add that only after the script's catch rate is measured.
2. `Repro:` is optional and never blocks. pstack drops unreproduced findings; rig keeps them because recall is already 100% on seeded cases and dropping would only cost recall.
3. (Superseded by the person: every rule is suggest-only.)
4. C2 uses blob-hash stamps (`S claims stamp`), not a commit sha.
5. Order of build: item 1 first (parked since 2026-10-30), then item 2. They share only the `Repro:` field (C5), so they can ship as two changes.

## Left to the builder

The exact `review.md` grammar for the trailing field, how `S claims` finds the base and phase file lists, the format of `claims.json`, and the wording of the brief edits.

## Open questions for the person

1. (Answered: suggest only.)
2. Is a live tools-arm eval run (about the cost of the earlier review evals, a few dollars) acceptable before item 1 merges?
