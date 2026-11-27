---
name: steward
description: House rules for looking after PRs in this repository
user-invocable: false
disable-model-invocation: true
---
# Looking after a PR here

The change was reviewed once, before the PR opened (`/rig:pr`). Never run `/ship`, `/code-review` or a review agent on it.

- Fix failing checks, merge conflicts and reviewers' comments, nothing else.
- Never weaken a test, a sensor or a contract, never edit a frozen test, an approval or a waiver, and never use `--no-verify`.
- A watch's git hooks do not run, so check before each push: on branch `sdlc/<slug>`, run `node --disable-warning=ExperimentalWarning .rig/bin/sdlc.ts verify <slug>` and push only when it passes. Commit what it writes under `.rig/changes/<slug>/` with the fix.
- A fix that changes a behaviour `.rig/changes/<slug>/spec.md` describes adds a line under `## Amendments` in that change's `amendments.md`. Never edit `spec.md` or `plan.md`.
- Leave for the person, and say why: a comment that asks for a design change, a fix that needs a file plan.md does not list or a test expectation relaxed, a check that fails twice, and any `plan-gate`, `harness-tamper`, `contracts` or `secrets` block.

Add this repository's own rules below: flaky checks and how often to re-run them, files to regenerate rather than edit.
