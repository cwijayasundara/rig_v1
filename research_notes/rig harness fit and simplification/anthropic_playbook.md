# Anthropic "The AI-native SDLC playbook": what it prescribes

Sources:
- Article: https://claude.com/resources/articles/the-ai-native-sdlc-playbook (Louis Claxton, dated 2026-08-21 per fetch summary)
- Academy course on the same playbook: https://academy.claude.com/courses/ai-native-sdlc-playbook (lessons incl. /capture-intent, /plan-mode)
- Secondary (not Anthropic, used only as a cross-check): port.io, devops.com, waydev.co write-ups; Waydev argues the playbook lacks a measurement layer.

Method caveat: the article was read through WebFetch, which returns a small-model summary and paraphrase, not the raw page. Items marked "verbatim" come from a second WebFetch pass that quoted sentences; I could not diff them against the raw HTML. Treat exact wording as "high confidence, not checked byte-for-byte". Items marked "fetch summary only" were stated in the first pass without a second confirmation.

## Core thesis

- Code generation is no longer the bottleneck; the human-speed steps around it (planning, review, testing, deploy) now set pace. (verbatim heading: "Code is no longer the bottleneck")
- Replace the linear SDLC with a loop where each stage commits a version-controlled artifact that the next stage reads. The audit trail is the commit chain.
- Three named problems: bottleneck moves to human-speed steps; controls stop matching reality; "Governance costs increase because exceptions still route through meetings and committees that meet weekly or monthly." (verbatim)
- Human role: humans keep judgment calls; attention moves to "whether the change does what the plan intended and whether the risk is acceptable." (verbatim)

## Stages and minimal artifacts (six stages, sections 01-06)

| Stage | Committed artifact | Notes |
|---|---|---|
| 01 Plan | `intent.md` | proto-spec: problem, proposed outcome, affected users/systems, constraints, open questions. Claude drafts after brainstorm; product owner accepts. |
| 02 Design | `spec.md` | Claude drafts, constrained by organizational skills (brand, security, compliance, UX). Flagged concerns resolved by product owner / policy owner; higher risk to tech lead. Design review "happens before any code is generated". |
| 03 Build | `plan.md` (files to change, order, risks, proof), code diff, `CLAUDE.md`, `SKILL.md`, hooks, subagent definitions | Plan mode first (read-only), then implement. Engineer iterates on and accepts the plan. |
| 04 Test | test/build/lint output, screenshot diffs, failing test committed before a bug fix, eval suite (`evals/*.json`, `check.sh`), CI workflow (`agent-evals.yml`) | Runs on changes to `CLAUDE.md`, `.claude/**`, and nightly. |
| 05 Deploy | `REVIEW.md` (review policy: bugs, security, compliance passes; severity; nit cap), PR review findings, `.claude/settings.json`, `production-gate.sh`, managed settings, rollback runbook | Agent may act "up to the production gate and cannot pass it." (fetch summary, quote not re-verified) |
| 06 Maintain | `bands.yaml` (tiered response config), deterministic detection script with unit tests, `intent.md` written from a diagnosis, lessons file, scan findings, new evals per incident | Thresholds in version-controlled config. Every invocation and triage decision logged. |

Sixteen plays under the six stages (second fetch, verbatim names):
1 Capture as intent.md (Plan); 2 Requirements and design (Design); 3 Claude Code plan mode as the default starting point, 4 Claude Code on auto mode, 5 The CLAUDE.md, 6 Skills as institutional knowledge, 7 Hooks as build-time guardrails, 8 Parallel sessions and subagents (Build); 9 Give Claude a feedback loop, 10 Continuous evals in CI (Test); 11 AI in the PR review loop, 12 Hooks as approval gates, 13 CI/CD integration and deployment (Deploy); 14 Maintenance and closing the loop, 15 Recurring codebase scans, 16 Claude on call with Claude Tag (Maintain).

CONFLICT: a search snippet (secondary) says "twelve plays"; the article's own play list has 16. Trust the 16.

Each play has a "How to measure it" subsection (leading and lagging indicators).

## Verification and tests (verbatim unless noted)

- "Always give Claude a way to verify its own work, whether tests, a build, or a screenshot diff."
- "For bug fixes, write the failing test first."
- "A test that existed before the fix, and that the agent couldn't rewrite, is proof the bug is gone."
- "If a test fails, fix the code, not the test."
- "Heavier checks such as the full test suite belong at the commit or the PR." (so the article puts heavy suite at commit/PR, not per edit)
- "A hook runs on each action that matches it, so build-phase hooks should be fast and scoped to the file that changed." (verbatim)
- Evals: "Evals are the AI-native equivalent of stage-gate QA." "Each production incident gets an eval, written by the team that owned the incident." "When a new model is swapped in or a prompt is rewritten, the eval suite says whether the agent still does the work." "As models improve, cases that once discriminated stop doing so." (verbatim)
- Human role in test: engineer defines target and quantifiable success criteria; code owner reviews the evidence.

## Guardrail layering: skill vs hook (verbatim)

- "A skill is an advisory control while a hook is the deterministic layer behind it."
- "The skill makes violations rare and the hook makes them close to impossible."
- Hooks are PreToolUse scripts that allow, ask, or block (exit 2 blocks and returns the message to Claude). Team hooks in `.claude/settings.json`; non-negotiable hooks in managed settings.
- Approval-prompt hooks belong in Deploy (fetch summary).

## Review

- "Review runs in both directions, and governance is enforced as the agent acts." "Claude both gives and receives reviews."
- Tech lead writes `REVIEW.md` at repo root with three passes (bugs, security, compliance), severity definitions, nit cap.
- "Review findings feed back into `CLAUDE.md`."
- Separation of duties: authoring agent cannot approve; branch protection; no direct push to main; code owner approves.
- Autonomy tiered by environment (dev free, prod gated); higher-risk change to tech lead or architect. No formal risk taxonomy given.
- Review loop: AI reviews all PRs with same passes, addresses `@claude` comments, babysits PRs to green (fetch summary).
- Measures named: first-pass CI success, review time per PR, rework cycles, policy-citing review findings (should fall).

## Roles

- Humans: originator, product owner, engineer, tech lead/architect, code owner, policy owner, release manager, service owner/on-call, platform engineer, security lead, engineering leadership (change management, compliance).
- Agents: drafts intent, spec, plan; implements; runs tests and visual checks; reviews PRs; addresses comments; monitors production; triages incidents; runs scans; writes post-mortems.
- Boundaries: agent cannot approve its own code, cannot push to main, cannot pass the production gate. Humans make every judgment-requiring decision (fetch summary paraphrase).

## Tooling, harness, wrappers

- Plays use Claude Code built-ins directly: plan mode, auto mode, `claude --worktree`, `.claude/agents/`, `.claude/skills/<name>/SKILL.md`, `.claude/settings.json` hooks, `CLAUDE.md` created with `/init` and kept "under about a page" (fetch summary; the "under a page" phrase not verified verbatim).
- CLAUDE.md verbatim: "`CLAUDE.md` gives Claude the context a new joiner would need." "When Claude makes a mistake twice, the correction goes into `CLAUDE.md`." "`CLAUDE.md` is version controlled, so the instructions the agent works to are reviewable and auditable."
- Skills verbatim: "Skills are how an organization makes its institutional knowledge operational." "A skill is a control, though an advisory one." "Repeat processes are encoded via skills."
- Subagents verbatim: "A subagent runs inside a single session as a scoped helper with its own context window and tool limits." "Repeated jobs become subagents with their own context and tool limits." Example: a "verifier" subagent with restricted tools.
- Parallel sessions: one engineer runs two or three worktree-isolated sessions to start, adding more "only while review keeps pace" (fetch summary).
- Knowledge: "Knowledge that used to sit in people's heads and on wikis becomes a file the agent reads at the start of every session." (verbatim) - i.e. the file is CLAUDE.md/skill, not a wiki plugin.
- Custom scripts DO appear, but narrowly: a deterministic detection script with unit tests (Maintain), `production-gate.sh` deploy hook (Deploy), `check.sh` eval runner and `scripts/check-endpoints.sh`-style checks (Test; the second is a quoted example line in a prompt). Verbatim: "The script is version controlled and unit tested, and detection stays entirely deterministic, with no model involved." "A deterministic script watches production and invokes Claude when a control band is breached."
- A metrics store the detection script can query is mentioned (fetch). "analytics dashboard" appears only as a resource link label; no dashboard-building is prescribed.
- Managed settings (Deploy): deny rules for secrets/network egress, OS sandboxing (`failIfUnavailable`), managed-only hooks and MCP servers, plugin marketplace allowlist, minimum version floor (fetch summary).
- Source of truth: repo, or legacy system (Jira/ServiceNow via MCP), or linkage as minimum bar. Sidebar "Legacy systems and the source of truth".

## Governance: budgets, cost, models, risk

- Budgets/spend: only (a) Claude Security on Extra Usage "with a spend limit set" and "the spend limit should match the size and number of repositories." (verbatim) (b) eval runs need "an API key with budget." (verbatim). No per-play cost, no team/month or per-change budget, no spend tracking prescribed.
- Model choice: the article does NOT name Haiku, Sonnet, or Opus in its body (only in site navigation). Verbatim: "on the most capable model available, with findings validated before anyone reads them." (security scans). Fetch summary says Claude Security runs on Mythos 5; not re-verified. No routing by role or task difficulty.
- Risk tiers: by environment (dev/staging/prod) and change risk (engineer vs tech lead/architect). "Tier the autonomy by environment." (verbatim) "anything the organization classes as higher risk goes to a tech lead or architect." (verbatim) No formal taxonomy.
- Response tiers in Maintain: 1 sigma = log; 2 sigma = Claude diagnoses read-only; 3 sigma = may open PR or run pre-approved runbook (fetch summary). "Response tiers are defined in version-controlled config." (verbatim)

## Measurement

- Each play: leading and lagging indicators. Examples (fetch summary): time from intent commit to spec commit; spec commits after first plan (rework signal); first-pass merge rate; concurrent sessions per engineer; CLAUDE.md repeat-mistake rate; time waiting at each gate (OpenTelemetry); DORA metrics; defects caught pre-merge vs production.
- Sources named: git history, PR metadata, CI logs, OpenTelemetry, incident trackers, session transcripts.
- "The service owner or platform engineer picks one metric with a stable rolling baseline" (verbatim, Maintain).
- Waydev (secondary) says measurement is the missing layer; the article itself does not describe a dashboard product.

## Explicitly NOT in the playbook / silent

- No Haiku/Sonnet/Opus routing, no model-per-role table, no cost-per-change target, no token budgets.
- No "one review per change" rule; it describes continuous review in both directions and per-PR AI review.
- No recommendation for a wiki or memory plugin; memory is the CLAUDE.md/skill file in the repo.
- No recommendation for a custom wrapper around Claude Code; it uses built-in features plus a few scripts for deterministic checks and gates.
- No spend tracking tool or dashboard prescribed.
- Silent on: how many subagent launches per change, time caps per change, plugin scoping (project vs user), rig-style change records, sensors.json-type config.

## Inferences (not stated by the article)

- The article's design maps closely to Claude Code built-ins; a custom harness is not required for the playbook itself.
- Its "hook fast and scoped to changed file; heavy checks at commit/PR" rule implies per-edit hooks should be light; a full test suite per edit would contradict it.
- Its "one metric with a stable baseline" and "fewer gates" framing argues against adding many new process artifacts beyond intent/spec/plan/CLAUDE.md/REVIEW.md.
