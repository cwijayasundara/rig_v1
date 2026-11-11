# Client Readiness Level (R4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sdlc.ts readiness --client` says, check by check, whether a client repo has the platform controls that make rig's gates binding rather than advisory, and exits 1 until all of them pass.

**Architecture:** A new vendored module, `scripts/readyclient.ts`, has a pure `clientCriteria(input)` and an IO-only `gatherClient(opts)`. `gatherClient` reads CODEOWNERS, the managed settings file and the trunk's protection, from both the classic branch-protection API and repository rulesets, through `gh`. `cmdReadiness` routes `--client` to it. This is a separate all-must-pass checklist rather than a fifth level, for two reasons. First, level 4 wants the wiki and Maintain, which the core profile turns off, so a level stacked on top of it would be out of reach. Second, security controls should not pass at 80%. Plain `readiness` stays as it is: no network, same answer every run.

**Tech Stack:** TypeScript on Node ≥ 22.18, `node:test`, `gh` via `RIG_GH` (the fake-gh pattern in `scripts/protect.spec.ts:10-16`), `makeRepo`/`sdlc`/`write` from `scripts/testkit.ts`.

**Spec:** `docs/superpowers/2026-11-11-rig-readiness-and-adoption.md` §2 Step 1, row R4.

## Global Constraints

- The required checks are `rig-check` and `ai-review`. The Claude secret is `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`. Import these from `scripts/protect.ts` (export `CHECKS`, `SECRETS` and `trunk` there). Do not copy them.
- Default managed-settings paths:
  - darwin: `/Library/Application Support/ClaudeCode/managed-settings.json`
  - linux: `/etc/claude-code/managed-settings.json`
  - win32: `C:\Program Files\ClaudeCode\managed-settings.json`
  - `--managed <file>` overrides the default (the platform team points it at the file it deploys).
- The placeholder owner is `@your-org/` (from `templates/CODEOWNERS`).
- `readiness` without `--client` must make no `gh` call and print exactly what it prints today.
- Scripts ≤ 500 lines. `scripts/sdlc.ts` stays at 500 (no edit is needed there: `readiness` is already routed). The harness size cap stays 12,000 (11,532 today). Add at most 150 capped lines.
- `npm test` and `npm run typecheck` pass. Quote the output.

## Review Focus

1. **Rulesets instead of classic protection.** The classic route answers 404 "Branch not protected" on a branch that rulesets protect. The checks and the code-owner review must count from either source.
2. **CODEOWNERS present but not enforced.** The file without "Require review from Code Owners" is advisory. `codeowner-review` must fail then, even when every path is covered.
3. **The template copied unchanged.** Every path covered but owned by `@your-org/platform` must fail `codeowners-owner`.
4. **`gh` missing, logged out or offline.** The protection criteria fail with the first line of gh's error in `fix`. The command never throws, and never passes a criterion it could not read.
5. **A managed file that is not JSON, or has no `sandbox` key.** Each criterion that reads it fails and names the path. There is no stack trace.

---

### Task 1: Pure client criteria

**Files:**
- Create: `scripts/readyclient.ts`
- Modify: `scripts/protect.ts` (add `export` to `CHECKS`, `SECRETS`, `trunk`; nothing else)
- Test: `scripts/readyclient.spec.ts`

**Interfaces:**
- Produces, in `scripts/readyclient.ts`:
  - `export type Protection = { read: boolean; error: string; contexts: string[]; codeOwners: boolean }` (`read: false` means neither source could be read; `error` is gh's first stderr line)
  - `export type ClientInput = { owners: string; managedPath: string; managed: string | null; protection: Protection; secret: boolean }` (`owners` is CODEOWNERS and `.github/CODEOWNERS` joined; `managed` is the raw file text, or null when absent)
  - `export type ClientCriterion = { id: string; what: string; fix: string; ok: boolean }`
  - `export function clientCriteria(input: ClientInput): ClientCriterion[]`, returning exactly these ids, in order:
    - `protection`: `contexts` includes every one of `CHECKS`
    - `codeowner-review`: `codeOwners === true`
    - `ci-secret`: `secret === true`
    - `codeowners-rig`: both `.rig/bin/` and `.rig/sensors.json` are covered
    - `codeowners-claude`: `.claude/` is covered
    - `codeowners-workflows`: `.github/workflows/rig-check.yml` is covered
    - `codeowners-owner`: at least one rule, and no rule's owners include `@your-org/`
    - `managed`: `managed` parses as a JSON object
    - `sandbox`: `sandbox.enabled === true && sandbox.failIfUnavailable === true && sandbox.allowUnsandboxedCommands === false`
    - `managed-rules`: `allowManagedPermissionRulesOnly === true`, and `permissions.allow` has an entry containing `.rig/bin/sdlc.ts`, so the platform decided on rig's run rule (SECURITY.md trade-off)
  - `export function covers(owners: string, file: string): boolean`: true when a non-comment rule's first token, with its leading `/` stripped, is `*`, equals `file`, or ends in `/` and is a prefix of `file`, or is `.github/workflows/rig-*.yml` and `file` matches it.
  - Each `fix` names the action. For `protection`, `codeowner-review`, `managed`, `sandbox` and `managed-rules`, append `(<managedPath>)` or `(gh: <error>)` when that is the reason.

- [ ] **Step 1: Write the failing tests** in `scripts/readyclient.spec.ts`, against an `input()` helper that builds a passing `ClientInput`. The helper uses `templates/CODEOWNERS` text with `@your-org/platform` replaced by `@acme/platform`, `templates/managed-settings.json` text as `managed`, a protection with both checks and `codeOwners: true`, and `secret: true`.
  - `a repo with every control passes every client criterion`: every `ok` is true, and the ids equal the list above.
  - `the template CODEOWNERS unchanged fails only codeowners-owner` (Review Focus 3).
  - `CODEOWNERS without code-owner review fails codeowner-review` (Review Focus 2).
  - `covers: directory prefix, exact file, star, the rig-*.yml glob, comments ignored`. Assert `covers('/.rig/ @a', '.rig/bin/')` is true, `covers('# /.claude/ @a', '.claude/')` is false, `covers('* @a', '.claude/')` is true, and `covers('/.github/workflows/rig-*.yml @a', '.github/workflows/rig-check.yml')` is true.
  - `an unreadable protection fails protection and codeowner-review and names gh's error`: given `{ read: false, error: 'gh: not logged in', … }`, both `fix` values match `/not logged in/` (Review Focus 4).
  - `managed settings absent, not JSON, or sandboxed loosely fail and name the path`. Cases: `managed: null`, `managed: '{'` and `sandbox.allowUnsandboxedCommands: true`. Each affected criterion's `fix` contains `managedPath` (Review Focus 5).
  - `a managed file without allowManagedPermissionRulesOnly fails managed-rules`.

- [ ] **Step 2: Run them and confirm they fail.** Run `node --disable-warning=ExperimentalWarning --test scripts/readyclient.spec.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement** `clientCriteria` and `covers` in `scripts/readyclient.ts` (pure: no fs, no gh), and the three `export`s in `protect.ts`.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --disable-warning=ExperimentalWarning --test scripts/readyclient.spec.ts scripts/protect.spec.ts`. Expected: all pass.

- [ ] **Step 5: Commit** with `feat(readiness): client criteria for the platform controls (R4)`.

### Task 2: `readiness --client`: gather, print, exit code

**Files:**
- Modify: `scripts/readyclient.ts` (add `gatherClient`, `cmdReadinessClient`), `scripts/readiness.ts` (`cmdReadiness` routes `--client`), `scripts/vendor.ts` (`'readyclient'` in `VENDORED`), `SECURITY.md` (one line in the platform setup steps), `CHANGELOG.md` (one line under Unreleased)
- Test: `scripts/readyclient.spec.ts`

**Interfaces:**
- Consumes: `clientCriteria`, `ClientInput`, `Protection` (Task 1), and `CHECKS`, `SECRETS`, `trunk` from `protect.ts`. Runs `gh` through `gh` from `model.ts`, which honours `RIG_GH`.
- Produces:
  - `export function gatherClient(opts: { managed?: string }): ClientInput`
  - `export function cmdReadinessClient(args: Args): void`
  - `cmdReadiness` begins `if (args.opt.client) return cmdReadinessClient(args)`.

- [ ] **Step 1: Write the failing tests.** Use a fake gh written like `protect.spec.ts:10-16` that answers by argument:
  - `*rules/branches/*` with a rulesets array, or `[]`
  - `*/protection` with the classic object, or `gh: Branch not protected (HTTP 404)` on stderr and exit 1
  - `secret list` with a secret line

  Tests:
  - `readiness --client passes with classic protection, owners, managed settings and the secret`. The repo has CODEOWNERS from the template with `@acme/platform`. `--managed` points at a copy of `templates/managed-settings.json`. The fake answers classic `{ required_status_checks: { contexts: ['rig-check','ai-review'] }, required_pull_request_reviews: { require_code_owner_reviews: true } }`. Expect exit 0 and stdout matching `/client readiness: 10\/10/`.
  - `rulesets alone count` (Review Focus 1). The classic route answers 404. The rules route answers `[{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'rig-check' }, { context: 'ai-review' }] } }, { type: 'pull_request', parameters: { require_code_owner_review: true } }]`. Expect exit 0.
  - `a failing control exits 1 and lists the fix`. Pass `--managed <repo>/missing-file`, which does not exist. Expect exit 1, stdout matching `/managed: .*missing-file/`, and `--json` parsing to `{ ok: false, criteria: [...] }`.
  - `gh missing fails the protection criteria without throwing`. With `RIG_GH=/nonexistent/gh`, expect exit 1, no stack trace in stderr, and the `protection` row's `fix` naming gh.
  - `plain readiness makes no gh call`. Run `readiness --json` with the logging fake. The log file stays empty.

- [ ] **Step 2: Run them and confirm they fail.** Expected: `--client` is ignored, so the plain level output appears and the regexes fail.

- [ ] **Step 3: Implement `gatherClient`.**
  - Read `CODEOWNERS` and `.github/CODEOWNERS`, and the managed file at `opts.managed` or the platform default (null when absent).
  - Read protection with two `gh api` calls, `repos/{owner}/{repo}/branches/<trunk()>/protection` and `repos/{owner}/{repo}/rules/branches/<trunk()>`, each wrapped in try/catch. `contexts` is the union of `required_status_checks.contexts`, `required_status_checks.checks[].context` and the ruleset contexts. `codeOwners` is true when `required_pull_request_reviews.require_code_owner_reviews` or a `pull_request` rule's `require_code_owner_review` is true. `read` is true when either call returned JSON. A classic 404 alongside a readable rules answer counts as read.
  - Set `secret` from `gh secret list` matching a `SECRETS` name, the way `protect.ts` does.

- [ ] **Step 4: Implement `cmdReadinessClient`.**
  - Print `client readiness: <passed>/<total>`, then `to fix:` and one `  <id>: <what>: <fix>` line per failing criterion.
  - `--json` prints `{ ok, criteria }`.
  - Set `process.exitCode = 1` when any criterion fails.
  - Add `'readyclient'` to `VENDORED`.
  - Add to SECURITY.md's platform steps: "Run `node .rig/bin/sdlc.ts readiness --client --managed <your managed-settings.json>` until it exits 0."

- [ ] **Step 5: Verify.** Run `npm test && npm run typecheck`. Expected: all pass, including `vendor.spec.ts` "every module a script imports is vendored" and `size.spec.ts`.

- [ ] **Step 6: Commit** with `feat(readiness): readiness --client reads protection, rulesets, owners and managed settings`.

### After the tasks

Do one Opus review of `git diff main...HEAD`, fix its findings in one wave, and run `npm test` again.
