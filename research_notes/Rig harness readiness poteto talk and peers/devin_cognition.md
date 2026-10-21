# Cognition (Devin, Windsurf, DeepWiki, Devin Review, SWE-1.x): running coding agents at scale with minimal supervision (as of Oct 2026)

Method note: ~19 tool calls. Primary sources fetched from cognition.com/blog (note: the blog index says paths are on cognition.ai; cognition.com also serves them). Most numbers are VENDOR SELF-REPORTS. WebFetch returns summaries by a small model, so quotes are as relayed. Not found or not fetched: ACU pricing detail, confidence-rating docs, DeepWiki internals, Windsurf Codemaps/SWE-grep posts, Goldman/Citi/Ramp numbers, any independent 2026 evaluation. Existing rig notes (enforcement_scaffolding.md) were only skimmed for style, not redone.

## 1. Devin workflow surface (Knowledge, Playbooks, Skills, snapshots, Review, DeepWiki, Ask Devin, scheduled/managed Devins, integrations)

### Takeaway
Devin's practice is "scope tightly, verify in the loop, review small": Knowledge/Skills/Playbooks carry conventions and procedures in, a self-review plus Devin Review loop catches bugs before a human sees the PR, and humans stay at the PR gate. In 2026 Knowledge was deprecated in favour of repo-committed SKILL.md Skills, converging on the same file-based model Claude Code uses.

### Cited Findings
- Knowledge is deprecated; existing items migrate to "Skills in Plugins" and Skills are the recommended way to add instructions. Knowledge items needed a trigger description, were retrieved only when relevant, could be pinned to a repo/all repos, auto-suggested from chat feedback, scoped to org/enterprise, with macros like `!deploy-checklist`. Guidance: narrow items, one workflow each, keep current — [Devin docs: Knowledge](https://docs.devin.ai/product-guides/knowledge)
- Skills hold persistent cross-session context (coding standards, common bugs and fixes, deploy workflows, internal tools); commit them to repos as `SKILL.md` and Devin discovers and loads them when relevant. Playbooks are reusable prompts for a specific recurring procedure (e.g. CI build failures) — [Devin docs: Instructing Devin](https://docs.devin.ai/essential-guidelines/instructing-devin-effectively)
- Useful playbooks include desired outcome, steps, postconditions, corrective guidance, forbidden actions, required inputs (examples: Redshift ingestion, DB migrations, Stripe/Plaid/Modal integrations) — [How Cognition uses Devin to build Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin)
- Docs advice on scoping: make key decisions yourself, define scope/boundaries/success criteria, split into verifiable sub-tasks with one session each, ask Devin to report at checkpoints, tell it to test its own work. Avoid "improve DB performance", "make sure it works", "make it look better", and implicit verification — [Devin docs](https://docs.devin.ai/essential-guidelines/instructing-devin-effectively)
- Cognition's own usage: engineers tag Devin from Slack, Linear, Jira, CLI, API; Ask Devin explores code to refine a goal, then launches a session with a generated prompt; DeepWiki-generated architecture docs feed Ask Devin; repos are auto-indexed — [Devin-on-Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin)
- Convention enforcement example: a daily audit scans the previous 24 hours of merged PRs for design-system violations, files Linear tickets and can open fix PRs. A `!triage-bug` playbook fires when a Bug label is added in Linear (search code, git history, Datadog logs, post root cause and suggested fix). Database access is read-only on a replica. Session Insights produces an improved prompt for the next session — [Devin-on-Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin)
- Devin Review (launched 2026-01-21, free in early release): groups and orders diff hunks logically, detects moves/renames, codebase-aware inline Ask Devin chat, bug flags colour-coded red (probable bug) / yellow (warning) / gray (FYI). Framed as "review, not generation, is the bottleneck" and the "Lazy LGTM problem". Usable via app.devin.ai/review, swapping "github" for "devinreview" in a PR URL, or `npx devin-review {pr-link}` — [Devin Review](https://cognition.com/blog/devin-review)
- Auto-Review runs on PR open, new commits or reviewer assignment; Bug Catcher labels flags by confidence — [Devin-on-Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin). (The "confidence rating" is therefore on review flags; I found no doc for a per-session confidence rating, see Gaps.)
- Autofix (2026-02-10): Devin reads comments from Devin Review and any other PR bot (linters, CI, security scanners, dependency managers) plus lint/CI failures, fixes and pushes. Only control described: which bots Devin responds to. No loop limit or human-comment handling stated. Positioned as for "mechanical fixes" — [Closing the agent loop](https://cognition.com/blog/closing-the-agent-loop-devin-autofixes-review-comments)
- Devin 2.2 (2026-02-24): Devin plans, writes, reviews its own output and fixes issues before the PR is opened; Linux desktop for testing desktop apps, with screen recordings after approval — [Devin 2.2](https://cognition.com/blog/introducing-devin-2-2)
- Managed Devins (2026-03-19): a coordinator Devin spawns child Devins, each a full Devin in its own VM, messages them, monitors ACU per child, can pause/terminate, reads child trajectories. Scheduled Devins shipped 2026-03-20 (title only; not fetched) — [Manage Devins](https://cognition.com/blog/devin-can-now-manage-devins); [blog index](https://cognition.com/blog)
- Auto-Triage / Automations (2026-05-18): watches Slack, Linear, GitHub, schedules, webhooks; sandboxed network, treats inbound text as untrusted (prompt injection/exfil protection); keeps memory of past investigations; links/de-duplicates alerts; opens a PR when the fix is clear; tags owners when a human is needed. No explicit approval step described — [Auto-Triage](https://cognition.com/blog/auto-triage)
- Machine snapshots: each session is a microVM; hypervisor-level snapshot (memory, processes, filesystem) lets compute shut down while idle and resume on a CI result or review comment. Blockdiff is their VM disk snapshot format (title only). YAML "blueprints" produce a snapshot future sessions boot from — [Cloud agents lessons](https://cognition.com/blog/what-we-learned-building-cloud-agents); [Verifying agentic development](https://cognition.com/blog/testing-development)
- Cloud-agent security stance: VM-level isolation not containers; sessions inherit the dispatching engineer's permissions; tamper-evident audit trail — [Cloud agents lessons](https://cognition.com/blog/what-we-learned-building-cloud-agents)
- 2026 product reshaping (blog index): Devin Desktop (2026-06-02), Devin CLI "start local, hand off to cloud" (2026-04-27), Devin in Windsurf (2026-04-15), Windows PC and Android emulator for Devin, "Fusion" multi-model mode (2026-06-29), Security Swarm (2026-07-01) — [blog index](https://cognition.com/blog); docs home also describes CLI `/handoff` to cloud Devin — [Devin docs](https://docs.devin.ai/)

### Inferences
- Devin has moved the "conventions" layer to the same primitive rig can use (SKILL.md in repo) and keeps procedural playbooks separate: skills = always-relevant standards, playbooks = invoked procedures with postconditions and forbidden actions. Rig's intent/spec could carry the same fields (postconditions, forbidden actions, required inputs).
- The daily audit of merged PRs against the design system is a post-merge sensor with ticket output, a cheap pattern for architectural-decay detection that is not blocking.

### Gaps
- ACU definition/pricing and per-plan quotas: docs URL tried (docs.devin.ai/billing/usage-limits) returned 404; not resolved.
- Per-session "confidence rating" (older Devin feature) not documented in sources fetched.
- DeepWiki internals (indexing method, freshness) not fetched; only appears as feeding Ask Devin and doc generation.
- Scheduled Devins post body not read.

## 2. Engineering essays: multi-agents, context engineering, performance review, Devin-on-Devin stats, customers

### Takeaway
Cognition's position evolved from "don't build multi-agents" (June 2025) to "single-threaded writes, multiple contributors of intelligence" (April 2026): a clean-context reviewer loop, a manager Devin fanning out to isolated children, and no free-form swarms. Headline adoption numbers (67% merge rate, hundreds of thousands of PRs) are self-reported.

### Cited Findings
- "Don't Build Multi-Agents" (Walden Yan, 2025-06-12): two principles: share context (full traces, not just messages), and actions carry implicit decisions. Parallel subagents make conflicting implicit decisions (Flappy Bird example). Recommends a single-threaded linear agent, plus a compaction model (fine-tuned smaller LLM) for long tasks — [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)
- April 2026 follow-up: most real multi-agent usage is read-only subagents; parallel writer swarms still see little real adoption. Large demos (200k-LOC browser, 100k-LOC C compiler) worked because success criteria were simple and verifiable, which most software lacks. Devin usage in its largest enterprise segment grew ~8x in six months, creating pressure on planning, review and cost — [Multi-Agents: What's Actually Working](https://cognition.com/blog/multi-agents-working)
- Same post, Pattern 1: Devin Review finds on average 2 bugs per Devin-written PR, ~58% severe (logic errors, missing edge cases, security). Devin and Review iterate so most are fixed before a human opens the PR. The reviewer works best with NO shared context (only the diff): reasons given are context rot, and a clean reviewer can question instructions the author accepted. A "communication bridge" has the original Devin filter findings using the user's instructions to avoid loops, disobedience and scope creep. Self-reported — [Multi-Agents](https://cognition.com/blog/multi-agents-working)
- Pattern 2 "smart friend" (SWE-1.5 primary calling Sonnet 4.5): quality was capped by the weak primary; with frontier models, delegation became a capability router. Pattern 3: manager Devin with child Devins over an internal MCP; observed problems: managers over-prescriptive without codebase context, assume shared state with children, children do not report back by default. Unstructured agent networks "mostly a distraction"; shape is map-reduce-and-manage — [Multi-Agents](https://cognition.com/blog/multi-agents-working)
- Devin's 2025 Performance Review (2025-11-14): merged hundreds of thousands of PRs; PR merge rate 67% vs 34% the year before; 4x faster at problem solving, 2x more resource-efficient. Task size ~ junior 4-8 hours. Test coverage typically 50-60% to 80-90%. Security fix ~1.5 min vs ~30 min human per vulnerability. Bank ETL migration 3-4 h per file vs 30-40 h human. Java migration 14x faster per repo. Itaú: see below. All vendor-reported — [2025 Performance Review](https://cognition.com/blog/devin-annual-performance-review-2025)
- Same review, limits: weak on ambiguous projects, underspecified visual design, mid-task requirement changes ("performs worse when you keep telling it more after it starts"); "Human review is still necessary, because code quality is not straightforwardly verifiable". Framing: "senior-level at codebase understanding but junior at execution". Fleet pattern: humans write a unit-testing playbook for a few hundred repos, Devins write tests, code owners verify logic — [2025 Performance Review](https://cognition.com/blog/devin-annual-performance-review-2025)
- Merge-rate scope is contested in secondary coverage (all PRs vs well-defined tasks); the primary post summary says "67% of Devin's PRs are merged" — [agentmarketcap](https://agentmarketcap.ai/blog/2026/07/13/cognition-devin-67-percent-pr-merge-rate-vendor-production-metric) (secondary, low reliability)
- Devin-on-Devin (2026-02-27): 659 Devin PRs merged in the latest week vs 154 in best week of 2025. The post gives no share-of-code or merge-rate figure — [Devin-on-Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin). A "Devin writes 89% of the code its engineers commit" claim appears only in a secondary overview — [fast.io](https://fast.io/resources/cognition-ai-company-overview/) (unverified; do not rely). The 2025 review says Devin pushed ~one-third of commits on Cognition's web app — [2025 Review](https://cognition.com/blog/devin-annual-performance-review-2025)
- Itaú (~17,000 engineers, eleven months in): migrations 5-6x faster, 70% of static-analysis vulnerabilities auto-remediated, test coverage doubled — [Cloud agents lessons](https://cognition.com/blog/what-we-learned-building-cloud-agents) (vendor)
- Nubank (devin.ai marketing page): 8-12x engineering-time efficiency, >20x cost savings, on a multi-million-line ETL monolith split project; cost computed as Devin running cost vs engineer hourly cost; no independent verification — [Nubank case study](https://devin.ai/customers/itau) (page title relayed by search; same case text repeated across devin.ai pages)
- Verification at scale (2026-05-29): Devin writes a test plan grounded in source code, records expected behaviour before each action, uses a deterministic login skill, can propose new testing skills via one-click PR; outputs report plus chaptered video. More sessions are now triggered asynchronously than interactively; engineers run 10-20 Devins in parallel. Failure modes admitted: unguided testing drifts, models run JS to trigger states instead of clicking (undermines realism), screenshots miss transient UI. Enforcing UI-only interaction is "in progress" — [Verifying agentic development](https://cognition.com/blog/testing-development)
- SWE-check (2026-04-14, with Applied Compute): small RL-trained open-source bug-detection model; tuned F-score from beta=1 to 0.5 to cut false positives after dogfooding; reward 0.5*precision + recall; out-of-distribution still trails Opus 4.6 (F1 gap 0.29). IDE-focused — [SWE-check](https://cognition.com/blog/swe-check-10x-faster)
- Productivity measurement (2026-06-04): metric is LLM-estimated human-equivalent hours per session, counting only sessions with a merged PR (or classifier-filtered no-PR sessions); validated on 258 sessions/126 users, r_log 0.74, only ~50% of estimates within 2x. Authors admit post-merge defects are not captured: a subtle bug that takes long to fix gives negative uplift the metric does not see — [Estimating productivity](https://cognition.com/blog/ai-productivity)
- Independent critique (older): Answer.AI, Jan 2025, 20 tasks: 14 failures, 3 successes, 3 inconclusive, no pattern to predict which would work; struggled with existing codebases — [Answer.AI](https://www.answer.ai/posts/2025-01-08-devin). Predates Devin 2.x and Cognition's 2026 loops, so weak evidence about current behaviour.

### Inferences
- The 2 bugs/PR figure and the 67% merge rate together imply the review loop, not first-pass generation quality, is the production quality gate, with merge as the only success signal (no post-merge defect rate published).
- "Reviewer with clean context, author filters findings with full context" is a directly adoptable design for rig's PR stage: reviewer sees diff only; the builder triages findings against the intent.
- Cognition's measurement is merge-based and conditional on merged PRs; for rig, decay (architectural drift) is exactly what this metric cannot see.

### Gaps
- Goldman Sachs, Citi, Ramp numbers: not found in fetched sources (search returned none); only named as customers (Goldman, Santander, Nubank) in the 2025 review.
- Independent 2026 evaluation of Devin merge rate or post-merge defect/rollback rates: none found.
- Devin-on-Devin share of Cognition's own code: no primary figure found.

## 3. Failure modes, enforcement of architecture/conventions, quality and cost measurement

### Takeaway
Cognition enforces conventions mostly through context (Skills/playbooks), scoped tasks and review loops rather than hard architectural gates; they admit quality is "not straightforwardly verifiable" and that review is the bottleneck. Cost is tracked in ACUs per session/child, and since mid-2026 they sell outcome-linked pricing.

### Cited Findings
- Admitted limits: ambiguity, mid-task changes, visual polish, mobile testing on physical phones, review bottleneck, triage outputs remain proposals; no error/rollback rates published — [Devin-on-Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin); [2025 Review](https://cognition.com/blog/devin-annual-performance-review-2025)
- Process, not tooling, as the gap: review/planning/staffing processes built for humans do not transfer to high-volume agent output; engineers must learn what to delegate and to specify tasks precisely; review standards need redefining — [Cloud agents lessons](https://cognition.com/blog/what-we-learned-building-cloud-agents)
- Enforcement mechanisms evidenced: playbook postconditions and forbidden actions; read-only data replicas; daily design-system audit of merged PRs; testing skills committed to repo; bots as triggers for Autofix; per-bot allowlist — sources as above. No evidence found of dependency-cruiser/ArchUnit-style architecture tests as a Devin feature.
- Cost: ACU consumption monitored per child by the coordinator; test mode billed at 1/5 normal cost during an experiment; Autofix raised internal token spend "massively" (no figure) — [Manage Devins](https://cognition.com/blog/devin-can-now-manage-devins); [Verifying](https://cognition.com/blog/testing-development); [Autofix](https://cognition.com/blog/closing-the-agent-loop-devin-autofixes-review-comments)
- 2026 blog titles indicate cost/pricing moves: "Devin Fusion: Frontier Performance at 60% Lower Cost" (2026-06-29), "AI Productivity Guarantee" (2026-06-04), "Making Fable Cheaper Than Opus" (2026-07-13), SWE-1.6 (2026-04-07), SWE-1.7 (2026-07-08), SWE-2 (2026-09-10), new self-serve plans (2026-04-14). Titles only; bodies not read — [blog index](https://cognition.com/blog)

### Inferences
- Cognition's honest stance ("quality not verifiable") and metric blind spot suggest architecture decay is not a solved problem there; rig's sensors/gates (deterministic structural checks) would be a differentiator, not a copy.
- Their "post-merge daily audit -> ticket" plus "skills proposed by the agent via one-click PR" is a ratchet-like learning loop adoptable by rig.

### Gaps
- No primary source on how Cognition prevents architectural decay specifically; no data on rollback/revert rate.
- ACU price mechanics unresolved (docs 404).
- AI Productivity Guarantee terms not read.

## 4. Democratization: who uses Devin, how seniors delegate, how juniors are guarded

### Takeaway
Evidence is thin on explicit junior guardrails; the documented pattern is that anyone (including non-engineers) can request work via Slack/Linear, with output always arriving as a PR or report for human review, and scoping responsibility sitting on the delegating engineer.

### Cited Findings
- Non-engineers can request changes in Slack without Git knowledge; data/business users ask warehouse questions through a data-analyst variant (DANA); "anyone"-style access is paired with PR gating, read-only DB replicas and Session Insights flagging scope creep — [Devin-on-Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin)
- Seniors/leads: write the playbook once (unit-test playbook over hundreds of repos), code owners verify; Litera gave each engineering manager a "team of Devins" as QE/SRE/DevOps (vendor case) — [2025 Review](https://cognition.com/blog/devin-annual-performance-review-2025)
- Unlike human juniors, Devin cannot be coached mid-task effectively, so scoping falls on the engineer — [2025 Review](https://cognition.com/blog/devin-annual-performance-review-2025)
- Engineers run 10-20 Devins in parallel, each with its own dev server; the delegating role becomes manager/reviewer — [Verifying](https://cognition.com/blog/testing-development)
- Sessions inherit the dispatcher's permissions with audit trail, so a junior's Devin cannot exceed the junior's access — [Cloud agents lessons](https://cognition.com/blog/what-we-learned-building-cloud-agents)
- Long-term stance: agents injected at each SDLC stage as "a coordinated system that scales human taste", not autonomous swarms — [Multi-Agents](https://cognition.com/blog/multi-agents-working)

### Inferences
- The guard for juniors is structural (permission inheritance, PR gate, review bot, playbooks authored by seniors) rather than a distinct junior mode; I found no source describing explicit junior-specific restrictions.

### Gaps
- No data on junior vs senior usage splits or outcomes; no source on org-level governance of who may launch what.

## Adoptable for a harness like rig (summary, my synthesis from the above)
- Reviewer stage with diff-only context plus a builder-side triage of findings against the intent (Pattern 1); tune reviewer for precision (SWE-check beta=0.5).
- Playbook schema: outcome, steps, postconditions, forbidden actions, required inputs; one-playbook-many-repos fleet pattern.
- Test plan grounded in source and expected behaviour recorded before each action; deterministic scripts for repeated setup; agent-proposed skills via PR.
- Post-merge audit of recent merges against conventions, filing tickets (ratchet-style).
- Single-threaded writer; fan-out only for read/review or isolated children with map-reduce-and-manage; require children to report back explicitly.
- Know the metric blind spot: merge rate and human-equivalent hours do not capture drift or post-merge defects.
