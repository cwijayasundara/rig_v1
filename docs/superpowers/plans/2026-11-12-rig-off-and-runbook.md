# rig Off Switch and Operations Runbook (R5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sdlc.ts off --why "<text>"` proposes switching rig off for a repo in one committed file, `sdlc.ts on` reverses it, and `docs/runbook.md` says what to do when CI or the model provider is down.

**Architecture:**
- **The marker.** It is one file, `.rig/off.json` (`{ by, why, at }`). It counts only once it is on the trunk. CI already judges from the base, and local hooks read `<trunk ref>:.rig/off.json` through git, so an agent that writes the file on its own branch switches nothing off.
- **Who approves.** The file is a protected path (harness-tamper, CODEOWNERS, settings deny rules), so turning rig off takes a code owner's review.
- **What reads it.** `check`, the git pre-push check and every Claude hook return at once while the trunk has it.
- **The outage case.** The `ai-review` job passes at once when the base has the marker, or when the PR's head has it. The head case lets the off PR itself merge during a model-provider outage, still behind code-owner review.
- **rig-check.** It honours the base only, because it needs no model provider.

**Tech Stack:** TypeScript on Node ≥ 22.18, `node:test`, `testkit.ts` (`makeRepo`, `sdlc`, `write`, `gitIn`, `hook`), GitHub Actions YAML.

**Spec:** `docs/superpowers/2026-11-11-rig-readiness-and-adoption.md` §2 Step 1, row R5. The person's decisions (2026-11-12): build `off`/`on`; the support owner and response time stay placeholders.

## Global Constraints

- Marker path: `.rig/off.json`. JSON: `{ "by": string, "why": string, "at": "<ISO date>" }`. `--why` is required and non-empty.
- **Trunk ref for local reads.** `origin/<trunk()>` when that ref exists, else `<trunk()>` (from `scripts/protect.ts`). CI reads the ref passed as `--config-from`.
- `scripts/sdlc.ts` stays at exactly 500 lines. Add `off: cmdOff, on: cmdOn` to the existing line 481 and the import to an existing import line.
- `scripts/check.ts` stays ≤ 500 (489 today). The harness cap is 12,000. Add at most 120 capped lines.
- The deny rule `Edit(/.rig/off.json)` goes in `templates/settings.json`, and `Edit(./.rig/off.json)` in `templates/managed-settings.json`. `/.rig/off.json @your-org/platform` goes in `templates/CODEOWNERS`, and `.rig/off.json` in `PROTECTED` (`scripts/sensors.ts:199`). `owners.spec.ts`, `permissions.spec.ts` and `managed.spec.ts` keep these in step: run them.
- `npm test` and `npm run typecheck` pass. Quote the output.

## Review Focus

1. **The marker only on a feature branch** (an agent's escape attempt). Local check, pre-push and hooks still run in full.
2. **The marker on the trunk, but the local clone not fetched.** It is still on. The runbook says to `git fetch`. The first hook output after a fetch says rig is off.
3. **A malformed or empty `off.json` on the trunk.** Read as off, so a broken marker never blocks the repo that is trying to switch off. The message says the marker could not be parsed.
4. **No `origin` remote, and no trunk branch locally** (a fresh `git init`). `rigOff()` returns null and never throws.
5. **`on` while rig is not off, and `off` twice.** Each prints one line and exits 0. `off` without `--why` exits 1.

---

### Task 1: Marker, off/on, and every local and CI check honours it

**Files:**
- Create: `scripts/off.ts`
- Modify:
  - `scripts/check.ts` (`cmdCheck`), `scripts/githooks.ts` (`cmdCheckPush`), `scripts/hooks.ts` (`cmdHook`)
  - `scripts/sdlc.ts:481` and its import line, `scripts/vendor.ts` (`'off'` in `VENDORED`)
  - `scripts/sensors.ts:199` (`PROTECTED`), `templates/CODEOWNERS`, `templates/settings.json`, `templates/managed-settings.json`
- Test: `scripts/off.spec.ts`

**Interfaces:**
- Produces, in `scripts/off.ts`:
  - `export type Off = { by: string; why: string; at: string; parsed: boolean }`
  - `export function trunkRef(): string`: `origin/<trunk()>` if `git rev-parse --verify --quiet` finds it, else `trunk()`
  - `export function rigOff(ref: string = trunkRef()): Off | null`. It runs `git show <ref>:.rig/off.json`. The result is null when the file or ref is missing. A file that does not parse gives `{ by: '?', why: '?', at: '?', parsed: false }`. It never throws.
  - `export const offLine = (off: Off, ref: string): string` → `rig is off on <ref> since <at> (by <by>: <why>); checks skipped. Switch it on with: node .rig/bin/sdlc.ts on`. When `!parsed` it says `rig is off on <ref> (.rig/off.json could not be parsed); …`.
  - `export function cmdOff(args: Args): void`. It fails without a string `--why`. It writes `.rig/off.json` (`by` from `git config user.name`, falling back to `unknown`) and calls `sanctionWrites(['.rig/off.json'])`. It then prints `wrote .rig/off.json: commit it on a branch, open a PR and have a code owner approve; rig is off once it is on <trunkRef()>`. When the file already exists it prints `.rig/off.json already exists` and exits 0.
  - `export function cmdOn(): void`. It deletes `.rig/off.json` and prints the same PR instruction ending `rig is on again once the deletion is on <trunkRef()>`. When the file is absent it prints `rig is not off here (.rig/off.json is absent)` and exits 0.
- Consumers:
  - `cmdCheck` calls `rigOff(optString(args, 'config-from') ?? trunkRef())` first. When off, it prints `offLine` and returns with exit 0.
  - `cmdCheckPush` and `cmdHook` call `rigOff()`. When off, they return. `cmdHook` prints `offLine` only for `session-start` and stays silent otherwise.

- [ ] **Step 1: Write the failing tests** in `scripts/off.spec.ts`. Each test makes a repo with `makeRepo`, `sdlc(repo, ['init'])` and a commit on `main`.
  - `off without --why fails; off writes the marker and says how it takes effect`. Without `--why`, expect exit 1. With `--why 'provider outage'`, expect exit 0, `.rig/off.json` with `why === 'provider outage'`, and stdout matching `/code owner/`.
  - `the marker on a feature branch switches nothing off` (Review Focus 1). Check out `-b agent`, run `off --why x`, commit. Then `check --at commit` still runs the sensors: its stdout does not match `/rig is off/`. `rigOff('agent')` is not null but `rigOff('main')` is null. Call this in-process with `process.chdir(repo)`, or through a tiny `sdlc` path; the implementer picks whichever `testkit` supports.
  - `the marker on the trunk skips check, pre-push and hooks`. Commit the marker on `main`. Then `check --at commit` exits 0 with stdout matching `/rig is off on main/`, and `hook(repo, 'session-start', {})` stdout matches `/rig is off/`. `hook(repo, 'stop', {})` has empty stdout and exit 0.
  - `check --at ci honours --config-from`. On a branch with the marker committed, `check --at ci --base main --config-from main` does not match `/rig is off/`. After merging the branch into main, the same call does match.
  - `a malformed marker on the trunk reads as off` (Review Focus 3). Commit `{` as `.rig/off.json` on main. `check --at commit` stdout matches `/could not be parsed/`.
  - `no trunk and no remote: rigOff is null` (Review Focus 4). On a repo whose only branch is `work`, `check --at commit` does not match `/rig is off/` and its stderr has no stack trace.
  - `on and off are idempotent` (Review Focus 5). Run `on` with no marker, then `off --why x` twice. Each exits 0, and the second `off` matches `/already exists/`.
  - `the marker is protected`: `isProtected('.rig/off.json')` is true (import from `./sensors.ts`).

- [ ] **Step 2: Run them and confirm they fail.** Run `node --disable-warning=ExperimentalWarning --test scripts/off.spec.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement `scripts/off.ts`** and the three early returns.
  - Add `'off'` to `VENDORED`.
  - Put `off: cmdOff, on: cmdOn` on `sdlc.ts:481`, keeping the file at 500 lines.
  - Add `.rig/off.json` to `PROTECTED`, `templates/CODEOWNERS` (after `/.rig/githooks/`) and both settings deny lists (beside the `approval.json` deny rules).

- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --disable-warning=ExperimentalWarning --test scripts/off.spec.ts scripts/owners.spec.ts scripts/permissions.spec.ts scripts/managed.spec.ts scripts/hooks.spec.ts scripts/vendor.spec.ts`. Expected: all pass.

- [ ] **Step 5: Commit** with `feat(off): sdlc.ts off/on — one committed marker, honoured only once it is on the trunk`.

### Task 2: ai-review honours the marker, and the runbook

**Files:**
- Modify: `templates/rig-check.yml` (the two review steps in `ai-review`), `README.md` (one link under Status), `CHANGELOG.md` (one Unreleased line)
- Create: `docs/runbook.md` (not capped; at most 90 lines)
- Test: `scripts/off.spec.ts`

**Interfaces:**
- Consumes: the marker path and the semantics of `cmdOff`/`cmdOn` from Task 1.
- Each of the two review steps starts with this guard. It is exact text, so both steps match:

```sh
if git cat-file -e "origin/$BASE:.rig/off.json" 2>/dev/null || git cat-file -e "HEAD:.rig/off.json" 2>/dev/null; then echo "verdict: pass (rig is off: .rig/off.json is on $BASE or in this PR, which a code owner approves)" | tee "$RUNNER_TEMP/<review|security>.md"; exit 0; fi
```

- [ ] **Step 1: Write the failing tests:**
  - `both ai-review steps pass at once when the marker is on the base or in the PR`. Read `templates/rig-check.yml`. It has 2 occurrences of `git cat-file -e "origin/$BASE:.rig/off.json"`. Each comes before the `claude -p` line of its step: compare indexOf within each `- name: Review the diff` block. Each guard's `tee` target is that step's own output file (`review.md`, `security.md`).
  - `the guard satisfies the gate`. Extract the gate function's verdict regex (`'^verdict: '`) and assert that the guard's echoed line matches it and holds no `[severity: critical|high]`.
  - `the runbook covers the four R5 items`. `docs/runbook.md` contains `sdlc.ts off --why`, `sdlc.ts on`, `## CI is down`, `## The model provider is down`, `## Upgrading`, `<support owner>` and `<response time>`.

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement.**
  - Insert the guard into both steps.
  - Write `docs/runbook.md` with these sections:
    - `## Switch rig off for a repo`: off, PR, code owner, merge, `git fetch`; then on.
    - `## CI is down`: Actions outage. Required checks cannot report. Merging needs an admin bypass, logged with the reason, or waiting. `off` does not help, because rig-check never runs.
    - `## The model provider is down`: `ai-review` fails with no verdict. `sdlc.ts off --why "<provider> outage"` is the switch, since its PR passes ai-review through the head guard. Turn it on after the outage. Local sessions cannot run, while deterministic checks and git hooks still run.
    - `## rig itself is broken`: a sensor blocks every PR, so the off PR is blocked by the base checker too. Last resort: admin bypass of that one PR, then fix on `release/<x.y>`.
    - `## Upgrading`: rehearse on a throwaway clone of the client repo with `/rig:upgrade` from the new tag, then `npm test` of the client, `readiness --client`, a PR and a code-owner review. Workflow template changes arrive as `rig-check.yml.rig-new` for a person to merge. Rehearse 0.8.0 → 0.8.1 before the pilot (a person does this; record the date here).
    - `## Support`: `<support owner>`, `<response time>`, and where to report (the fork's issues).
  - README Status gets one sentence linking `docs/runbook.md`. CHANGELOG gets one line.

- [ ] **Step 4: Verify.** Run `npm test && npm run typecheck`. Expected: all pass, the size spec included. `wc -l scripts/sdlc.ts` gives 500.

- [ ] **Step 5: Commit** with `feat(off): ai-review passes while rig is off, and the operations runbook (R5)`.

### After the tasks

Do one Opus review of `git diff main...HEAD`, fix its findings in one wave, and run `npm test` again.
