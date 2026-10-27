# Risk tiers (B1, B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every change gets a risk tier (0, 1, 2) with reasons, computed from the base branch's config so a PR cannot lower it; the PR body and CI show it; a team that opts in has `rig-check` require one independent approval per PR, with the tier and a two-reviewer suggestion for tier 2.

**Architecture:** A pure `assessRisk` in new `scripts/risk.ts` takes changed files, line count, slugs, a file reader, the `## Access` rows and the `risk` config, and returns `{ tier, reasons }`. `prbody.ts` prints it (replacing its own signal counting); `pr.ts` and `check.ts` (CI) build its inputs. `sensors.json` gains a `risk` key.

**Tech Stack:** Node 22 TypeScript, `node --test`.

**Spec:** `docs/proposals/2026-10-27-risk-tiered-review.md` (B1, B2 and Decisions 1-2; order step 2: "tiers are computed and shown, tier 1/2 enforced", rung 3 unavailable).

## Global Constraints

- The tier is the max over signals; nothing lowers it. Tier 0 never skips a person in this plan: rung 3 and the circuit breaker come in Phase C.
- In CI, config (`risk`, `contracts.files`) comes from the base branch (`--config-from`); `## Access` rows are the union of base and head, so a PR cannot drop a row to lower the tier.
- Tier 2 is advisory: rig never requires a second approver (Decision 1). The message says "two reviewers, one a code owner, recommended; enforce it in branch protection".
- A dismissed finding raises to tier 1 (Decision 2).
- `risk.enforce` defaults to `false` (report only). Loosening it, raising `maxLines` or dropping an `alwaysHuman` glob is a registry weakening.
- `SCRIPTS_CAP` in `scripts/neutrality.spec.ts` is raised with a dated note, as before.

## Review Focus

1. A PR with no `.rig/changes/<slug>/` record at all (a hand-made PR) must be tier ≥ 1, never 0.
2. A PR whose head deletes an `## Access` row or its own review.md must not lower its tier.
3. A path match is case-insensitive in CI (same as `isProtected(file, true)`).
4. `risk.enforce` with no PR event (local `check --at ci`) must block with the existing "cannot verify a reviewer" reason, not crash.
5. Malformed `risk` config is a config error, not a silent default.

---

### Task 1: `risk` key in sensors.json

**Files:** Modify `scripts/registry.ts`; Test `scripts/registry.spec.ts`

**Interfaces:** Produces `Registry['risk']: { enforce: boolean; alwaysHuman: string[]; maxLines: number }`, default `{ enforce: false, alwaysHuman: [], maxLines: 400 }`.

- [ ] Test `risk parses, rejects other shapes, and loosening it is a weakening`: `{ enforce: true, alwaysHuman: ['src/billing/**'], maxLines: 200 }` parses; `risk: 5` → `/risk must be/`; `maxLines: -1` and `alwaysHuman: 'x'` → errors; `parseRegistry('{}')` gives the default; `weakensRegistry` names `risk.enforce turned off`, `risk.alwaysHuman lost src/billing/**`, `risk.maxLines raised`; tightening returns `[]`.
- [ ] Run `node --test scripts/registry.spec.ts`, see it fail; implement in the existing parse and `weakensRegistry` style (`TOP_KEYS` gains `risk`); see it pass. Commit `feat(risk): risk key in sensors.json`.

### Task 2: `assessRisk` and `sdlc.ts risk`

**Files:** Create `scripts/risk.ts`, `scripts/risk.spec.ts`; Modify `scripts/sdlc.ts` (command table)

**Interfaces:**
- Produces `export type Risk = { tier: 0 | 1 | 2; reasons: string[] }`
- `export function reviewSignals(review: string): { open: number; dismissed: number; unverifiable: number }` (open = a `## Findings` bullet not ending ` → fixed (confirmed)`).
- `export function assessRisk(i: { files: string[]; lines: number; slugs: string[]; read: (slug: string, name: string) => string; access: AccessRule[]; risk: Registry['risk']; contractGlobs: string[]; ci: boolean }): Risk`
- `export function cmdRisk(args: Args): void` — `sdlc.ts risk [<slug>] [--base <ref>] [--json]`; base defaults to the change's `verify.json` base, else `main`; diff is `branchDiff(base)`.

Signals (reason text exact, one bullet each; tier is the max):

| Reason | Tier |
|---|---|
| `always-human path: <file>` (PROTECTED, `.github/workflows/**`, or `risk.alwaysHuman`) | 2 |
| `access: <slug> builds "<action>"` (a slug is the Intent of an Access row) | 2 |
| `one-way door` (a slug's plan.md `## Contracts` has a bullet, or a file matches `contractGlobs`) | 1 |
| `no change record` (no slugs) | 1 |
| `no review.md: the change was not reviewed` (a slug with empty review.md) | 1 |
| `N finding(s) still open` / `N finding(s) dismissed by the builder` / `N item(s) the reviewer could not verify` | 1 |
| `diff of N lines is over risk.maxLines (M)` | 1 |

Tier 2 adds the last reason `two reviewers, one a code owner, recommended; enforce it in branch protection`.

- [ ] Tests in `scripts/risk.spec.ts`, one per row above plus: a clean change (slug, empty Contracts, review `verdict: pass\n## Findings\n`, 10 lines) → `{ tier: 0, reasons: [] }`; `ci: true` matches `SRC/Billing/x.ts` against `src/billing/**`; max wins (a tier-2 and a tier-1 signal → 2, both reasons). Pluralisation as prbody today (`1 finding still open`, `2 findings still open`).
- [ ] Run, fail; implement; pass. `cmdRisk` prints `tier: N` then the reasons; `--json` prints the Risk. Commit `feat(risk): assessRisk and sdlc.ts risk`.

### Task 3: PR body shows the tier

**Files:** Modify `scripts/prbody.ts`, `scripts/pr.ts`; Test `scripts/prbody.spec.ts`

**Interfaces:** `PrBodyInput.risk: Risk` replaces prbody's own `risk()`; `## Risk` is `Tier N` then a blank line then the reasons as bullets, or `Tier 0: none of the signals` when there are none. `## What the checks would miss` keeps reading `review`.

- [ ] Update the prbody Risk tests to pass a `Risk` and assert `## Risk\n\nTier 1\n\n- one-way door` and `## Risk\n\nTier 0: none of the signals`. Keep the How-to-revert and missed tests.
- [ ] Implement; in `pr.ts` build the Risk with `assessRisk` from `branchDiff(verify base)`, the local registry and `parseAccess(read(archPath))`. Run `node --test scripts/prbody.spec.ts scripts/pr.spec.ts`. Commit `feat(pr): the PR body shows the risk tier`.

### Task 4: CI reports the tier and, opted in, enforces one approval

**Files:** Modify `scripts/check.ts`, `templates/rig-check.yml` (header comment), `SECURITY.md`, `README.md`, `CHANGELOG.md`, `scripts/neutrality.spec.ts`; Test `scripts/check.spec.ts`

**Interfaces:** in `cmdCheck` at `ci` with a base: `risk = assessRisk({ files, lines, slugs, read, access: union(base, head), risk: config.risk, contractGlobs: config.contracts.files, ci: true })`. `report` prints `risk: tier N` and the reasons (stdout and step summary). With `config.risk.enforce`, `independentApproval` runs for every PR (not only when human rows were added); its block message is `tier N: <reason>`.

- [ ] Tests (reuse `prRun`/`overrideRun` style): a CI run prints `risk: tier`; a PR editing `.github/workflows/x.yml` prints `tier 2` and the two-reviewer line; a PR that deletes the base's Access row for its slug is still tier 2; with `risk.enforce: true` on the base and no approving review → `human-approval` block naming the tier; with an approval of the head commit → no block; with `enforce` off and no human rows → no block.
- [ ] Run, fail; implement; pass. Docs: SECURITY row and README say tiers are reported, `risk.enforce` moves the one-approval rule into rig-check (so a team can later drop GitHub's required-approvals setting when rung 3 arrives), tier 2 stays a suggestion. CHANGELOG entry. Raise the cap.
- [ ] `npm test && npm run typecheck`, quote the summary. Commit `feat(ci): report the risk tier; risk.enforce requires one approval`.

### After the tasks

One review of `git diff main...HEAD` (one fresh reviewer), one fix pass, `npm test` again.
