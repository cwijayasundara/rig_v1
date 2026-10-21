# Native review in /rig:pr: design

Date: 2026-10-21. Status: approved by the person in chat (decisions 1 and 2 below).

## Intent

Replace rig's custom diff review (the `rig:evaluator` agent, diff mode) with Claude Code's bundled `/code-review` and `/security-review`, run on the change's delta before the PR is raised. Less custom code, a review Anthropic maintains, and security covered explicitly.

## Goals
- `/rig:pr` reviews only the delta (`base...HEAD` plus uncommitted changes) before any PR exists.
- Correctness review is `/code-review`; security review is `/security-review`. Both run once per change.
- Fixes land in the same commit as the change: one commit, one push, one PR.
- `review.md` is still written with `[category: <slug>]` tags so `scripts/learnmine.ts` keeps working.
- Rig-specific judgment rules (unannounced contract changes, brief non-goals) reach the reviewer through the target repo's `CLAUDE.md`.

## Non-goals
- Anthropic's OSS Scanner: it is an enrolment service for open-source projects, not a command, and cannot scan a delta.
- A CI review job (Claude Code GitHub Action): later, separate change.
- Replacing the secrets sensor (`secretsInDiff`) or any other deterministic sensor. They stay: free, block-level, no model.
- Chart review. `rig:evaluator` stays, trimmed to chart mode only (decision 1).

## Decisions
1. Keep the evaluator for chart mode only. Its diff-mode text is removed.
2. Rig review rules live in the target repo's `CLAUDE.md` (decision 2), because local `/code-review` reads `CLAUDE.md` and ignores `REVIEW.md`. Contract and non-goal checks are therefore advisory text; B-number coverage and frozen contracts remain enforced by sensors.
3. Effort: `medium` by default, `high` when plan.md `## Contracts` lists a contract change (rig has no tiers; tier is this repo's working convention), always passed explicitly (the command otherwise reuses the last typed level). *Builder's call.*
4. Order in `/rig:pr`: verify is fresh and passing, review and fix, verify again if anything was fixed, then `sdlc.ts pr` commits, pushes and opens the PR once.

## Flow (skills/pr/SKILL.md)
1. Read `base` from `verify.json`.
2. Run `/code-review <effort> <base>...HEAD`, then `/security-review`. Foreground, one run each, never repeated.
3. Write the findings to `.rig/changes/<slug>/review.md` in the existing shape: `verdict`, `## Findings` lines `[severity: ...] [category: ...] path:line: problem → fix`, `## Deferred`. Map `/security-review` findings to category `security`; `/code-review` findings to the existing categories (`correctness`, `contract`, `data`, `coupling`, `responsibility`, `abstraction`, `duplication`, `tests`).
4. Activate the change, fix every finding in one wave under the existing stop rules (no unplanned files, no frozen contract files, no weakened tests), run `sdlc.ts verify <slug>`; same failing check twice: stop and show the person.
5. Run `sdlc.ts pr <slug> --message "<type(scope): summary>"`. It commits code and `review.md` together, pushes, opens the PR. Post `review.md` as a PR comment when a PR exists.

`sdlc.ts pr` currently refuses without a fresh passing `verify.json`; that stays. The follow-up modes (`fix(review)`, `docs(review)`) and the end-the-active-change-on-follow-up behaviour in `scripts/pr.ts` are removed or folded into the single call.

## Changes by file
- `skills/pr/SKILL.md`: rewrite per the flow.
- `agents/evaluator.md`: delete diff-mode steps and the category list for diffs; keep chart mode. Update description. Keep the name (hooks, vendoring and model specs reference it).
- `templates/REVIEW.md`: keeps its review passes (the managed GitHub service reads them); adds a line saying the local review follows `CLAUDE.md` under `## Review`.
- `skills/init/SKILL.md` and the CLAUDE.md template it writes: add a `## Review` block of two lines (flag API or schema changes that plan.md `## Contracts` does not announce; flag anything the brief's non-goals exclude). Existing CLAUDE.md gets it in `CLAUDE.md.proposed`, never overwritten.
- `scripts/pr.ts` (+ spec): single-commit flow.
- `scripts/modelstate.ts`, `registry.ts` `model-role`: the evaluator model check applies to chart mode only; the diff review runs on the session's model.
- Docs: `README.md`, `DESIGN.md`, `CLAUDE.md` model table row ("Final review of a change's diff" becomes the native commands), `templates/readme-rig.md`, `scripts/journey.ts` label.
- Specs that assert the old text: `chartcheck.spec.ts`, `models.spec.ts`, `modelstate.spec.ts`, `registryhooks.spec.ts`, `vendor.spec.ts`, `learn*` fixtures: update to the new shape.

## Open risks (verify first, before building)
- Can a plugin skill start `/code-review` and `/security-review` (Skill tool or plain-language request) and read the findings back? If not, fall back to launching a general-purpose agent whose brief says to run them.
- Whether `/security-review` accepts a base target or only the pending changes on the branch. If only the latter, the delta is the branch diff, which is the same set.
- Verification: `npm test` plus `npm run typecheck`; a scripted e2e stage for the new `/rig:pr` order.

## Resolved by the spike (2026-10-21, Claude Code 2.1.306)
- Resolved: `/code-review medium all changes since <base-sha>, committed and uncommitted` reviews exactly the delta, uncommitted and untracked files included, headless. Target text is free-form for non-ultra runs.
- Resolved: `/code-review` returns findings as `{file, line, summary, failure_scenario}` with no severity or category, so `/rig:pr` assigns both when it writes `review.md`.
- Resolved: `/security-review` needs an `origin` remote. In a repo without one it prints nothing headless (or fails on setup when asked in plain words). Rig supports local-only repos, so when it reports it cannot run, `/rig:pr` runs the security pass through a `general-purpose` agent (`model: sonnet`) briefed with the same delta and a security-only scope (injection, authn/authz, secrets, unsafe input, crypto, path traversal). It never skips the pass silently.
- Resolved: both commands can be requested in plain words from a session; no Skill-tool call is needed.

- Resolved (final review): `/security-review`'s built-in diff is empty for uncommitted work even with an `origin` remote, so `/rig:pr` spells out the scope in words and falls back when the report names none of the changed files.
