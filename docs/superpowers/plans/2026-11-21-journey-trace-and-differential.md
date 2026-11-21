# Journey traces and differential runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Journey steps record what they observed (and a screenshot), and `S app diff` compares the base revision's trace with the head's, blocking on any unapproved difference.

**Architecture:** Extend the existing `/rig:app` driver helper (`templates/verify/lib.mjs`) and `scripts/app.ts`; put the comparison in a new `scripts/appdiff.ts` that runs the approved driver in a base worktree (`withBaseTree`) and on the head. The approved-differences list and `replaces:` trigger are read from the base ref in CI.

**Tech Stack:** Node 22 TypeScript scripts, `node --test` specs, the `makeRepo`/`sdlc` helpers in `scripts/testkit.ts`.

**Spec:** `docs/superpowers/specs/2026-11-21-journey-trace-and-differential-design.md`

## Global Constraints

- Scripts at most 500 lines each; `scripts/check.ts` is at exactly 500 lines, so edit its existing line, never add one.
- Skills total at most 102,000 bytes (101,994 now): the `app` skill text may grow only by trimming elsewhere in the same commit.
- Observed values are JSON, truncated to 2 KB per step.
- Never run `npm test`, e2e or evals; run `npm run test:changed`. Say in one line that `e2e:scripted` needs a person (skill text changes).

## Review Focus

- A base that has an older `lib.mjs` records no `observed`: the runner overwrites the worktree's `.rig/verify/lib.mjs` with the plugin template so both sides record it.
- A step present on one side only is a difference (`absent`), never skipped.
- A driver that is flaky (differs between two head runs) must not read as a difference: run the head twice and treat steps that differ between them as `unstable`, reported and not blocking.
- An approved-list entry for a step that no longer differs is reported `stale`, not a failure.
- A PR that edits `differences.json` must not unblock itself: CI reads the base copy.

---

### Task 1: Trace with observed values and screenshots

**Files:**
- Modify: `templates/verify/lib.mjs:46-60`, `scripts/app.ts:75-87` (`runDriver`)
- Test: `scripts/journeys.spec.ts`

**Interfaces:**
- Produces: `evidence.json` steps `{ name, ok, ms, error?, observed?: unknown, shot?: string }`; `verify(app, fn)` passes `{ launch, step, shot }` to `fn`; `shot(name: string, bytes: Buffer | Uint8Array): Promise<string>` writes `$RIG_VERIFY_STATE/shots/<name>.png`, sets `shot` on the last step, returns the path.
- Produces: `runDriver` copies `evidence.json` and `shots/` to `.rig/changes/<slug>/evidence/journeys/<app>/` when `activeSlug()` is set (add param `keep?: string`).

- [ ] **Step 1: Failing specs** in `journeys.spec.ts`: (a) a step whose function returns `{ total: 900 }` yields `steps[0].observed` deep-equal `{ total: 900 }`; (b) a returned value over 2 KB is stored as a string ending `…(truncated)`; (c) `shot('cart', Buffer.from('x'))` makes `shots/cart.png` and `steps[n].shot === 'shots/cart.png'`; (d) a step returning nothing has no `observed` key.
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/journeys.spec.ts`; expect the four to FAIL.
- [ ] **Step 3:** In `lib.mjs`, `step` stores `observed` from the returned value (JSON round-trip, truncate at 2048 chars) and `shot` as above. In `runDriver`, copy the trace and shots after the run when `keep` is given.
- [ ] **Step 4:** Rerun the spec file; expect PASS. Run `npm run test:changed`.
- [ ] **Step 5:** Commit `feat(app): journey steps record observed values and screenshots`.

### Task 2: The differential runner

**Files:**
- Create: `scripts/appdiff.ts`, `scripts/appdiff.spec.ts`
- Modify: `scripts/app.ts` (add `diff` subcommand; export `listApps`, `runDriver` for the new file), `scripts/app.ts` usage line

**Interfaces:**
- Consumes: `withBaseTree(base, fn)` from `scripts/basetree.ts`; `runDriver`-style execution with `cwd` (add `cwd?: string` to `runDriver`).
- Produces in `appdiff.ts`:
  - `type Step = { name: string; ok: boolean; observed?: unknown }`
  - `type Diff = { id: string; step: string; before: unknown; after: unknown }` where `id = 'D-' + slug(step)` (lowercase, non-alphanumerics to `-`) and absence is the string `'absent'`
  - `normalise(steps: Step[], rules: { step: string; replace: string; with: string }[]): Step[]` (defaults: ISO timestamps, UUIDs, `:<port>`, applied to the JSON text of `observed`)
  - `compare(base: Step[], head: Step[], head2: Step[]): { diffs: Diff[]; unstable: string[]; executed: number }`
  - `report(diffs: Diff[], approved: { id: string }[], executed: number, unstable: string[]): { lines: string[]; unapproved: Diff[]; stale: string[] }` with lines in the holdout shape: `differential: N step(s) run, M difference(s), K approved, U unapproved` then one line per difference `D-<id>: <step>: <before> -> <after> (approved|UNAPPROVED)`
  - `appDiff(app: App, base: string): { ok: true; diffs: Diff[]; unstable: string[]; executed: number } | { ok: false; error: string }`: runs the driver in the base worktree (after copying the template `lib.mjs` over `.rig/verify/lib.mjs`), then twice on the head.
  - `approvedAt(base: string, app: string): { id: string; reason: string; by: string }[]` reads `.rig/verify/<app>/differences.json` with `git show <base>:...`; `[]` when absent or invalid.

- [ ] **Step 1: Failing specs** (pure functions first, no git): `normalise` makes two traces differing only in a timestamp, a UUID and a port equal; `compare` returns a difference for a changed `observed`, for a step present on one side (`'absent'`), and lists a step as `unstable` (not a difference) when `head` and `head2` disagree; `report` marks an id on the approved list approved, flags a list entry with no matching difference as `stale`, and prints the by-ID lines above.
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/appdiff.spec.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement the four pure functions, then `appDiff` and `approvedAt`. `slug(step)` collisions get `-2`, `-3` suffixes in step order.
- [ ] **Step 4:** Add an integration spec using the `shop` fixture (as in `journeys.spec.ts`'s `beforeEach`): approve the driver, commit as `main`, branch, change the server so the checkout total differs, make the driver `return` the total from its step, then `sdlc(repo, ['app', 'diff', 'shop', '--base', 'main'])` exits 1 and names `D-the-checkout-totals-what-was-added`; adding that id to `differences.json` on the base commit makes it exit 0 with `1 approved`.
- [ ] **Step 5:** Wire `app diff <app> [--base <ref>]` (base defaults to `defaultBase()`): print the report, append it to `GITHUB_STEP_SUMMARY` under `## Differential evidence`, exit 1 when any is unapproved. Run `npm run test:changed`.
- [ ] **Step 6:** Commit `feat(app): app diff compares the base and head journey traces by step id`.

### Task 3: Required in CI when the intent says `replaces`, and shown on the PR

**Files:**
- Modify: `scripts/app.ts` (`journeyFindings` gains a 4th param `base?: string | null` and appends `diffFindings`), `scripts/check.ts:266` (pass `i.base` in the existing call, no new line), `scripts/prbody.ts`, `scripts/pr.ts`
- Test: `scripts/appdiff.spec.ts`, `scripts/prbody.spec.ts`

**Interfaces:**
- Consumes: `appDiff`, `report`, `approvedAt` from Task 2; `frontmatter` from `scripts/core.ts`.
- Produces: `replacesOf(intentText: string): string | null` in `appdiff.ts` (the `replaces:` value of the intent's front matter); `diffFindings(base: string | null | undefined): Finding[]` in `appdiff.ts`: for each charted intent read at `base` (`git show`) with `replaces: <app>`, one `block` finding per unapproved difference (sensor `journeys`), one `block` when the diff could not run, none otherwise. `prBody` input `differential?: string` shown as `Differential: <line>` in "Review first"; its absence prints `Differential: not applicable`.

- [ ] **Step 1: Failing specs:** `replacesOf` returns `shop` for `replaces: shop` and `null` without it; `diffFindings` blocks on an unapproved difference when the base intent has `replaces: shop`, and is empty when only the PR's intent adds `replaces` (the base copy decides); a `differences.json` edited on the head does not approve (approvals come from the base); `prBody` with `differential: '1 step(s) run, 1 difference(s), 0 approved'` shows it in "Review first", and with none shows `Differential: not applicable`.
- [ ] **Step 2:** Run the two spec files; expect FAIL.
- [ ] **Step 3:** Implement as above. The PR line is the first line of `report(...).lines`; `pr.ts` computes it with `appDiff` only when the change's own intent has `replaces:` and an approved app exists, else `undefined`. An unapproved difference is also listed first under "Flags". `evidenceLinks` (in `prbody.ts`) gains a `[journey trace](<repo>/tree/<branch>/.rig/changes/<slug>/evidence/journeys)` link when that folder exists on the branch (spec goal 2).
- [ ] **Step 4:** Update `skills/app/SKILL.md` with one paragraph: a driver step may return its observed value, `shot(name, bytes)` for a UI, and `replaces: <app>` in the intent turns the base-versus-head diff on. Trim an equal number of bytes elsewhere in the same file (the size spec and `skilltext` pins must stay green).
- [ ] **Step 5:** `npm run test:changed`; expect all PASS. Tick the two §3 items in `docs/superpowers/plans/2026-11-19-two-gate-consumer-pilot.md` only for the parts done (leave the live-repo run unticked).
- [ ] **Step 6:** Commit `feat(app): differential required in CI for replacing changes; PR shows it`.
