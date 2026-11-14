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
   - the hidden acceptance cases of the change's sprint (`S holdout <slug>`): it prints only `holdout: <passed>/<total> passed` and the failing case ids. A failure names a case id: fix the code against that case's requirement in `cases.md`; never look for the test file.
   It then writes `verify.json` for this tree.
2. On failure, fix the code, never a test, a sensor or a contract, and run verify again. A `mutation-diff` failure lists survivors as `file:line mutator`: it goes back to the test writer (`/rig:build` step a) with that list, then `S tests-freeze <slug> --why "<reason>"`; the implementer never edits a frozen test to kill a mutant. When a finding survives a fix, write in one sentence the premise that fix rested on and check it against the output before the next fix. If the same finding fails twice, request a waiver with S waive --request <sensor> <file> <reason>, naming that sentence, and continue to /rig:pr: the PR's approval grants it. For plan-gate, harness-tamper, contracts and secrets there is no request: stop and show the finding to the person, who runs `/rig:waive`.
   A test for a test-plan case whose Data column names a file loads that file from the sprint's `testplan/data/`, unchanged, never a copy: a test that inlines the data instead is a failure to fix.
3. On pass, continue with `/rig:pr <slug>` in this turn.
