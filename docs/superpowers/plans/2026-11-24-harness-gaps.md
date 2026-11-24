# Harness gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo's CLAUDE.md: inline, no review unless asked).

**Goal:** Fix the five gaps found in the rig_v1_test run, each with a spec that fails without it.

**Architecture:** Extend the function that already does each job; no new module, hook or gate.

**Tech Stack:** TypeScript, node:test (`scripts/*.spec.ts`).

**Spec:** docs/superpowers/specs/2026-11-24-harness-gaps-design.md

## Global Constraints
- Only unit specs of changed code: `npm run test:changed`. Never `npm test`, e2e or eval.
- Nothing blocks: routing, labels and wording only. No new file or exported helper unless a second caller needs it.
- Remove any code a change makes dead (old wording, old regex); grep before finishing.
- No commit unless the person asks.

## Review Focus
- A `## Findings` bullet ending `→ fixed (confirmed)` must not be routed (test in Task 1).
- A re-run of `carry` must not duplicate a routed Findings line (existing dedupe; test in Task 1).
- A check whose tail merely contains the word "pass" or "run" must still print `pass` (Task 2).
- A launch id missing from model.json keeps `unknown model` (Task 3).

---

### Task 1: Route open Findings
**Files:** Modify `scripts/carry.ts:12,35-45` (`ReviewItem.section`, `reviewItems` tuple, header comment line 1-3); Test `scripts/carry.spec.ts`.
**Interfaces:** Produces `reviewItems(review)` now also returns items with `section: 'Findings'`.
- [ ] Test `a Findings bullet left open is routed, a fixed one is not`: `reviewItems('## Findings\n- [severity: medium] src/a.py:3: x → fix: y; left open for a person\n- src/b.py:1: z → fixed (confirmed)\n')` has length 1, `section` 'Findings', `file` 'src/a.py'. Add one `shipStore`-style case: that item lands in the backlog once, and a second `carry` run adds nothing.
- [ ] Run `node --disable-warning=ExperimentalWarning --test scripts/carry.spec.ts`; expect the new tests FAIL.
- [ ] Add `'Findings'` to the `ReviewItem.section` union and the `as const` tuple; update the top comment to name Findings.
- [ ] Re-run; expect PASS.

### Task 2: "not run here" in the PR evidence
**Files:** Modify `scripts/sensors.ts` (export `NOT_RUN_HERE: RegExp`), `scripts/prbody.ts:62-68` (`headChecks` `line`); Test `scripts/prbody.spec.ts`, `scripts/stackpacks.spec.ts:~125`.
**Interfaces:** Produces `NOT_RUN_HERE`, matching the guarded echoes of layers, sast and audit in `templates/stacks/*.json`.
- [ ] Tests: prbody — a run with exit 0 and tail `layers: not enforced here (no approved layers config)` prints `not run here`; tail `All checks passed!` and one mentioning "run" still print `pass`. stackpacks — for each pack, the text inside every `echo '…'` that follows `else` in layers, sast and audit commands matches `NOT_RUN_HERE` (extends the existing layers test; no second loop).
- [ ] Run both specs; expect FAIL.
- [ ] Implement: in `line`, `r.exit === 0 ? (NOT_RUN_HERE.test(r.tail) ? 'not run here' : 'pass') : …`.
- [ ] Re-run; expect PASS.

### Task 3: Model in the agent list
**Files:** Modify `scripts/pr.ts:~121` (where `agentRows(slug)` is passed to `prBody`); Test `scripts/pr.spec.ts` or `prbody.spec.ts`.
**Interfaces:** Consumes `readModelState(file).launches[].{id,resolved,requested}` (`scripts/modelstate.ts`) and `MODEL_STATE` path const. Produces rows with `model` filled when null.
- [ ] Test: agents.jsonl launch with `model:null`, model.json launch with that id and `resolved:'claude-opus-5-5'` → body has `on claude-opus-5-5`; an id absent from model.json still prints `unknown model`.
- [ ] Run; expect FAIL. Implement a one-line `.map` filling `model` (reuse, do not copy, the `resolved ?? requested` expression from `latestAgents`). Re-run; expect PASS.

### Task 4: Re-freeze label
**Files:** Modify `scripts/prbody.ts:151` (flag text); Test `scripts/prbody.spec.ts`. Grep `weakened test` in `scripts/`, `skills/`, `docs/` and update every match.
- [ ] Test: a later freeze row without `dropped` yields flag `re-frozen: <why>`; with `dropped` it still yields `weakened test: re-frozen, …(dropped: …)`.
- [ ] Run; FAIL. Implement the conditional on `r.dropped?.length`. Re-run; PASS.

### Task 5: Start runs on into plan
**Files:** Modify `skills/start/SKILL.md` (step 4), `skills/plan/SKILL.md` (step 6), `skills/build/SKILL.md` and `skills/test/SKILL.md` (the continue line and `allowed-tools`); Test `scripts/autoloop.spec.ts:11-29`.
- [ ] Update the four `continue with` assertions to the new wording: `call the Skill tool with skill \`rig:<next>\` and args \`<slug>\` in this turn`; add an assertion that start, plan, build and test list `Skill` in `allowed-tools`. Run `node --disable-warning=ExperimentalWarning --test scripts/autoloop.spec.ts`; expect FAIL.
- [ ] Edit the four skills; keep the "stop only while Open questions" and `gates.plan` branches as they are.
- [ ] Re-run; PASS.

### Task 6: Verify and hand off
- [ ] `npm run test:changed`; quote the output. Grep for the old wording and any now-unused import.
- [ ] Say in one line which person-run tests a skill change likely needs (the journey) and stop; then regenerate the test repo with `/rig:upgrade` there.
