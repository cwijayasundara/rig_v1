# /rig:upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/rig:upgrade` moves a standalone repo's rig files to a newer plugin version without starting over, keeping the team's local edits and asking only where both sides changed a file.

**Architecture:** `vendor` records a manifest (plugin version plus a hash of every harness file it wrote). A new `upgrade` command classifies each harness file three ways (manifest hash, disk, new plugin copy), runs numbered idempotent migrations, and proposes new stack-pack sensors without touching `sensors.json`. It prints a dry-run plan first; `--apply` does the work on a `chore/rig-upgrade-X.Y.Z` branch, re-runs `sync` and `baseline`, and never pushes.

**Tech Stack:** TypeScript on Node >= 22.18 (type stripping), `node:test`, the existing `scripts/` harness.

**Spec:** `docs/proposals/2026-10-26-rig-upgrade.md`, plus the three decisions taken 2026-10-26 (below).

## Global Constraints

- Decisions (2026-10-26): a repo with no manifest has **no base**; every harness file that differs from the new copy is a conflict, asked once, and the manifest takes over afterwards. In plugin-install mode (no `.claude/skills/rig-*`) `/rig:upgrade` runs **only migrations and sensor proposals**. `init` on an existing install **points to `/rig:upgrade`** and stops.
- Manifest: `.rig/bin/MANIFEST.json`, `{ "version": string, "files": { [repoRelativePosixPath]: sha } }`, hashed with `core.sha`. Committed.
- Ownership: harness files (`.rig/bin/*`, `.rig/githooks/*`, `.rig/templates/**`, `.rig/mod/**`, `.claude/skills/rig-*`, `.claude/agents/rig-*`, `.rig/bin/VERSION`) get the three-way rule. Team-owned files (`.rig/sensors.json`, `.claude/settings.json`, CLAUDE.md, README.md, `docs/prd/*`, `.claude-plugin/marketplace.json`) are never in the manifest and never overwritten by it.
- Conflict choices: `mine`, `new`, `later` (keep mine and write `<file>.rig-new`). `show diff` is a read-only `upgrade --diff <file>`, not a stored choice.
- Never push, never touch main, never `--no-verify`. Apply refuses a dirty working tree.
- Scripts run from the plugin only (`IS_VENDORED` fails), like `vendor`.
- Per CLAUDE.md: `npm test` and `npm run typecheck` are run and quoted; one review of `git diff main...HEAD` at the end; raise `SCRIPTS_CAP` in `scripts/neutrality.spec.ts` with a reason prefixed to the comment list.

## Review Focus

- A `.rig-new` file left by an earlier upgrade: it is never classified or hashed, and a re-run overwrites it.
- Plugin older than the installed `.rig/bin/VERSION`: refused without `--force`, as `vendor` does.
- `.claude/settings.json` that is not plain JSON: refused before any write, so no half-applied upgrade.
- Already current (every file `noop`, no migrations, no proposals): no branch is created, output says so.
- The `chore/rig-upgrade-X.Y.Z` branch already exists: refuse with its name, never reuse or reset it.
- Hook scripts keep mode 755 after a replace.

---

### Task 1: Split `vendor` into file generation and writing, and write the manifest

**Files:**
- Modify: `scripts/vendor.ts`, `scripts/githooks.ts` (export the hook script texts)
- Test: `scripts/vendor.spec.ts`

**Interfaces:**
- Produces (`vendor.ts`): `export function harnessFiles(standalone: boolean): Map<string, string>` (repo-relative posix path to final text: `.rig/bin/*.ts`, hook scripts, `.rig/bin/VERSION`, and when standalone the skills, agents, templates, `.rig/mod/**`); `export const MANIFEST = '.rig/bin/MANIFEST.json'`; `export type Manifest = { version: string; files: Record<string, string> }`; `export function readManifest(): Manifest | null`.
- Produces (`githooks.ts`): `export const HOOK_SCRIPTS: () => [rel: string, text: string][]`; `writeHookScripts` is rewritten on top of it, behaviour unchanged.

- [ ] **Step 1: Write the failing tests** in `vendor.spec.ts`:
  - `vendor --standalone writes a manifest of the harness files`: after `vendor --cloud`, `.rig/bin/MANIFEST.json` parses; `version` equals `.rig/bin/VERSION` trimmed; `files['.rig/bin/sdlc.ts']` equals `sha(file text)`; includes a `.claude/skills/rig-start/SKILL.md`, a `.rig/mod/hooks/dashboard.tsx` and `.rig/githooks/pre-commit` entry; has **no** key for `.claude/settings.json`, `CLAUDE.md`, `README.md`, `.claude-plugin/marketplace.json` or itself.
  - `plain vendor (not standalone) manifest lists only .rig/bin and .rig/githooks files`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/vendor.spec.ts`. Expected: the two new tests FAIL (no manifest); the existing ones pass.
- [ ] **Step 3: Refactor** `vendor.ts`: move the `writeFile(...)` calls for harness files into `harnessFiles()`; `cmdVendor` writes the map (chmod 755 on `.rig/githooks/*`), keeps the `fs.rmSync('.rig/mod')` before writing, then runs the unchanged merge steps (`mergeHooks`, `routeClaudeMd`, `routeReadme`, `routePrdDocs`, marketplace write), then writes `MANIFEST` (sorted keys, `JSON.stringify(.., null, 2) + '\n'`) from the map's hashes. The marketplace file stays in the merge step.
- [ ] **Step 4: Run** `npm run typecheck` and `node --disable-warning=ExperimentalWarning --test scripts/vendor.spec.ts scripts/githooks.spec.ts`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add scripts/vendor.ts scripts/githooks.ts scripts/vendor.spec.ts && git commit -m "feat(upgrade): vendor writes a manifest of the harness files it installed"`

### Task 2: Three-way classification

**Files:**
- Create: `scripts/upgrade.ts`
- Test: `scripts/upgrade.spec.ts`

**Interfaces:**
- Consumes: `Manifest` from Task 1.
- Produces: `export type Verdict = 'noop' | 'replace' | 'keep' | 'add' | 'delete' | 'conflict'`; `export function classify(base: Record<string, string> | null, disk: Map<string, string | null>, next: Map<string, string>): Map<string, Verdict>` (pure; `disk` null = file absent; `next` is `harnessFiles`; a path in `base` or `disk` but not in `next` is a removal). Hashes via `sha`.

Rules (the test table): disk == next: `noop`. Absent on disk: `add` (never a conflict). With a base: disk == base and next differs: `replace`; disk != base and next == base: `keep`; disk != base and next != base: `conflict`. In `next` with no base entry and no manifest: differs, so `conflict`. Removed upstream (not in `next`): disk == base: `delete`; disk != base or no base: `conflict`. `.rig-new` paths are skipped by the caller, not here.

- [ ] **Step 1: Write the failing tests**, one per row above (`classify: unchanged since install is replaced`, `local edit with unchanged upstream is kept`, `both changed is a conflict`, `no manifest: any difference is a conflict`, `no manifest: identical is noop`, `missing file is added`, `removed upstream and untouched is deleted`, `removed upstream and edited is a conflict`).
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/upgrade.spec.ts`. Expected: FAIL, `classify` not defined.
- [ ] **Step 3: Implement** `classify` in `scripts/upgrade.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(upgrade): three-way classification of harness files"` (add both files).

### Task 3: Sensor proposals

**Files:**
- Modify: `scripts/upgrade.ts`
- Test: `scripts/upgrade.spec.ts`

**Interfaces:**
- Produces: `export function proposeSensors(sensorsJson: string, packs: ReturnType<typeof loadPacks>['packs']): { stack: string; sensors: Record<string, unknown>[] } | null`. Reads the team's `sensors.json` `stack` field, finds that pack, and returns the pack sensors whose `id` is absent from the team's list. Returns null for an unparseable or old-shape file (the migration handles those), an unknown stack, or nothing to add.

- [ ] **Step 1: Write the failing tests**: `proposes a pack sensor the team lacks` (team has lint/unit, node pack has `types` → proposal is exactly `types`); `a team's changed lint command is not proposed or touched`; `a sensor the team removed is not re-proposed when its id is still declared elsewhere` is out of scope, skip; `old-shape file, unknown stack and fully covered registry all return null`.
- [ ] **Step 2: Run** the spec file. Expected: FAIL.
- [ ] **Step 3: Implement** `proposeSensors` using `isRegistryShape` from `registry.ts`.
- [ ] **Step 4: Run** the spec file. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(upgrade): propose new stack-pack sensors, never edit the team's"`.

### Task 4: Numbered migrations

**Files:**
- Create: `scripts/migrations.ts`
- Test: `scripts/upgrade.spec.ts`

**Interfaces:**
- Produces: `export type Migration = { id: string; since: string; run: (root: string) => string[] }` (`run` is idempotent and returns the notes to print); `export const MIGRATIONS: Migration[]` (ordered); `export function pendingMigrations(installed: string, next: string): Migration[]` (`installed < since <= next`, semver compare; empty `installed` counts as `0.0.0`); `export function runMigrations(list: Migration[], root: string): string[]`.
- First migration `pre-registry-sensors`, `since` = the plugin version this ships in (read `.claude-plugin/plugin.json` at execution time and use it): when `.rig/sensors.json` is not registry shape, write `.rig/sensors.json.rig-new` containing the detected pack's registry (reuse `packsFor`/`packFile` logic from `stackinit.ts`, export what is needed) and return a note naming it; never write `sensors.json`.

- [ ] **Step 1: Write the failing tests**: `pendingMigrations returns only versions after installed and up to next`; `an unknown installed version runs everything`; `pre-registry-sensors writes sensors.json.rig-new and leaves sensors.json byte-identical`; `running it twice changes nothing more`; `a registry-shape sensors.json is untouched and no .rig-new appears`.
- [ ] **Step 2: Run** the spec file. Expected: FAIL.
- [ ] **Step 3: Implement** `scripts/migrations.ts` with the signatures above.
- [ ] **Step 4: Run** the spec file. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(upgrade): numbered idempotent migrations, first the pre-registry sensors"`.

### Task 5: `upgrade` command, dry run

**Files:**
- Modify: `scripts/upgrade.ts`, `scripts/sdlc.ts` (add `upgrade: cmdUpgrade` to `COMMANDS`), `scripts/vendor.ts` (`VENDORED` gains `'upgrade'`, `'migrations'`)
- Test: `scripts/upgrade.spec.ts`

**Interfaces:**
- Produces: `export function cmdUpgrade(args: Args): void`. No `--apply`: prints the plan and changes nothing. `--json` prints `{ from, to, standalone, files: Record<rel, Verdict>, migrations: string[], proposals: ... | null }`. `--diff <rel>` prints a unified diff of disk vs new copy (shells `git diff --no-index`). Exports `buildPlan(): Plan` used by apply.
- Gates before any output: `IS_VENDORED` fail; plugin older than `.rig/bin/VERSION` fail unless `--force` (reuse `older` from `vendor.ts`, export it); invalid `.claude/settings.json` fail with the `vendor` message; no `.rig/` fail with a pointer to `init`.
- Standalone is detected by `.claude/skills/rig-start/SKILL.md`; otherwise `files` is empty and only migrations and proposals are planned.

- [ ] **Step 1: Write the failing tests** (helper: vendor a repo at "old" by running `vendor --cloud`, then edit files / bump `.rig/bin/VERSION` and the manifest to simulate old): `dry run on a fresh vendor reports everything noop and no branch`; `a locally edited skill with unchanged upstream is keep`; `an edited .rig/bin script after the plugin changed it is conflict` (simulate by editing the manifest hash and the disk file); `no manifest: edited files are conflicts, untouched ones noop`; `plugin mode lists no files, only migrations and proposals`; `refuses a downgrade without --force`; `refuses invalid settings.json`; `ignores *.rig-new files`; `--diff prints the diff for one file`. Each asserts the working tree is unchanged (`git status --porcelain`).
- [ ] **Step 2: Run** the spec file. Expected: FAIL (`usage: sdlc.ts <...>` since the command is unknown).
- [ ] **Step 3: Implement** `buildPlan` and `cmdUpgrade` (dry-run branch) using `harnessFiles`, `readManifest`, `classify`, `pendingMigrations`, `proposeSensors`; text output groups by verdict with counts first, conflicts listed by path.
- [ ] **Step 4: Run** the spec file and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(upgrade): sdlc upgrade prints the plan and changes nothing"`.

### Task 6: `upgrade --apply`

**Files:**
- Modify: `scripts/upgrade.ts`
- Test: `scripts/upgrade.spec.ts`

**Interfaces:**
- Consumes: `buildPlan`, `harnessFiles`, `runMigrations`, `cmdSync`, `cmdBaseline`, `sanctionWrites`.
- Produces: `--apply [--decide <json>] [--add-sensors <id,id>]`. `--decide` is `{ "<rel>": "mine" | "new" | "later" }`. Apply refuses (nothing written) when: the tree is dirty; any conflict has no decision (message lists them); the branch `chore/rig-upgrade-<to>` exists. When the plan is all `noop` with no migrations or proposals, prints "already current" and creates no branch.

Apply order: create the branch; write `replace`/`add` files (chmod 755 for `.rig/githooks/*`); delete `delete` files; for conflicts `new` writes the new copy, `mine` writes nothing, `later` writes `<rel>.rig-new`; in standalone also run `mergeHooks`/`route*`/marketplace (export one `mergeProjectFiles()` from `vendor.ts` for this); run migrations; append chosen `--add-sensors` entries to `.rig/sensors.json` (team file, reviewed on the branch); write the manifest recording the **new upstream hash for every file** (so a kept local edit is silent next time until upstream changes again) and the new version; `sanctionWrites`; run `sync` then `baseline`; print the branch name and "review and merge; nothing was pushed".

- [ ] **Step 1: Write the failing tests**: `apply replaces an unchanged file and records the new hash`; `apply keeps a local edit and next dry run is noop for it`; `conflict with decision new overwrites, mine keeps, later keeps and writes .rig-new`; `apply without a decision for a conflict refuses and writes nothing`; `apply refuses a dirty tree`; `apply refuses when the branch exists`; `apply on a current install creates no branch`; `apply adds chosen sensors to sensors.json and leaves other sensors byte-identical`; `hook scripts stay mode 755`; `apply never pushes` (repo has no remote; assert the current branch is the new one and main is unchanged).
- [ ] **Step 2: Run** the spec file. Expected: FAIL.
- [ ] **Step 3: Implement** apply as described; one `git` helper call per step from `core.ts`.
- [ ] **Step 4: Run** `npm run typecheck` and the spec file. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(upgrade): apply the plan on a chore branch and stop for review"`.

### Task 7: The skill, the init hand-off and docs

**Files:**
- Create: `skills/upgrade/SKILL.md`
- Modify: `scripts/stackinit.ts` or `scripts/sdlc.ts` (`cmdInit`: hand-off), `skills/init/SKILL.md` (one line), `scripts/vendor.spec.ts` (skill count 16 to 17, add `'upgrade'` to the named list), `scripts/neutrality.spec.ts` (`SCRIPTS_CAP`), `README.md` (command list), `CHANGELOG.md`, `docs/proposals/2026-10-26-rig-upgrade.md` (status line: built, with the three decisions)
- Test: `scripts/initskill.spec.ts`, `scripts/upgradeskill.spec.ts` (new)

**Interfaces:**
- Consumes: the command surface from Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**: `init on an install whose .rig/bin/VERSION is older than the plugin prints the upgrade pointer (skillRef('upgrade')) and exits 0 without re-initialising`; `init on a current install is unchanged`; `upgradeskill.spec`: the skill runs `upgrade` (dry run) first, uses one `AskUserQuestion` for all conflicts with the four choices (keep mine, take new, show diff, write .rig-new), passes `--decide`, runs `--apply`, and never contains `git push`; the skill's `allowed-tools` has no `git push`. Follow the style of `scripts/prskill.spec.ts`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/initskill.spec.ts scripts/upgradeskill.spec.ts scripts/vendor.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Write** `skills/upgrade/SKILL.md` (model `sonnet`, effort `medium`; frontmatter like `skills/pr/SKILL.md`; under 60 lines), add the init hand-off, update the pinned counts and docs, raise `SCRIPTS_CAP` by the measured growth with the reason first in the comment.
- [ ] **Step 4: Run** `npm run typecheck && npm test`. Expected: all PASS; quote the totals.
- [ ] **Step 5: Commit** `git commit -m "feat(upgrade): the /rig:upgrade skill, the init hand-off, docs"`.

### Task 8: Prove it end to end, then one review

- [ ] **Step 1:** In a scratch copy of a vendored repo (scratchpad dir): vendor, edit one skill and one `.rig/bin` script, bump the plugin version, run `upgrade`, `upgrade --apply --decide ...`; confirm by eye that the branch holds the intended changes only. Quote the output.
- [ ] **Step 2:** Run `npm test` and `npm run typecheck` once more; quote the totals.
- [ ] **Step 3:** One review of `git diff main...HEAD` (`/code-review`), fix findings in one wave, re-run `npm test`.
- [ ] **Step 4:** Update memory (`prd-folder-and-upgrade.md`): built, hash, what is deferred.
