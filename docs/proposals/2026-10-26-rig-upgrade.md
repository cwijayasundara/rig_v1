# /rig:upgrade: upgrade a repo's rig without starting over

Status: built 2026-10-26 (`scripts/upgrade.ts`, `scripts/migrations.ts`, `skills/upgrade/SKILL.md`, the init hand-off in `cmdInit`). Decisions taken in the build: (1) a repo with no manifest has no base, so every differing file is a conflict the person decides; (2) in plugin mode (no vendored copy) upgrade runs migrations and sensor proposals only; (3) `init` and `init --full` on an install older than the plugin print a pointer to `/rig:upgrade` and change nothing.

## The ask (tester feedback, 2026-10-26)

> rig:upgrade should migrate the rig files without the need to start over. It should check if user introduced some
> customizations (eg linters) and ask what to do.

## How upgrade works today

Re-run `vendor --standalone` from a newer plugin (`scripts/vendor.ts`, `cmdVendor`).

- `.rig/bin/*` and `.claude/skills/rig-*` (and agents, hooks) are overwritten blindly: a local edit is lost silently.
- `.claude/settings.json` is merged safely (`mergeMissing`: the team's keys win, arrays unioned).
- `.rig/sensors.json` is never touched: the team's linters are safe, but new sensors in a newer stack pack never arrive.
- The only version guard is `.rig/bin/VERSION` (refuses a downgrade without `--force`).
- A format change has no migration: the pre-registry `sensors.json` only prints a replacement (`scripts/stackinit.ts`, `upgradeText`).

The root gap: rig does not record what it installed, so it cannot tell a user edit from an old version.

## Agreed direction (the standard pattern: Debian conffiles, `copier update`, Rails `app:update`)

1. **Manifest.** `vendor` writes `.rig/bin/MANIFEST.json`: plugin version plus a hash of every file it wrote. Committed.
2. **Three-way per file:** base (manifest hash) vs disk vs new plugin copy.
   - unchanged since install → replace silently
   - changed locally, unchanged upstream → keep silently
   - changed both sides → ask, all conflicts in one `AskUserQuestion` batch: keep mine / take new / show diff /
     write `<file>.rig-new` to merge later
3. **Ownership classes:**
   - harness code (`.rig/bin`, vendored skills, agents, hooks): rule 2
   - team-owned config (`sensors.json`, `settings.json`, CLAUDE.md guides block, README rig block, `docs/prd/README.md`):
     never overwritten; diff against the new stack pack and *propose additions* ("the node pack now has a `typecheck`
     sensor; add it?"). A changed lint command is the team's choice and is left alone.
   - artifacts (`.rig/product/**`, change records): only migrations touch them
4. **Numbered, idempotent migrations** (`scripts/migrations/<version>.ts`), run for every version between the installed one
   and the new one. First candidate: the pre-registry `sensors.json`.
5. **Dry run first, on a branch.** `/rig:upgrade` prints the plan (replaced / kept / conflicting files, migrations, proposed
   sensors); on yes it applies it on `chore/rig-upgrade-X.Y.Z`, re-runs `sync` and `baseline`, and stops for review. Never
   pushes to main.
6. **Extension points over edits:** the more customisation lives in team-owned files (`sensors.json`, a `.rig/local/` folder
   for extra guides or skill addenda that rig reads but never ships), the fewer conflicts rule 2 hits.

**Repos installed before the manifest:** on the first upgrade, use the installed version's copy as the base (compare
against what that plugin version shipped). Any difference from it counts as a local edit and is asked about. After that the manifest takes over.

## Size

Medium: manifest in `vendor.ts`, an `upgrade` command and skill, the migration runner, sensor proposals, a spec per
conflict case. Note the script size cap in `scripts/neutrality.spec.ts`; it will need raising with a reason.

## Open for the brainstorm

- Where to get the "installed version's copy" for a manifest-less repo (git tag of the plugin? a published archive?).
- Plugin-install mode (not standalone): `claude plugin update` covers the code; does `/rig:upgrade` then run only
  migrations and sensor proposals?
- Whether `/rig:init` re-run should detect an existing install and hand off to `/rig:upgrade`.
