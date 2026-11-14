# W2: plan-check (G1), proof per behaviour (N1), stand-ins for external dependencies (N3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** W2 of `docs/proposals/2026-11-14-implementation-order.md`.
- `sdlc plan-check` replaces the per-change approval when `gates.plan: false`, and CI recomputes it on the PR head.
- Every behaviour must be proved by a holdout case or an approved journey, as well as by a test.
- Every external dependency has a deterministic stand-in named in the architecture.

**Architecture:** Deterministic checks only. Each check is a function that returns `Finding[]`, called at the existing points (`pr.ts`,
`check.ts` `runChecks`, `verify`, `chartcheck`).
- `gates.plan` keeps its default of `true`. The default flips to `false` in W5 (G4), when the two-gate end state lands.
- W2 makes `false` safe: today it drops the contract freeze, and after W2 it gains that freeze back plus more checks.

**Tech Stack:** Node 22 TypeScript (no build) and `node:test` specs with `scripts/testkit.ts`.

**Spec:** `docs/proposals/2026-11-14-two-human-gates.md` §3.1–3.2 (G1); `docs/proposals/2026-11-14-inner-loop-from-poteto-mode.md` §4 N1, N3.

## Global Constraints

- **Line caps:**
  - Scripts are at most 500 lines each. `check.ts` and `sdlc.ts` are at 500, so edit their lines with no net growth and put new
    logic in new modules.
  - Skills are at most 60 lines each.
  - The scripts total is at most 12000 (`neutrality.spec.ts`), and the harness at most 15000.
- **New sensor ids:** `plan-check` (block, never waivable, and in `UNREQUESTABLE`) and `proof` (warn by default). Both go in
  `model.ts` `SENSOR_NAMES`, or in the spec's deliberate-exclusion list with a reason (`model.spec.ts:77-90`).
- **Defaults unchanged:** with `gates.plan: true`, every existing behaviour and spec stays as it is.
- **Verification:** implementers run only the specs they touch, plus `size.spec.ts`, `neutrality.spec.ts`, `model.spec.ts` and
  `npm run typecheck`. The coordinator runs `npm test` once.

## Review Focus

- **No merge-base** (CI without `fetch-depth: 0`, or a local repo with no trunk): `plan-check` fails closed at CI and warns locally.
  Test in Task 1.
- **A change that is not charted** (ad hoc, so no sprint intent and no `scope:`): the scope and ledger checks are skipped and say so,
  while the contracts and order checks still apply. Test in Task 1.
- **A contract file deleted or renamed** on the branch counts as changed. Test in Task 1.
- **A repo with no `app.json`** and no holdout cases for the change: `proof` emits one info line saying it is exempt, never a block.
  Test in Task 2.
- **A journey driver that is draft or stale** does not count as proof. Only `appState` `current` counts. Test in Task 2.

---

### Task 1: `plan-check` (G1)

**Files:**
- Create: `scripts/plancheck.ts`.
- Modify:
  - `scripts/pr.ts:66`: when `!gates.plan`, run `planCheck` and refuse on any block.
  - `scripts/check.ts:257`: in `runChecks` at `point === 'ci'` with `!gates.plan`, add `planCheck(slug, { base, ci: true })` per
    slug, merged into an existing line.
  - `scripts/sdlc.ts`: the `'plan-check': cmdPlanCheck` entry and its import, both merged into existing lines.
  - `scripts/prbody.ts`: a `## Plan changes after build` section.
  - `scripts/core.ts`: add `'plan-check'` to `UNREQUESTABLE`.
  - `scripts/check.ts:166`: add `plan-check` to the `never` set.
  - `skills/plan/SKILL.md:25`.
- Test: `scripts/plancheck.spec.ts`.

**Interfaces (produces):**
- `export function planCheck(slug: string, o: { base: string | null; ci: boolean }): Finding[]`. Sensor `plan-check`, severity `block`
  unless stated.
  1. **Contracts unchanged.** Every file matching `contractGlobs(registry)` that differs between `o.base` and HEAD, plus the working
     tree when `!o.ci`, is a block: `contract <file> changed on a change branch: a contract change goes back to the chart`. Status
     A, M, D and R all count, and both paths of a rename are checked.
  2. **Inside the intent.** Only when the sprint intent file exists (`intentRelOf`, `scope.ts:12-17`):
     - every `planFiles(plan.md)` entry must sit inside `scope:` (reuse the matching that `scope.ts` uses);
     - every ledger id in `spec.md` (`/\b(?:FR|NFR|AC|UX)-\d+(?:\.\d+)*\b/`) must appear in the sprint intent file.
     A miss gives `scope change: <id or file> is outside intent <slug>; it goes back to the chart`.
     - When no intent file exists, the result is one `warn`: `not charted: scope and ledger checks skipped`.
  3. **Plan before code.** Over `git log --reverse o.base..HEAD`:
     - The first commit that touches `.rig/changes/<slug>/plan.md` must come before every commit that touches a file outside `.rig/`.
       Otherwise: `source committed before the plan (commit <sha7>): run S plan-check <slug> --commit before building`.
     - At CI with no plan commit at all, it is the same block.
     - Locally, with no commits yet, the check passes.
  4. **Existing refusals.** A non-null `approvalRefusal(slug)` (`lifecycle.ts:65-81`) is a block carrying its text.
  - When `o.base` is null: a block at CI (`no merge-base: fetch with fetch-depth: 0`), and a warn locally.
- `export function planChangesAfterBuild(slug: string, base: string): string[]` returns
  `- <sha7> <subject>` for each commit after the first source commit that touches `spec.md` or `plan.md` of the slug.
  `prbody` lists them under `## Plan changes after build`, or prints `none`.
- `S plan-check <slug> [--commit] [--json]`:
  - It prints the findings and exits 1 on a block.
  - `--commit`, with no blocks, does three things:
    - creates `sdlc/<slug>` from the trunk when HEAD is the trunk;
    - commits `.rig/changes/<slug>/{intent.md,spec.md,plan.md}` and any `requirements.md` or `intent-map.md` that exists, as
      `plan(<slug>): spec and plan`;
    - prints the sha.
- **`skills/plan/SKILL.md:25`:** when `gates.plan` is false, run `S plan-check <slug> --commit` instead of asking for an approval,
  fix every block (or go back to the chart for a scope change), then continue to `/rig:build`. The `gates.plan: true` wording is
  unchanged.

- [ ] **Step 1: Write failing specs** in `plancheck.spec.ts`. Each uses a testkit repo with `gates.plan: false`, a trunk and an
  `sdlc/<slug>` branch:
  - `contract file edited on the branch blocks`
  - `contract file deleted blocks`
  - `plan file outside scope blocks with "scope change"`
  - `spec cites FR-9 that the intent does not: blocks`
  - `uncharted change: one warn, contracts still checked`
  - `source commit before the plan commit blocks, naming the sha`
  - `--commit then a source commit passes`
  - `a later plan.md edit is listed by planChangesAfterBuild`
  - `open question in spec blocks via approvalRefusal`
  - `no merge-base at CI blocks`
  - `S pr refuses on a plan-check block when gates.plan is false`
  - `check --at ci with gates.plan false reports plan-check`
  - `gates.plan true: planCheck is not run by pr or ci` (the existing behaviour)
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/plancheck.spec.ts` and expect it to FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the spec again, plus `pr.spec.ts`, `check.spec.ts`, `prbody.spec.ts`, `model.spec.ts`, `size.spec.ts` and
  `neutrality.spec.ts`. Expect PASS.
- [ ] **Step 5:** Commit as `feat(plan-check): deterministic plan checks replace the per-change approval when gates.plan is false`.

### Task 2: proof per behaviour (N1)

**Files:**
- Create: `scripts/proof.ts`.
- Modify:
  - `scripts/verify.ts`, `scripts/check.ts` (`runChecks` at ship and ci, merged into an existing line), `scripts/registry.ts` and
    `scripts/prbody.ts`.
- Test: `scripts/proof.spec.ts`.

**Interfaces:**
- **Registry:** `proof: 'warn' | 'block'`, default `'warn'`. The parse accepts only those two values and reports an error otherwise.
  The W3 eval decides whether it flips to block.
- `export function unproved(slug: string): { ids: string[]; exempt: string | null }`
  - `ids` are the `behaviourIds(spec.md, 'Behaviours')` (`sensors.ts:266`) not named (word boundary, as in
    `missingBehaviours`, `sensors.ts:274`) by any of:
    - (a) a test-plan row whose Slug column is `<slug>`, whose Type is `holdout`, and whose B column holds the id;
    - (b) the files of an `app.json` journey whose `appState` is `current`: its driver files and `feature/*.md` (`app.ts:46-59`).
  - `exempt` is `'no app.json and no holdout cases for this change'` when neither source exists. `ids` is then `[]`.
- `proofFindings(slug, registry)` returns one finding per id, sensor `proof`, with severity from `registry.proof`:
  `<id> is proved only by unit tests: name it in a holdout case (test plan row) or an approved journey step`.
- `prbody`: the unproved ids go under `## What the checks would miss`, and an exemption line goes there as well.

- [ ] **Step 1: Write failing specs:**
  - `a behaviour with only a unit test gives a proof warn`
  - `a holdout row naming B1 proves B1`
  - `a current journey naming B2 proves B2; a stale one does not`
  - `no app.json and no holdout: exempt, no finding`
  - `proof: block makes it a block at ship`
  - `registry rejects proof: "x"`
  - `PR body lists unproved ids`
- [ ] **Step 2:** Run the spec and expect FAIL. **Step 3:** Implement. **Step 4:** Run the touched specs plus the cap specs and
  `model.spec.ts`, and expect PASS.
- [ ] **Step 5:** Commit as `feat(proof): each behaviour proved by a holdout case or an approved journey, as well as a test`.

### Task 3: stand-ins for external dependencies (N3)

**Files:**
- Modify:
  - `templates/architecture-format.md:42-44` (`## Integrations`);
  - `agents/architect.md` (at most 2 lines added);
  - `scripts/chartcheck.ts` (`architectureProblems`, line 333+);
  - `skills/build/SKILL.md` (one sentence).
- Test: the existing chartcheck spec file.

**Interfaces:**
- **`## Integrations` gains a table.** Its header is `| Dependency | Kind | Contract | Stand-in | Live switch | ADR |`. Kind is
  `external` or `internal`.
  - **Each `external` row** (an LLM API, payments, mail, any third-party network service) names a deterministic Stand-in (`scripted`,
    `recorded` or `local fake`), its location, and the env var that switches to live. It cites an ADR (`ADR-NNNN`) that exists under
    `adr/`.
  - **The template comment** says:
    - tests and journeys run on the stand-in by default;
    - a live test is marked and skips without credentials.
- **`architectureProblems`** adds rule `arch-standin` (block) for:
  - an `external` row with an empty Stand-in or Live switch;
  - an ADR id that is missing or not found.
  An architecture with no Integrations table passes, so existing fixtures are unchanged.
- **`agents/architect.md`:** for each external dependency, write the Integrations row and an ADR for its stand-in.
- **`skills/build`:** tests use the stand-in the Integrations row names. A test that needs a live service is marked and skips without
  its credentials.

- [ ] **Step 1: Write failing specs:**
  - `external row without a stand-in blocks with arch-standin`
  - `external row citing a missing ADR blocks`
  - `complete external row passes; internal rows need no stand-in`
  - `no Integrations table passes`
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Run the touched specs, any spec pinning the architect or build wording,
  and the cap specs. Expect PASS.
- [ ] **Step 5:** Commit as `feat(arch): every external dependency names a deterministic stand-in and its ADR`.
