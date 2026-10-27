# Init and upgrade set up the review gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A target repo gets the review gates from `/rig:init` (and existing repos from `/rig:upgrade`) instead of a list of manual steps: required checks on the trunk, the Claude secret named, `risk.enforce` asked, rung 3 guarded, reverts mined by `/rig:learn`.

**Spec:** the person's ask (2026-10-27): "take care of the items in 'What a target repo needs to do' in /rig:init --quick or /rig:init", with the four answers given in that conversation.

## Global Constraints

- A change to GitHub settings is outward-facing: full `init` asks first; `--quick` and `--defaults` never call GitHub, they print the commands (`init --protect --dry`).
- `--protect` only adds required checks to existing branch protection (POST `.../required_status_checks/contexts`); it never creates or replaces protection. No protection, no `gh`, or no remote: it prints the command and changes nothing.
- `init --enforce` sets `risk.enforce: true` in `.rig/sensors.json` (a sanctioned write, like `--stack`); it never turns it off.
- Rung 3 is never set by init. `autonomy set 3` refuses until `.rig/sensors.json` has `risk.enforce: true` and a non-empty `humanApproval.trusted`, naming both.
- `/rig:upgrade` never overwrites `.github/workflows/rig-check.yml`; a differing file is reported, and `--apply` writes `rig-check.yml.rig-new` beside it.

---

### Task 1: `init --protect [--dry]`

**Files:** Create `scripts/protect.ts`, `scripts/protect.spec.ts`; Modify `scripts/sdlc.ts` (cmdInit), `scripts/vendor.ts` (VENDORED)

**Interfaces:** `export function protect(dry: boolean, branch?: string): string[]` (lines to print). Checks: `rig-check`, `ai-review`. Branch: `defaultBase()` stripped of `origin/`, else `main`.

- [ ] Tests with a fake `gh` (`RIG_GH`): protection exists → one POST adding both contexts, line `required checks on main: rig-check, ai-review`; already required → no POST, says so; 404 → no write, prints the `gh api -X PUT …/protection` command; `gh` missing → prints the commands; `--dry` → never calls a write route; no Claude secret in `gh secret list` → prints `gh secret set CLAUDE_CODE_OAUTH_TOKEN`.
- [ ] Implement; commit `feat(init): init --protect adds rig-check and ai-review as required checks`.

### Task 2: `init --enforce`, the guarded rung 3, `/rig:learn` mines reverts

**Files:** `scripts/sdlc.ts` (cmdInit `--enforce`), `scripts/autonomy.ts`, `skills/init/SKILL.md`, `skills/learn/SKILL.md`; tests `scripts/autonomy.spec.ts`, the init-skill and learn-skill specs that pin skill text (or new asserts in `scripts/prskill.spec.ts` style)

- [ ] Tests: `init --enforce` sets `risk.enforce: true` and keeps other keys; `autonomy set 3` refuses with `risk.enforce` and `humanApproval.trusted` named until both are set, then succeeds; the init skill asks the enforce and protect questions in full mode and prints `init --protect --dry` and the enforce line under `--quick`/`--defaults`; the learn skill runs `S learn reverts` in its Mine step.
- [ ] Implement; commit `feat(init): ask for risk.enforce and required checks; rung 3 needs enforce and trusted; learn mines reverts`.

### Task 3: `/rig:upgrade` flags a stale `rig-check.yml`

**Files:** `scripts/upgrade.ts`, `scripts/upgrade.spec.ts` (or the existing upgrade spec), `skills/upgrade/SKILL.md`, README, CHANGELOG, cap

- [ ] Tests: a repo whose `.github/workflows/rig-check.yml` differs from `templates/rig-check.yml` → the plan text says so and `--json` has `workflow: 'differs'`; `--apply` writes `.github/workflows/rig-check.yml.rig-new` with the template and leaves the file; identical or absent → nothing.
- [ ] Implement; docs; `npm test && npm run typecheck`; commit `feat(upgrade): flag a rig-check.yml older than the template`.

### After the tasks

One fresh review of `git diff main...HEAD`, one fix pass, `npm test` again.
