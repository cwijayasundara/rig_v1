---
name: plan
description: Plan an active change - write plan.md (files, interfaces, tests per behaviour, contracts, verification) and hand it to a person for approval.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Read, Grep, Glob, Write, Edit, Agent
---
# Plan a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S status --json` and take `$0` or the active change. It must have `spec.md`; otherwise run `/rig:start` first.
2. Write `.rig/changes/<slug>/plan.md` in at most 60 lines:
   - `## Files`: the files you expect to touch.
   - `## Interfaces`: signatures and data shapes, never code bodies. For a change started from a charted intent, cite the intent's `## Design` rows instead of restating them, and give a test for each `### Failure behaviour` line.
   - `## Tests`: one line per behaviour, giving the B-number, the test file and the level (unit, contract or end-to-end).
   - `## Contracts`: contract files this change adds or edits, or `none`.
   - `## Verification`: the commands that prove it.
   - `## Decisions`.
   - `## Open questions`: `none`.
3. A change that adds or edits a contract file (`contracts.files` in `.rig/sensors.json`) makes that edit now, before approval, because approval freezes those files.
4. Ask the person to review `spec.md` and `plan.md` and to run `/rig:approve <slug>`. Never approve yourself. End with `Next: /rig:approve <slug> (a person), then /rig:build <slug>`; from there the build runs through verify, the PR and the review's fixes without stopping. If `.rig/sensors.json` sets `"gates": { "plan": false }`, skip the request and end with `Next: /rig:build <slug>`.
