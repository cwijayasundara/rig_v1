# Coding-agent platforms (non-Devin): harness design for scaled, low-supervision delivery (as of Oct 2026)

Method note: primary pages were fetched for Cursor (2 posts), Anthropic (4 posts + agent-teams docs), Factory (launch post), Kiro (2 docs pages), Spec Kit repo, Amp (oracle post), and a LeadDev interview with OpenAI staff. Everything else rests on search-result summaries and is labelled "secondary". The OpenAI harness-engineering page returned HTTP 403, so the Feb 2026 post is not re-read here (earlier notes in `Rig harness production readiness/slices_and_openai.md` cover it). Self-reports are labelled (self-report).

## 1. Repo readiness / legibility, context files, AGENTS.md

### Takeaway
Factory is the only vendor that productized a readiness score (binary criteria, 5 levels, 80% gate). Context files have converged on AGENTS.md as the common denominator: OpenAI-originated, now under the Linux Foundation's AAIF, and read by Copilot, Kiro and Factory. Vendors' own tools keep native formats (CLAUDE.md, copilot-instructions, steering files) alongside it.

### Cited Findings
- Factory Agent Readiness (launched Jan 2026): 8 pillars (Style & Validation, Build System, Testing, Documentation, Dev Environment, Code Quality, Observability, Security & Governance), 5 levels (Functional, Documented, Standardized, Optimized, Autonomous). 60+ binary criteria, mostly file-existence or config checks, evaluated by LLMs. Unlock a level by passing 80% of that level's criteria plus all lower levels. Repo-scope and app-scope (monorepo) criteria. Level 3 "Standardized" is called production-ready for agents and the recommended first target. — [Factory launch post](https://factory.com/news/agent-readiness) (self-report)
- Factory examples: CockroachDB L4 (74%), FastAPI L3 (53%), Express L2 (28%). — same post (self-report)
- Factory scoring variance: about 7% average (spikes to 14.5%) between runs before the fix; 0.6% after grounding each evaluation on the prior report; held 0.6% for 6 weeks across 9 benchmark repos. LLM-based scoring was non-deterministic. — same post (self-report)
- Factory thesis: inconsistent agent results usually come from the codebase environment, not the model; fast feedback matters (10-minute CI vs 5-second pre-commit hooks); undocumented env vars and tribal knowledge leave agents guessing. Recommended KPI: share of active repos at L3+, not average score. Start with AGENTS.md, linters, pre-commit hooks. — same post (self-report)
- Factory docs disagree with the launch post on pillar count (docs say nine, launch post and product page say eight). Delivery: `/readiness-report` in Droid CLI, org dashboard, Readiness Reports API. — [Factory docs](https://docs.factory.ai/agent-readiness/overview) (via search summary, secondary)
- AGENTS.md is one of three founding projects of the Agentic AI Foundation (AAIF) under the Linux Foundation, formed Dec 2025, with MCP (Anthropic) and goose (Block). Platinum members include AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft, OpenAI. — [Linux Foundation press release](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-Agentic-ai-foundation) (via search summary)
- "60,000+ open-source projects use AGENTS.md" is a company/aggregator claim; a blog claim of 190 AAIF members and AGENTS.md v1.1 in draft was not corroborated. — [secondary blog](https://codex.danielvaughan.com/2026/06/05/agentic-ai-foundation-agents-md-mcp-linux-foundation-codex-cli-developers/)
- No AAIF/Linux Foundation skills standard was found in results; skills (folder with SKILL.md plus scripts, loaded on demand) are described only as a general pattern. — search results (secondary)
- GitHub Copilot coding agent reads a root AGENTS.md (nested files supported), plus `.github/copilot-instructions.md`, `.github/instructions/**.instructions.md`, CLAUDE.md and GEMINI.md. — [GitHub changelog 2025-08-28](https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions)
- Copilot custom agents live at `.github/agents/NAME.md` (repo), or org/enterprise level. — [GitHub docs](https://docs.github.com/copilot/concepts/agents/coding-agent/about-custom-agents)
- Kiro steering: `.kiro/steering/` (workspace), `~/.kiro/steering/` (global), team steering via MDM; foundation files `product.md`, `tech.md`, `structure.md` always included; inclusion modes always / fileMatch / manual / auto (description-matched). Kiro also reads AGENTS.md (discovered in subdirectories, always included, no inclusion modes). — [Kiro steering docs](https://kiro.dev/docs/steering/)
- Augment Context Engine as MCP server (Feb 2026): claimed 70%+ gain across Claude Code, Cursor, Codex, measured on 300 Elasticsearch PRs / 900 attempts. Augment's approach is a semantic index rather than a context file. — [Augment blog](https://augmentcode.com/blog/context-engine-mcp-now-live) (via search summary; self-report)
- Cursor "Rules" and Warp/Amp rules: not fetched; see Gaps.

### Inferences
- A rig readiness score modeled on Factory (binary, file/config-checkable, level gates, 80% rule) is directly aligned with the industry's only precedent; the grounding trick (feed prior report into next evaluation) is a concrete fix for LLM-scorer variance. Deterministic checks avoid the problem entirely.
- Writing rig's context output as AGENTS.md (with CLAUDE.md as pointer/symlink) covers Copilot, Kiro, Factory, Codex, Cursor with one file.

### Gaps
- Cursor rules docs, Amp AGENTS.md guidance, Warp rules, Replit context files: not fetched.
- Whether Claude Code reads AGENTS.md natively as of Oct 2026: not verified here.

## 2. Spec-driven development

### Takeaway
Kiro and GitHub Spec Kit have made specs the unit of work, each with three-to-six staged artifacts and human approval gates. Anthropic's long-running posts use a machine-readable feature list instead (JSON with pass/fail), and found a planner is still load-bearing even on Opus 4.6.

### Cited Findings
- Kiro specs: `requirements.md` (or `bugfix.md`), `design.md`, `tasks.md`; three phases; Feature specs (requirements-first or design-first), Bugfix specs, Quick Spec (no approval gates). "Analyze Requirements" catches ambiguity before design; property-based "Correctness" is IDE-only. Kiro builds a dependency graph from tasks.md and runs independent tasks in parallel "waves". — [Kiro specs docs](https://kiro.dev/docs/specs/)
- Spec Kit commands: `/speckit-constitution`, `-specify`, `-plan`, `-tasks`, `-implement`, `-converge` (repeat implement/converge until "Converged"), plus bug and assess extensions. Repo showed 142.2k stars at fetch time. Constitution = project-wide principles created once. — [github/spec-kit](https://github.com/github/spec-kit)
- Anthropic harness: initializer agent expands the prompt into a JSON feature list (200+ features for a claude.ai clone, all `"passes": false`); coding agents may only flip `passes`; editing/removing tests prohibited. JSON chosen because models overwrite it less than Markdown. — [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Anthropic (harness-design post): planner kept because without it the generator under-scoped; planners should specify deliverables, not granular technical detail, so upstream spec errors do not cascade. — [Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- Cursor: vague specs led agents into obscure features; missing performance bounds and dependency rules caused problems because the harness followed instructions literally; "20-100 tasks" produced bigger scope than "many". — [Towards self-driving codebases](https://cursor.com/blog/self-driving-codebases) (self-report)

### Inferences
- Rig's intent/chart documents map onto Kiro requirements/design/tasks; the differentiator to preserve is machine-checkable acceptance (pass/fail flags the agent cannot edit).
- Spec Kit's `converge` step (loop until a check reports done) is a verification-loop pattern worth comparing to rig's inner loop.

### Gaps
- No vendor published eval data showing spec-driven beats non-spec for outcomes. Found nothing quantitative.

## 3. Multi-agent coordination and conflict avoidance

### Takeaway
Two independent long-run experiments (Cursor, Anthropic C compiler) show the same pattern: simple lock files or hierarchy, minimal coordination layers, tolerate some conflict. Cursor's flat locking collapsed throughput; its planner/worker hierarchy without an integrator scaled to hundreds of agents. Anthropic's docs advise file ownership per agent and caution that teams cost more tokens.

### Cited Findings
- Cursor flat design: shared file with locks; 20 agents ran at throughput of 2-3; agents failed while holding locks. Optimistic concurrency was more robust but agents became risk-averse, avoiding hard tasks and making small safe changes. — [Scaling long-running autonomous coding, Jan 14 2026](https://cursor.com/blog/scaling-agents) (self-report)
- Cursor final design: root planner (no coding) -> recursive sub-planners -> workers with own repo copy that return handoff reports; no integrator (it became a bottleneck); judge at cycle end; fresh start each iteration. Hundreds of workers pushed to one branch with minimal conflicts. — scaling-agents and [self-driving-codebases (Feb 5 2026)](https://cursor.com/blog/self-driving-codebases) (self-report)
- Cursor accepted a steady non-zero error rate: demanding perfect commits caused serialization; a final cleanup pass was suggested. Temporary churn from agents touching the same code converged over time at extra token cost. Disk I/O was the hotspot with hundreds of agents compiling. — self-driving-codebases (self-report)
- Cursor "constraints beat instructions": "No TODOs, no partial implementations" outperformed reminders; do not over-prompt skills the model already has. — self-driving-codebases (self-report)
- Anthropic C-compiler: 16 agents, each in its own Docker container with a local clone of a bare git repo; claim tasks by writing lock files in `current_tasks/`; pull/merge/push; no orchestrator; some agents specialized (dedup, performance, code quality, docs). For the Linux kernel (one giant task, agents collided and overwrote each other's fixes) they used GCC as an oracle to split files between GCC and Claude's compiler so agents could work on different bugs. — [Building a C compiler](https://www.anthropic.com/engineering/building-c-compiler) (self-report)
- Claude Code agent teams (experimental, disabled by default, env flag `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): lead + teammates, shared task list with dependencies and file-locked claiming, mailbox messaging; hooks `TeammateIdle`, `TaskCreated`, `TaskCompleted` (exit code 2 blocks and feeds back). Guidance: start with 3-5 teammates, 5-6 tasks each; each teammate should own a different set of files; poor fit for sequential or same-file work; "significantly more tokens". Known limits: no session resume of in-process teammates, task status lag, one team per session, no nested teams, lead fixed. — [Agent teams docs](https://code.claude.com/docs/en/agent-teams)
- Anthropic still lists single vs multi-agent as unresolved for long-running harness. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Codex: subagents and custom agents GA March 16 2026 (default explorer/worker/default; TOML in `~/.codex/agents/`). — [Let's Data Science report](https://letsdatascience.com/news/openai-codex-adds-subagents-and-custom-agents-c3e4196e) (secondary)
- Amp: specialist subagents (Search, Oracle, Librarian, Read Thread), each in its own context; subagents cannot talk to each other or be guided mid-task; the Oracle is a read-only advisor subagent on a stronger reasoning model, not pushed in the system prompt to control cost. — [Amp oracle post, Jul 2025](https://ampcode.com/news/oracle); limits from [secondary guide](https://dev.to/matt_tanner_f9c36595644ad/how-to-use-subagents-in-ai-coding-198c)
- Replit Agent 4: parallel tasks merged into main project, specialized sub-agents resolve merge conflicts; "up to 10 agents on Pro" from third-party site. — [ZenML summary](https://www.zenml.io/llmops-database/building-fully-autonomous-coding-agents-for-non-technical-users) and [GamesBeat](https://gamesbeat.com/?p=318724) (secondary)
- GitHub Agent HQ (Feb 2026): run Copilot, Claude, Codex on the same repo/PR via @mentions and Agents tab. — [IT Brief](https://itbrief.co.uk/story/github-copilot-surges-as-agent-hq-targets-ai-ecosystem) (secondary)
- Warp Oz (Feb 10 2026): cloud orchestration platform running Claude Code, Codex and Warp agent side by side, event/schedule triggers, self-host managed/unmanaged; Warp says Oz writes 60% of its PRs. — [Warp blog](https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents) and [docs](https://docs.warp.dev/oz) (via search summary; self-report)

### Inferences
- Convergent rule for rig: separate planning from execution, give each worker an isolated checkout, partition by file ownership or oracle, claim tasks with a dependency-aware list, drop the integrator/merge-gate role.
- Multi-agent is about throughput on large decomposable work; Anthropic and Cursor both warn that for sequential or tightly coupled work a single agent is better.

### Gaps
- Conflict-avoidance details for Copilot Agent HQ, Jules, Antigravity not found in primary sources.

## 4. Verification and evals

### Takeaway
The strongest repeated finding: agents mark their own work done prematurely and are weak QA out of the box. Fixes published: end-to-end browser testing, separate evaluator calibrated by logs, near-perfect verifiers/oracles, fast sampled test modes.

### Cited Findings
- Unit tests and `curl` alone missed end-to-end failures; browser automation (Puppeteer MCP) testing as a human user fixed more. Browser-native alert modals invisible to the tool. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Out of the box Claude is a weak QA agent: flags real issues then approves anyway; tuning the evaluator against its logs was necessary. Separating worker from judge is "a strong lever". — [Harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps); quote via [InfoQ](https://infoq.com/news/2026/04/anthropic-three-agent-harness-ai/)
- C-compiler: "the verifier must be nearly perfect, or Claude solves the wrong problem"; log to files, mark errors greppable, precompute summaries; `--fast` deterministic 1%/10% sampling per agent because Claude has no sense of time; CI added late once new features broke old ones. About 99% on most compiler test suites, including GCC torture tests. — [C compiler post](https://www.anthropic.com/engineering/building-c-compiler) (self-report)
- Replit: own evals found more than 30% of individual features broken on first generation; response was autonomous browser testing built mainly on generated Playwright code, preferred over screenshot-based computer vision (cost, speed); sub-agent orchestration "mandatory" for it. — [ZenML summary of Replit talk](https://www.zenml.io/llmops-database/autonomous-coding-agent-evolution-from-short-burst-to-extended-runtime-operations) (secondary; self-report)
- Cursor cloud agents (Feb 24 2026): each agent in its own VM with computer use; Cursor says over 30% of its merged PRs are created by autonomous cloud agents (DevOps.com says 35%, so the figure differs by source). — [Cursor blog](https://cursor.com/blog/agent-computer-use) and [DevOps.com](https://devops.com/cursor-cloud-agents-get-their-own-computers-and-35-of-internal-prs-to-prove-it) (secondary for the 35%; self-report)
- Antigravity: "Artifacts" (task lists, plans, screenshots, browser recordings) let humans verify without reading raw tool calls; comments on an artifact fold into the running agent. — [Google developers blog](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/) (via search summary)
- OpenAI (LeadDev interview, company staff): code and security review become the bottleneck; CI/CD, review and testing lag behind generation; no right human:agent ratio found yet; ">90% of Codex app code written by Codex" is a company estimate. — [LeadDev](https://leaddev.com/ai/openai-says-there-are-easily-1000x-engineers-now) (self-report)
- Anthropic "Building effective agents": use ground truth from the environment each step (tool results, test output); evaluator-optimizer works best with clear criteria; human checkpoints where success is not verifiable. — [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Cursor's no-eval caveat: browser project "not meant for external use", no independent quality assessment, no cost or intervention figures. — [self-driving-codebases](https://cursor.com/blog/self-driving-codebases)

### Inferences
- A rig verification stage should include (a) an end-to-end check, not only unit tests, (b) agent-uneditable pass/fail records, (c) a separate evaluator whose calibration is tuned on logs, and (d) a fast sampled mode for long suites.

### Gaps
- No vendor published an eval comparing harness variants with statistical rigour except Cursor's Bugbot metric (below) and Augment's PR benchmark (self-reports).

## 5. Review automation

### Takeaway
Cursor's Bugbot is the best-documented review product, with a published resolution-rate metric and learned rules. Anthropic and GitHub ship review as native features; details of Claude Code `/code-review` internals were not re-fetched.

### Cited Findings
- Bugbot: resolution rate (LLM judge checks at merge time whether each flagged comment was addressed) rose from 52% (July 2025 beta exit) to 78% by Apr 2026 (table: 78.13%, vs Greptile 63.49%, CodeRabbit 48.96%). Learned rules: candidate rules generated from reactions/replies and human reviewer comments, promoted when signal accumulates and disabled when they stop helping. — [Cursor changelog 2026-04-08](https://cursor.com/changelog/04-08-26) and [Cursor Bugbot learning blog](https://cursor.com/fr/blog/bugbot-learning) (self-report; competitor figures are Cursor's own comparison)
- Third-party coverage: 110,000+ repos, 44,000+ learned rules. — [creativeainews](https://www.creativeainews.com/blog/cursor-bugbot-78-resolution-rate-learned-rules/) (secondary, unverified)
- Copilot coding agent self-analyzes generated code with CodeQL-class security checks and tries to fix findings; firewall-restricted network with allowlist. — [GitHub docs](https://docs.github.com/en/copilot/responsible-use/copilot-coding-agent)
- Claude Code agent teams docs recommend parallel review with one lens per teammate (security, performance, test coverage) because a single reviewer gravitates to one issue type. — [Agent teams docs](https://code.claude.com/docs/en/agent-teams)
- Claude Code routines (launched Apr 2026, research preview): saved unattended configs on Anthropic cloud, triggers = schedule (min 1 hour), API POST, GitHub events; no approval prompts during run; daily run caps by plan (differ by source). — [Routines docs](https://code.claude.com/docs/en/routines) and [The New Stack](https://thenewstack.io/claude-code-can-now-do-your-job-overnight/)

### Inferences
- A review-feedback learning loop (Bugbot style: promote/demote rules by acceptance signal) is the vendor-proven design for learning from review; rig's REVIEW.md rules could adopt the demote-when-useless half.

### Gaps
- Claude Code `/code-review` and `/security-review` docs not fetched; Jules/Copilot code-review internals not found.

## 6. Architectural enforcement, hooks, drift cleanup

### Takeaway
Few vendors publish architectural-enforcement designs. Hooks (Claude Code, Kiro, Cursor) are the common mechanical mechanism; drift is handled by fresh restarts and cleanup passes rather than clever memory.

### Cited Findings
- Cursor: periodic fresh starts needed to counter drift and tunnel vision; agents occasionally run far too long; accepted-error plus final cleanup pass. — [scaling-agents](https://cursor.com/blog/scaling-agents), [self-driving-codebases](https://cursor.com/blog/self-driving-codebases) (self-report)
- Anthropic: clean-state requirement each session (mergeable to main, no major bugs, documented); descriptive git commits as revert points; smoke test at session start to catch broken state. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Claude Code hooks enforce gates on team events (`TeammateIdle`, `TaskCreated`, `TaskCompleted`, exit 2 to block). — [Agent teams docs](https://code.claude.com/docs/en/agent-teams)
- Kiro lists Hooks ("automate agent actions based on events") but the pages fetched gave no detail. — [Kiro steering docs](https://kiro.dev/docs/steering/)
- Cursor C-compiler analogue: Anthropic says each fix often broke something else — "the edge of what Opus 4.6 can do"; and raises concern about deploying unverified autonomous code. — [C compiler post](https://www.anthropic.com/engineering/building-c-compiler) (self-report)
- Anthropic Managed Agents: security by structure (credentials in a vault, used via a proxy; the sandbox never sees tokens) rather than assuming the model cannot misuse a scoped token. — [Managed Agents post](https://www.anthropic.com/engineering/managed-agents)

### Inferences
- Rig's mod/hook approach matches the vendor mechanism; "constraints beat instructions" (Cursor) supports encoding rules as checks rather than prose.

### Gaps
- Architectural lint/layering enforcement and "garbage collection" agents: no 2026 vendor sources found beyond the OpenAI Feb post covered in earlier notes. Kiro hooks detail missing. Amp and Warp drift handling not found.

## 7. Memory and state across sessions

### Takeaway
Everyone converged on externalizing state: progress files, git history, structured task lists, append-only session logs. Persistent "memory" products are appearing (Codex, Warp) but without published evals.

### Cited Findings
- Anthropic: progress file + feature list + git log + `init.sh` as cross-session memory; compaction alone did not carry clear handoff instructions. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Anthropic Managed Agents: session is a durable append-only event log outside the context window; the harness decides what to load; irreversible compaction can discard needed information; crashed harness resumes via `wake(sessionId)`. p50 time-to-first-token down about 60%, p95 down over 90% from decoupling and lazy provisioning. — [Managed Agents post](https://www.anthropic.com/engineering/managed-agents) (self-report)
- C-compiler: agents told to maintain READMEs and progress files since each session starts fresh. — [C compiler post](https://www.anthropic.com/engineering/building-c-compiler)
- Cursor: handoff reports from workers flow up to planners; fresh agents could still understand the browser codebase. — [scaling-agents](https://cursor.com/blog/scaling-agents)
- Codex April 2026 update reportedly added memory, automations, computer use, in-app browser, 90+ plugins. — [secondary blog](https://tinycorestudios.uk/blog/news/codex-for-almost-everything/) (unverified; no OpenAI primary found)
- Warp Oz update: "cross-harness persistent memory" and automatic multi-agent orchestration. — [SD Times](https://sdtimes.com/ai/warp-updates-oz-to-help-enterprises-orchestrate-coding-agents-across-any-model-or-harness/) (via search summary)
- Amp: threads stored server-side, resumable and shareable; Read Thread subagent. — [Hamel's Amp notes](https://hamel.dev/notes/coding-agents/amp.html) (secondary)

### Inferences
- The converged memory design is "files in the repo plus git" for coding state; vendor memory products are unproven.

### Gaps
- Replit and Augment memory designs not found.

## 8. Published numbers, failures, admitted limits (consolidated)

### Takeaway
All hard numbers are self-reports on non-reproducible demos. The consistent admissions: agents declare victory early, coordination is not solved, review is the bottleneck, costs are large.

### Cited Findings
- Cursor browser: ~1 week, 1M+ lines, ~1,000 files; hundreds of concurrent agents; peak ~1,000 commits/hour across 10M tool calls (Feb post); trillions of tokens. Solid-to-React migration 3+ weeks, +266K/-193K lines, needs careful review. Video render 25x faster. In-progress: Java LSP 7.4K commits/550K LoC; Windows 7 emulator 14.6K commits/1.2M LoC; Excel 12K commits/1.6M LoC. — [scaling-agents](https://cursor.com/blog/scaling-agents), [self-driving](https://cursor.com/blog/self-driving-codebases) (self-report; no cost figures)
- Cursor model findings: GPT-5.2 better than Opus 4.5 at extended autonomous work (Opus 4.5 stopped earlier, took shortcuts); GPT-5.2 a better planner than GPT-5.1-Codex; role-specific model assignment. "The harness and models matter, but the prompts matter more." — scaling-agents (self-report; vendor-model comparison as of Jan 2026)
- Anthropic C compiler: ~2,000 sessions over two weeks, ~2B input / 140M output tokens, just under $20,000, ~100K lines Rust, builds Linux 6.9 on x86/ARM/RISC-V. Failures: agents repeatedly hit the same kernel bug; new features broke old; an agent killed its own bash loop; output slower than GCC -O0; no own assembler/linker. — [C compiler post](https://www.anthropic.com/engineering/building-c-compiler) (self-report)
- Anthropic harness cost: retro game maker solo run 20 min / $9 vs full harness 6 hr / $200 (over 20x); DAW app on Opus 4.6 about 3 hr 50 min / $124.70 (planner $0.46; builds $71.08, $36.89, $5.88; QA $3.24, $3.09, $4.06). Runs 5-15 iterations, up to 4 hours. — [Harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) (self-report)
- Anthropic's first long-running post reports no quantitative results beyond 200+ features. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Factory: variance numbers above (self-report).
- Replit: >30% first-gen features broken (self-report, secondary relay); credit-based pricing makes long builds' cost unpredictable (third-party reviewer).
- OpenAI: GPT-5.3-Codex (Feb 2026) described by OpenAI as its first model "instrumental in creating itself"; weekly Codex developers >3M to >4M in two weeks (Apr 2026, secondary). — [LeadDev](https://leaddev.com/ai/openai-says-there-are-easily-1000x-engineers-now); [vpsranking](https://vpsranking.com/news/ai/ai-2026-04-21-openai-scaling-codex-enterprises/)
- Spec Kit 142.2k stars (repo page); earlier relay said 93k (May 2026); Copilot 4.7M paid subscribers (Jan 2026, GitHub claim via trade press). — [spec-kit](https://github.com/github/spec-kit); [IT Brief](https://itbrief.co.uk/story/github-copilot-surges-as-agent-hq-targets-ai-ecosystem)
- Augment: Harness (company) reportedly acquired selected Augment assets (Cosmos, Auggie CLI, Context Engine) on Oct 8 2026; Augment dropped inline completions Mar 2026. — [MemoryLake summary](https://www.memorylake.ai/es/blogs/harness-acquires-augment-code-context) (single secondary source, unconfirmed)

### Gaps
- Costs for Cursor runs not published. Independent replications: none found.

## 9. What newer models made unnecessary

### Takeaway
Anthropic is explicit: context resets, sprint decomposition and per-sprint QA were dropped as Sonnet 4.5 -> Opus 4.5 -> Opus 4.6 arrived. Planner and end-of-run evaluator stayed. Cursor found model choice per role matters more than elaborate structure.

### Cited Findings
- Context resets were added for Sonnet 4.5 "context anxiety" (early wrap-up); with Opus 4.5 the behavior vanished and "the resets had become dead weight". — [Managed Agents](https://www.anthropic.com/engineering/managed-agents), [Harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- Opus 4.6: builder ran coherently 2+ hours without sprint decomposition; QA moved from per-sprint to one end pass; evaluator "worth its cost only when a task sits beyond what the model does reliably alone". Planner kept. Method: remove one component at a time to find what is load-bearing (an earlier radical cut failed). — [Harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- "Every harness component assumes something the model can't do alone"; re-examine at each model release; the space of useful harnesses shifts rather than shrinks. — same
- "Start with simplest solution, add complexity only when it measurably improves results"; frameworks can hide prompts. — [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Cursor: removing complexity (integrator) often helped more than adding; "Don't over-prompt known skills". — [scaling-agents](https://cursor.com/blog/scaling-agents), [self-driving](https://cursor.com/blog/self-driving-codebases)
- Anthropic: narrow token scoping rejected as a security control since it depends on assumptions about what Claude cannot do. — [Managed Agents](https://www.anthropic.com/engineering/managed-agents)

### Inferences
- Rig should tag each harness component with the model weakness it compensates for, and re-test at model releases (ablate one at a time). Candidates likely to be stale: context-reset/handoff machinery, per-task review gates; likely durable: planner/spec, independent verification, clean-state rules, hooks.

### Gaps
- No published ablation for Opus 4.7+/Sonnet 5.x or GPT-5.5-class models.

## 10. Convergence rig should align with

### Takeaway
Align on: AGENTS.md; MCP for tool access; SKILL.md-style skills; readiness levels with binary criteria; subagent definitions as files (.github/agents, .claude/agents, ~/.codex/agents); hook events on task create/complete; progress-file + git state; a separate evaluator.

### Cited Findings
- AGENTS.md and MCP are governed by AAIF (Linux Foundation). — [LF press release](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-Agentic-ai-foundation) (via search summary)
- Subagent/custom-agent definitions as Markdown/TOML files exist in Claude Code, Copilot (`.github/agents`), Codex (`~/.codex/agents`) per sources in section 3.
- Readiness scoring: Factory only; no other vendor found shipping one.
- Cross-vendor orchestration surfaces: GitHub Agent HQ, Warp Oz (both "run Claude/Codex/own agent side by side"). — sections 3 sources (secondary)

### Inferences
- Rig's plugin form (skills + hooks + subagent files) is the shared substrate; keep outputs vendor-neutral (AGENTS.md) so a repo scored by rig is also legible to Factory/Copilot/Codex.

### Gaps
- Skills standardization status unclear; no source found tying SKILL.md to a standards body.

## Platforms with weak or no primary sourcing (flag)
- Google Jules: nothing found beyond Antigravity results; no Jules-specific harness docs retrieved.
- Google Antigravity: only Google developers blog via search snippet and third-party reviews.
- Amazon Kiro: specs and steering fetched; hooks detail and any Kiro engineering retrospectives not found.
- Sourcegraph Amp: only Jul 2025 oracle post and third-party notes; no 2026 harness lessons found.
- Replit: no Replit blog fetched; all via ZenML summaries of talks (Michele Catasta, AI Engineer).
- Augment: Context Engine MCP claims and an unconfirmed acquisition; no agent-harness post.
- Warp: launch and docs via search snippets only.
- OpenAI Codex: post-Feb 2026 primary sources not retrieved (403 on openai.com); 2026 facts are from LeadDev (OpenAI staff interview) and aggregators.
- Claude Code skills, hooks, CLAUDE.md guidance, `/code-review`: not re-fetched here; only agent-teams docs and routines snippets.
- Cursor Rules, Cursor background-agent docs: not fetched.
- GitHub Copilot: official blog/docs for Agent HQ not fetched; only changelog/docs snippets.
