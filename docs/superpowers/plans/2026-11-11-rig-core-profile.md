# rig-core Vendor Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sdlc.ts vendor --standalone --profile core` copies only the rig-core skills and agents into a client repo, and that profile survives `upgrade` and `init --full`.

**Architecture:** A new vendored module `scripts/profile.ts` names the profile and its skill and agent sets. `harnessFiles` filters on it, the manifest records it, and `upgrade` reads it back from the manifest, so an upgraded core repo stays core. Core also drops the dashboard mod and its marketplace entry, uses a core-only README block, and skips the Maintain workflow.

**Tech Stack:** TypeScript on Node ≥ 22.18 (type stripping), `node:test`, the existing `testkit.ts` helpers (`makeRepo`, `sdlc`, `write`).

**Spec:** `docs/superpowers/2026-11-11-rig-readiness-and-adoption.md` §2 Step 0 item 2 ("rig-core for the client").

## Global Constraints

- Profiles: `full` (default, today's behaviour, byte-for-byte unchanged) and `core`.
- Core skills: `start`, `plan`, `approve`, `build`, `test`, `pr`, `waive`, `learn`, `rule`. `upgrade` still never vendors, whatever the profile.
- Core agents: `evaluator` (`plan` uses `rig:evaluator`). `architect` is chart-only and stays off.
- Off in core: `chart`, `testplan`, `wiki`, `arch`, `app`, `autonomy`, `init`, the `architect` agent, the dashboard mod (`.rig/mod/`), the `rig-local` marketplace and `rig@rig-local` entry, and the `rig-maintain.yml` workflow.
- `scripts/sdlc.ts` is at its 500-line cap. Any edit there must keep the line count at 500.
- Harness size cap is 12,000 (11,455 today). This change must add at most 150 capped lines. Do not raise the cap.
- Every skill and guide stays ≤ 60 lines, and every script ≤ 500.
- `npm test` and `npm run typecheck` pass. Quote the output.

## Review Focus

1. **Switching full → core on a repo that already has a full vendor:** the off skill folders must be removed, not left behind. An off skill the person edited is kept, and vendor prints one line naming it.
2. **`upgrade` on a core repo:** it must not re-add the off skills, and it keeps `profile: "core"` in the new manifest.
3. **An old manifest with no `profile` key** (every repo vendored before this change) reads as `full`, so `upgrade` there does not delete anything.
4. **A bad flag value:** `--profile` with no value, `--profile Core` or `--profile lite` fails with exit 1 and names the valid values. `--profile core` without `--standalone` fails too, because a plain vendor copies no skills.
5. **Dangling commands:** no core skill and no core README block may name an off command (`/rig:chart`, `/rig-arch`, and so on), or a person is told to type a command that does not exist.

---

### Task 1: Profile module, vendor filtering, manifest, stale removal

**Files:**
- Create: `scripts/profile.ts`
- Modify: `scripts/vendor.ts` (`VENDORED`, `Manifest`, `harnessFiles`, `mergeProjectFiles`, `mergeHooks`, `cmdVendor`)
- Test: `scripts/profile.spec.ts` (new; uses `makeRepo`, `sdlc`, `write` from `./testkit.ts` and the `walk` helper pattern from `vendor.spec.ts`)

**Interfaces:**
- Produces, in `scripts/profile.ts`:
  - `export type Profile = 'full' | 'core'`
  - `export const CORE_SKILLS: readonly string[]` and `export const CORE_AGENTS: readonly string[]` (values from Global Constraints)
  - `export const OFF_COMMANDS: readonly string[]` = `['chart','testplan','wiki','arch','app','autonomy','init']`
  - `export function parseProfile(v: string | boolean | undefined): Profile`: `undefined` → `'full'`; `'core'`/`'full'` returned as is; anything else calls `fail('unknown profile "<v>": use core or full')`. `true` (a bare flag) also fails.
  - `export const skillIn = (p: Profile, name: string): boolean` and `agentIn = (p: Profile, file: string): boolean` (`file` is `evaluator.md`). Both are always true for `full`.
- Produces, in `scripts/vendor.ts`:
  - `Manifest = { version: string; profile?: Profile; files: Record<string, string> }`
  - `harnessFiles(standalone: boolean, profile: Profile = 'full'): Map<string, string>`
  - `mergeProjectFiles(written: string[], profile: Profile = 'full'): void`
  - `export const manifestProfile = (m: Manifest | null): Profile => m?.profile ?? 'full'`

- [ ] **Step 1: Write the failing tests** in `scripts/profile.spec.ts`:
  - `vendor --standalone --profile core writes only the core skills and agents`: after `sdlc(repo, ['init'])` and the vendor call, the skill folders under `.claude/skills/` equal `CORE_SKILLS.map(s => 'rig-' + s)` sorted, `.claude/agents/` holds only `rig-evaluator.md`, `.rig/mod` does not exist, and `.claude/settings.json` has no `rig@rig-local` key in `enabledPlugins` and no `rig-local` key in `extraKnownMarketplaces`.
  - `the core manifest records the profile and hashes only what was written`: `MANIFEST.json` has `profile === 'core'`, and every key in `files` exists on disk.
  - `plain --standalone is unchanged and records no profile key` (back-compat): the skill set equals every `skills/*` folder except `upgrade`, and `profile` is undefined in the manifest.
  - `switching full to core removes untouched off skills and keeps an edited one`: vendor `--standalone`, append a line to `.claude/skills/rig-wiki/SKILL.md`, then vendor `--standalone --profile core`. `rig-chart/` is gone, `rig-wiki/SKILL.md` still exists, and stdout contains `kept .claude/skills/rig-wiki/SKILL.md (edited)`.
  - `bad profile values fail`: each of `['--profile']`, `['--profile','Core']` and `['--profile','lite']` with `--standalone` exits 1 with stderr matching `/use core or full/`. `['vendor','--profile','core']` with no `--standalone` exits 1 with stderr matching `/--profile needs --standalone/`.

- [ ] **Step 2: Run them and confirm they fail.** Run `node --disable-warning=ExperimentalWarning --test scripts/profile.spec.ts`. Expected: FAIL (the module is missing and the flag is ignored).

- [ ] **Step 3: Implement `scripts/profile.ts`** and add `'profile'` to `VENDORED`, since the vendored `vendor.ts` and `upgrade.ts` import it.

- [ ] **Step 4: Thread the profile through `vendor.ts`.**
  - `harnessFiles` skips skills where `!skillIn` and agents where `!agentIn`. Under core it does not call `dashboardFiles`.
  - In `mergeHooks`, under core, drop `rig@rig-local` from `enabledPlugins` and `rig-local` from `extraKnownMarketplaces` instead of adding them. `mergeProjectFiles` skips `writeMarketplace` under core.
  - `cmdVendor` reads `parseProfile(args.opt.profile)`, fails with `--profile needs --standalone` when the profile is given without `--standalone`, and writes `profile` into the manifest only when it is `core`. That keeps full manifests byte-identical.
  - **Stale removal:** before writing, for each key in the old manifest that `isHarnessPath` accepts and that is not in the new file set, delete the file when its disk hash equals the manifest hash. Otherwise keep it, print `kept <rel> (edited)`, and carry its old hash into the new manifest. Then remove empty `rig-*` skill folders.

- [ ] **Step 5: Run the tests and confirm they pass.** Run `node --disable-warning=ExperimentalWarning --test scripts/profile.spec.ts scripts/vendor.spec.ts`. Expected: all pass. `vendor.spec.ts` proves full is unchanged.

- [ ] **Step 6: Commit** with `feat(vendor): --profile core vendors only the rig-core skills`.

### Task 2: Core README block and no dangling commands

**Files:**
- Create: `templates/readme-rig-core.md` (at most 40 lines, keeping the `<!-- rig:begin … -->` / `<!-- rig:end -->` markers of `templates/readme-rig.md`)
- Modify: `scripts/vendor.ts` (`harnessFiles` template loop), `skills/approve/SKILL.md:18`, `skills/learn/SKILL.md:20`
- Test: `scripts/profile.spec.ts`

**Interfaces:**
- Consumes: `OFF_COMMANDS`, `CORE_SKILLS` and `harnessFiles(true, 'core')` from Task 1.
- Under core, `.rig/templates/readme-rig.md` holds the text of `readme-rig-core.md` (after `vendoredCommands`), and `readme-rig-core.md` itself is not copied. Under full, `readme-rig-core.md` is not copied either.

- [ ] **Step 1: Write the failing tests:**
  - `no core skill or core README names an off command`: for each text in `harnessFiles(true, 'core')` whose key ends in `SKILL.md` or is `.rig/templates/readme-rig.md`, assert there is no match for `new RegExp('/rig[:-](' + OFF_COMMANDS.join('|') + ')\\b')`. Call `harnessFiles` in-process. Check that `/rig:approve` does not trip `app`.
  - `the core README block is the core template`: vendored `.rig/templates/readme-rig.md` contains `<!-- rig:begin` and `/rig-start`, and contains neither `/rig-chart` nor `.rig/product/`.
  - `full vendors no core template`: `.rig/templates/readme-rig-core.md` is absent after a plain `--standalone`.

- [ ] **Step 2: Run them and confirm they fail.** Expected: the off-command test reports `approve` (`/rig:arch`) and `learn` (`/rig:arch`), and the README test fails on `/rig-chart`.

- [ ] **Step 3: Write `templates/readme-rig-core.md`.** It is the one-change flow only: `start → plan → approve → build → test → pr`, plus `waive`, `learn` and `rule`, the floor (sensors, git hooks, CI `rig-check`, `ai-review`) and the `.rig/` file table without `product/` or `wiki/`. Reword the two skill lines so they name the artefact, not the command. For approve: "the layers block a person proposed in `architecture.md`". For learn: "in the `rig-layers` format of `architecture.md`".

- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --disable-warning=ExperimentalWarning --test scripts/profile.spec.ts scripts/vendor.spec.ts scripts/initskill.spec.ts scripts/removed.spec.ts`. Expected: all pass.

- [ ] **Step 5: Commit** with `feat(vendor): core README block and no off-profile commands in core skills`.

### Task 3: Profile survives upgrade and init --full

**Files:**
- Modify: `scripts/upgrade.ts:84` and `:188-190`, `scripts/vendor.ts` (`installStandalone`), `scripts/sdlc.ts:79` (edit in place: the count stays at 500)
- Test: `scripts/profile.spec.ts`

**Interfaces:**
- Consumes: `manifestProfile`, `harnessFiles(standalone, profile)`, `mergeProjectFiles(written, profile)` and `parseProfile`.
- Produces: `installStandalone(workflows: boolean, profile: Profile = 'full'): string`. Its `cmdVendor` call passes `opt: { standalone: true, ...(profile === 'core' ? { profile } : {}) }`.

- [ ] **Step 1: Write the failing tests:**
  - `upgrade on a core repo keeps it core`: vendor `--standalone --profile core`, then run `upgrade --json` (the dry-run form `scripts/upgrade.spec.ts:23` uses). No file key starts with `.claude/skills/rig-chart` and none is `add` for an off skill. After a real apply, the new manifest has `profile === 'core'`.
  - `upgrade on a pre-profile manifest stays full`: vendor `--standalone` (its manifest has no `profile` key), then run `upgrade --json`. There are no `delete` verdicts for `.claude/skills/`.
  - `init --full --profile core vendors core and skips the maintain workflow`: `sdlc(repo, ['init','--full','--workflows','--profile','core'])`. The skills equal the core set, `.github/workflows/rig-check.yml` exists, and `.github/workflows/rig-maintain.yml` does not.

- [ ] **Step 2: Run them and confirm they fail.** Expected: the upgrade test sees off skills as `add`, and init writes all skills plus `rig-maintain.yml`.

- [ ] **Step 3: Implement.**
  - In `upgrade.ts`, set `const profile = manifestProfile(raw)` and pass it to `harnessFiles` and `mergeProjectFiles`. Write `...(profile === 'core' ? { profile } : {})` into the new manifest.
  - In `installStandalone`, skip the `rig-maintain.yml` pair under core.
  - In `sdlc.ts:79`, call `installStandalone(Boolean(args.opt.workflows), parseProfile(args.opt.profile))` on that same line, importing `parseProfile` on an existing import line.

- [ ] **Step 4: Verify.** Run `npm test && npm run typecheck`, then `wc -l scripts/sdlc.ts`. Expected: everything passes (the size spec included), and `sdlc.ts` is still 500 lines.

- [ ] **Step 5: Commit** with `feat(upgrade): the core profile survives upgrade and init --full`.

### After the tasks

Do one Opus review of `git diff main...HEAD`, fix its findings in one wave, and run `npm test` again. Add a CHANGELOG `Unreleased` line: "`vendor --standalone --profile core` and `init --full --profile core`: rig-core only (see the readiness doc)."
