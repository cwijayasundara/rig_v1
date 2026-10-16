---
name: test
description: Verify a built change - every commit and ci sensor, the contracts and the change's own checks - and record verify.json.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Read, Grep, Glob, Write, Edit
---
# Verify a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S verify <slug>`. It runs:
   - every commit and ci sensor;
   - the contract commands (validate first);
   - traceability: each B-number in spec.md is named by a test;
   - red-proof: a feature's or bugfix's new tests fail on the base, and a refactor's pass on it.
   It then writes `verify.json` for this tree.
2. On failure, fix the code, never a test, a sensor or a contract, and run verify again. If the same finding fails twice, stop and show it to the person, who may waive it with `/rig:waive`.
3. On pass, continue with `/rig:pr <slug>` in this turn.
