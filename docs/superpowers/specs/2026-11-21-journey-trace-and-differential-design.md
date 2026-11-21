# Journey traces and the differential runner (pilot plan §3)

Status: draft for approval. Plan items: the generated project-local `verify` skill, and the differential-test runner.

## Intent and why

Both items check agent-written code with evidence the agent did not write. The Claude Code team's verification post
(claude.dev/blog/how-the-claude-code-team-thinks-about-verification) separates "does it work" from "does it still behave
like the old one". Rig has the first half only in part: `/rig:app` already boots the app and walks journeys, but the
evidence is a pass/fail per step, with no observed values, no screenshot and no way to compare two revisions.

## Decision

Approach B, picked by the owner: **one journey driver, one trace format; the differential runs the same driver on the
base revision and on the head and compares the two traces.** The verify skill is an extension of `/rig:app`, not a new
skill. Code with no app (pure libraries) is out of scope for the first version.

Approaches considered: (A) two sensors, each with its own driver; (C) a function-level differential with no app.
A writes each journey twice. C does not use the verify skill and misses UI and integration drift.

## Goals

1. A journey step records what it observed, not only that it passed: `evidence.json` steps gain `observed` (JSON,
   truncated to 2 KB) and optional `shot` (a file under `$RIG_VERIFY_STATE/shots/`).
2. A reviewer can open the trace and screenshots of the latest approved run from the PR ("Review first" links them).
3. `S app diff <app> [--base <ref>]` runs the approved driver in a worktree of the base ref and on the head, then
   compares the traces by step name after normalising irrelevant differences.
4. A difference blocks unless it is on the approved list kept on the base branch. The report lists, by ID: inputs run
   (steps), differences found, differences approved.
5. Drift: when the feature map or driver no longer matches the app, `/rig:app` is the one place that updates it, and the
   existing `stale` and `changed` states keep working.

## Non-goals and anti-goals

- No new skill, no second driver format, no screenshot comparison by pixels (screenshots are for the human reviewer).
- Not a replacement for holdout cases or unit tests. A passing diff does not prove the new behaviour is right; it proves
  it did not move. Never report a clean diff as correctness.
- Anti-goal: an agent that can edit the approved list in the same PR and turn the block green.

## Constraints

- Base-controlled CI: the approved list (`.rig/verify/<app>/differences.json`) and the normalisation rules are read from
  the base ref, as the holdout cases are. A PR that edits them gets a warning and the base copy still decides.
- The driver is a command from the repo; in CI only a person-approved driver runs (existing rule). The base worktree runs
  the base's own driver bytes, so the oracle is not influenced by the PR.
- Secrets are stripped from the driver's environment (existing `SECRETISH` filter); ports are `PORT=0`.
- Script limits: `scripts/app.ts` is 156 lines; put the diff logic in a new `scripts/appdiff.ts`, each at most 500 lines.
  Skill text total stays under 102,000 bytes (it is at 101,994 now, so the `app` skill must stay the same size or shrink
  something else).

## Design

**Trace** (`templates/verify/lib.mjs`, `scripts/app.ts`): `step(name, fn)` records `observed` when `fn` returns a JSON-able
value; `await shot(name)` (Playwright-style helper passed to the driver, a no-op without a browser) saves a file and sets
`shot` on the current step. `runDriver` already requires `evidence.json`; it additionally copies the trace and shots to
`.rig/changes/<slug>/evidence/journeys/<app>/` for the PR.

**Normalisation** (`app.json`, new optional `normalize`): a list of `{ "step": "<glob>", "replace": "<regex>", "with":
"<text>" }`. Built-in defaults: ISO timestamps, UUIDs, `ms`, port numbers, `at`.

**Runner** (`scripts/appdiff.ts`): `appDiff(app, baseRef)` creates a worktree of `baseRef`, runs the driver there and on the
head with separate `RIG_VERIFY_STATE` dirs, then returns rows `{ id: "D-<step slug>", step, before, after, approved }`.
A step missing on one side is a difference (`before` or `after` is `absent`). The ID is stable: the step name, not the
position. Result is a by-ID report in the shape of `holdout --ci` (required, executed, differences, approved, unapproved),
written to `GITHUB_STEP_SUMMARY` in CI.

**Approved list**: `differences.json`: `[{ id, reason, by, at }]`. A person adds a row on a reviewed change. An entry whose
step no longer differs is reported as stale, never as a failure.

**Trigger** (my call): an intent or plan with `replaces: <app>` (the agent sets it when the change rewrites existing
behaviour; the chart reviewer can add it). CI requires the diff report for that app when `replaces` is on the base's
intent, so a PR cannot drop it. Without `replaces`, no diff runs.

**PR**: "Review first" gains the trace and screenshot links and `Differential: N steps, M differences, K approved` (or
`not applicable`). An unapproved difference is listed first under "Flags".

## Build order

1. Trace: `observed` and `shot` in `lib.mjs`, copy to the change's evidence, PR links, `/rig:app` text (one paragraph).
2. Differential: `appdiff.ts`, `S app diff`, normalisation, approved list, by-ID report.
3. CI: required when `replaces` is on the base intent; reads the list from the base ref.

Each step has specs that fail without it, `npm run test:changed` per step, and the usual note that `e2e:scripted` is run by a
person because skill text changes.

## Left to the builder

- Exact `shot` signature and how it finds a browser; the glob matcher for `normalize`; the worktree clean-up on a
  crash (use the existing `reap` pattern).
- Wording of the one `/rig:app` paragraph, within the skill size budget.

## Open items for the owner

- Is `replaces: <app>` in the intent the right trigger, or should the agent run the diff whenever an approved app exists?
  I chose the explicit flag because an always-on diff would block every feature change that legitimately adds behaviour.
