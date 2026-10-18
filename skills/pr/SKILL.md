---
name: pr
description: Open the PR for a verified change, run one review by the evaluator agent, fix its findings and push the follow-up.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git diff*), Bash(git log*), Bash(gh pr view*), Bash(gh pr comment*), Read, Grep, Glob, Write, Edit, Agent
---
# Open the PR

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S pr <slug> --message "<type(scope): summary>"`. It refuses without an approved plan and a fresh, passing `verify.json`. On a refusal, run `/rig:test <slug>` again or ask the person to approve. It commits on `sdlc/<slug>`, pushes and opens the PR, or stays local-only without a remote.
2. Review once: launch `rig:evaluator` with no model override (its frontmatter pins the evaluation model). Pass the change folder and the base it was verified against (`base` in `verify.json`). Write its findings to `.rig/changes/<slug>/review.md`. This is the only review: never a second review, also not after the fixes below.
3. Run `S activate <slug>` so the hooks guard the fixes, then fix every item under `## Findings` in one wave, without asking. Fix the code, or strengthen a test the finding names; never weaken a test, a sensor or a contract file. Items under `## Deferred` stay as notes for the person. Stop and tell the person, leaving that item unfixed, when a fix needs a file plan.md does not list, a frozen contract file, or a test expectation relaxed.
4. After fixing, run `S verify <slug>` (not `/rig:test`, which would hand back here). On failure fix the code and run it again; if the same check fails twice, stop and show it to the person, who may waive it with `/rig:waive`.
5. Commit the follow-up with `S pr <slug> --message "fix(review): <what>"`, or, when nothing was fixed, `S pr <slug> --message "docs(review): <slug>"`. Either one carries review.md, pushes to `sdlc/<slug>` and ends the active change. After a stop in step 3, still ship review.md: revert the unfinished fix, then run `S verify <slug>` and the `docs(review)` follow-up. After a stop in step 4, leave review.md for the person. When a PR exists, post the review with `gh pr comment --body-file .rig/changes/<slug>/review.md`, adding a line under it naming what step 3 fixed.
6. End with the PR URL (or `local-only`), what was fixed and what was left, and `Next: a person reviews and merges the PR`.
