---
name: pr
description: Review the change's delta with /code-review and /security-review, fix the findings, then open one PR.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git diff*), Bash(git log*), Bash(git status*), Bash(git remote*), Bash(gh pr view*), Bash(gh pr comment*), Read, Grep, Glob, Write, Edit, Agent
---
# Review, then open the PR

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`. The review runs on the delta only, before any PR exists.

1. Read `base` from `.rig/changes/<slug>/verify.json`. When verify is missing or failing, stop and run `/rig:test <slug>`.
2. Review once: never a second review, also not after the fixes below. Both run in the foreground:
   - `/code-review <effort> all changes since <base>, committed and uncommitted`. The effort is `medium`, or `high` when plan.md `## Contracts` lists a contract change; always pass it, because the command otherwise reuses the last level typed.
   - `/security-review`. It needs an `origin` remote. With no `origin` remote it prints nothing or fails on setup: then launch one `general-purpose` agent with `model: sonnet` and a brief of at most 60 lines: the base, "review only the changes since <base>, committed and uncommitted, for security: injection, authn/authz, secrets, unsafe input, crypto, path traversal", read-only, findings as file, line, problem, fix. Never skip the security pass.
3. Write the findings to `.rig/changes/<slug>/review.md`: `verdict: pass | changes-needed`, then `## Findings` with one line each `- [severity: critical|high|medium] [category: <slug>] path:line: problem → fix (confidence NN)`, `## Deferred`, `## One thing`. `/code-review` gives no severity or category: assign both. The category is exactly one of correctness, security, contract, data, coupling, responsibility, abstraction, duplication, tests; every `/security-review` finding is `security`. Keep a finding only at confidence 80 or more; style preferences and anything the brief's non-goals exclude go to Deferred.
4. Run `S activate <slug>` so the hooks guard the fixes, then fix every item under `## Findings` in one wave, without asking. Fix the code, or strengthen a test the finding names; never weaken a test, a sensor or a contract file. Stop and tell the person, leaving that item unfixed, when a fix needs a file plan.md does not list, a frozen contract file, or a test expectation relaxed. Then run `S verify <slug>` (not `/rig:test`, which would hand back here). On failure fix the code and run it again; if the same check fails twice, stop and show it to the person, who may waive it with `/rig:waive`.
5. Run `S pr <slug> --message "<type(scope): summary>"` once. It refuses without an approved plan and a fresh, passing `verify.json`; it commits the code and review.md together on `sdlc/<slug>`, pushes and opens the PR, or stays local-only without a remote. After a stop in step 4, still ship review.md: revert the unfinished fix, run `S verify <slug>`, then `S pr`.
6. When a PR exists, post the review with `gh pr comment --body-file .rig/changes/<slug>/review.md`, adding a line under it naming what step 4 fixed.
7. End with the PR URL (or `local-only`), what was fixed and what was left, and `Next: a person reviews and merges the PR`.
