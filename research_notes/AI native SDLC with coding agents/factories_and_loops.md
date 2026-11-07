# Software factories, dark factories and loop engineering (as of 2026-11-07)

Scope: autonomous software delivery with coding agents, 2025-2026. Evidence is tagged as **primary** (the author or company's own post), **secondary** (write-up of a primary), or **opinion/critique**. Where a fact came only from a secondary summary, that is said. The primary pages for StrongDM, Yegge, and Factory/Devin/Codex/Copilot/Jules were not readable in this pass (see Gaps).

## Definitions and autonomy levels

### Takeaway
"Software factory" is now used for a system of many harnessed agent loops fed by a work queue and gated by automated verification. "Dark factory" is the subset where no human reads the code. Autonomy ladders exist but are not standardized: Shapiro's six-rung ladder (0-5) is the most cited, and Osmani's article does not number levels.

### Cited Findings
- Osmani (dated 2026-07-20 in the fetched page) defines a software factory as "many harnessed loops running at once," fed by a queue of work, passing through a review gate into production, with humans overseeing the whole system. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- Osmani's closed-loop diagram, in words: intent from leadership and incident/user signals feed a work queue; a harness picks items and builds changes; CI, tests, static analysis and scanning, then a review gate; then deployment and production monitoring; monitoring feeds back into the signals. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- Osmani names two modes, not numbered levels: "dark factory" (code ships with no human reading it, verified only by machines) and "lit factory" (agents build, humans review or set direction up front where mistakes are expensive). Each loop should be set dark or lit individually; setting all loops to one mode is named as a failure mode. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- Osmani's stated autonomy rule: autonomy should not exceed what can be cheaply and reliably verified ("back pressure"). Reported reliability: agents stay coherent for roughly 3-10 steps and lose coherence past about 20. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/) (the step counts are his claim, not a measurement).
- Osmani describes generation as a wide mouth and verification as a narrow neck; speeding generation only builds a backlog at the neck. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- Osmani (dated 2026-06-07 in the fetched page) defines loop engineering as designing a system that prompts the agent for you: "a recursive goal where you define a purpose and the AI iterates until complete." It places loop engineering "one floor above the harness." Source: [Osmani, loop engineering](https://addyosmani.com/blog/loop-engineering/)
- Shapiro's "Five Levels" post, dated 2026-01-23, borrows NHTSA's driving-automation levels: L0 manual, L1 assistance, L2 partial automation (pairing), L3 conditional (AI writes most code, human reviews diffs, runs several agents), L4 high automation (human writes specs and skills, steps away, checks tests), L5 full automation / "dark factory" (black box turns specs into software). Source: [Shapiro, five levels](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/) (read via a fetch summary; verify wording against the post)
- Shapiro says "almost everyone tops out" at L3, that about 90% of "AI-native" developers are at L2, and that small teams under five people are already doing L5 "in some form." Source: [Shapiro, five levels](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/) — the 90% and the team-size claim are self-reported survey-free estimates, treat as opinion.
- Secondary write-ups disagree on the ladder's length (some say 4 levels plus a factory stage, some say five, some six numbered 0-5); the top rung is consistently the dark factory. Source: [Secondary summary, Dark Factory levels](https://signals.aktagon.com/articles/2026/03/dark-factory-architecture-how-level-4-actually-works/) and [Autonomy ladder summary](https://developertoolkit.ai/en/ladder/) (secondary; not verified against Shapiro's post for numbering).

### Inferences
- The industry vocabulary converged in early 2026 on "level of autonomy" plus "factory = loops + verification gate". The levels are self-descriptions by practitioners, not measured categories, so they cannot be used to compare vendors.
- Osmani's per-loop dark/lit choice is more actionable than a single org-wide level.

### Gaps
- No vendor or independent survey measures what share of teams are at L3 or L4; the 90%/L2 figure has no methodology in the sources found.
- Shapiro's primary post was read through a fetch summary, not verbatim.

## Real factory attempts

### Takeaway
The clearest published "no human writes or reviews code" attempt is StrongDM's AI team, documented secondhand by Simon Willison (Feb 2026). Its core ideas are scenario holdouts outside the repo, behavioral digital twins of third-party services, and a probabilistic satisfaction metric. Its cost claim and its safety are both disputed and unmeasured in public.

### StrongDM software factory (secondary: Willison; primary StrongDM post not read)
- Founding rules as reported: code must not be written by humans and must not be reviewed by humans. Team founded July 2025; three people named in a secondary source (Justin McCarthy, Jay Taylor, Navan Chauhan). Source: [Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory) and [Willison Substack](https://simonw.substack.com/p/how-strongdms-ai-team-build-serious)
- "Scenarios" are end-to-end user stories stored outside the codebase so coding agents cannot see them, functioning like a holdout set; checked by an LLM. Source: [Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory)
- Satisfaction metric: the fraction of observed trajectories through all scenarios that likely satisfy the user, replacing a boolean "suite is green." Source: [Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory)
- Digital Twin Universe: agent-built behavioral clones of Okta, Jira, Slack, Google Docs/Drive/Sheets; each is a self-contained Go binary; target is "100% compatibility" with reference SDKs. Lets scenarios run at volumes beyond live rate limits and including dangerous failure modes. Source: [Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory)
- Cost benchmark quoted: spend at least about $1,000 on tokens per engineer per day, roughly $20,000/month (Willison's arithmetic). This is a claim about StrongDM's practice reported by Willison, not an audited figure. Source: [Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory)
- Caveats (opinion): Willison doubts that no-human-review is sensible given LLM failure modes; he calls the economics "mainly a business-model question"; he says his October visit showed demos that predated late-2025 model improvements; he treats "can agents prove code works without anyone reviewing" as open. Source: [Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory)
- Critic (opinion): scenarios are only as comprehensive as whoever writes them, so human involvement may have moved from code review to scenario design. Source: [Pragmatic CTO critique, mirrored](https://hn.jakechampion.name/reader/https://www.thepragmaticcto.com/p/the-software-factory-when-no-human) and [Crosley, verification layer](https://blakecrosley.com/blog/the-dark-factory-verification-layer)

### Huntley Ralph loop (primary)
- Original post dated 2025-07-14: a bash loop repeatedly feeding a prompt file to a coding agent, `while :; do cat PROMPT.md | claude-code ; done`. Source: [Huntley, ghuntley.com/ralph](https://ghuntley.com/ralph/)
- State lives outside the context window: `fix_plan.md`, specs folder, `AGENT.md` (build/run), code, git commits and tags. Each iteration starts fresh. Source: [Huntley, ghuntley.com/ralph](https://ghuntley.com/ralph/)
- Sizing rule: one thing per loop. Stated context budget about 170k tokens, with quality dropping as the window fills. Only one subagent should run builds/tests for Rust, to avoid back pressure. Source: [Huntley, ghuntley.com/ralph](https://ghuntley.com/ralph/)
- No formal stop condition: the loop ends when TODOs run out or it "goes completely off track"; the author warns you may wake to a non-compiling codebase and must choose `git reset --hard` or new prompts. Source: [Huntley, ghuntley.com/ralph](https://ghuntley.com/ralph/)
- Cost anecdote (primary, shared 2025-07-11 from an iMessage with permission): a $50k contract delivered as an MVP for $297 in API costs, using Amp. Single anecdote, unaudited. Source: [Huntley, ghuntley.com/ralph](https://ghuntley.com/ralph/)
- Anthropic shipped an official Ralph Wiggum plugin in December 2025 with Stop Hooks; Huntley and others argue it misses the point. Source: only a secondary summary was read ([Ralph loop explainer, howaiworks](https://howaiworks.ai/blog/geoffrey-huntley-ralph-agentic-coding-loop)); verify date.

### Steve Yegge Gas Town (secondary only; Medium and GitHub returned 403 / not read)
- Open-source Go workspace manager running roughly 20-30 Claude Code instances in tmux, with work state in his Beads system; a "Mayor" agent coordinates. Released around January 1, 2026 per one source (another says proposed December 2025). Sources: [ASCII News, 2026-01-02](https://ascii.co.uk/news/article/news-20260102-190a5f9f/steve-yegge-releases-gas-town-multi-agent-orchestrator-for-c), [heise](https://www.heise.de/en/background/Full-Control-Gas-Town-Orchestrates-Ten-or-More-Coding-Agents-11178824.html?seite=2)
- Later: Wasteland (trust network linking Gas Towns), Gas City (April 2026), Kilo cloud-hosted version. Source: [SD Times, Kilo](https://sdtimes.com/softwaredev/gas-town-by-kilo-multi-agent-orchestrator-now-available/) (secondary)
- Reception mixed; complexity and steep learning curve are the common criticisms. Source: [Gas Town summaries](https://rywalker.com/research/gastown) (secondary)

### Vendor agents (Devin, Factory Droids, OpenAI Codex cloud, GitHub Copilot coding agent, Google Jules, Claude Code background/cloud)
- Category as described in 2026 secondary comparisons: assign-and-forget cloud VM agents that open pull requests for review. Source: [SSOJet, cloud coding agents](https://ssojet.com/blog/best-cloud-coding-agents) (secondary)
- Copilot coding agent is described as issue-to-PR automation included in paid Copilot plans. Jules is described as a Google Labs async agent in a cloud VM that reached GA at Google I/O 2026. Source: [Rework comparison](https://resources.rework.com/tools/ai-agents/best-ai-coding-agents-2026) (secondary; not checked against vendor docs)
- Funding figures conflict across sources and are **not reliable**: Cognition/Devin reported at $1B raise at $26B (June 2026) in one source and over $2B at $48B (Sept 8, 2026) in another; Factory reported at $1.5B and at $5B. Sources: [Sacra, Factory](https://sacra.com/c/factory/) and [Techsy comparison](https://techsy.io/zh-tw/blog/devin-claude-code-codex-coding-agents-2026) (secondary, conflicting; the snippets used were search-result text, not full pages). Do not cite these numbers without a primary source.
- No public success-rate data for these products was found in this pass.

### Inferences
- Public "lights-out" evidence is one organization's self-report (StrongDM), one author's anecdote (Huntley), and a product ecosystem with no independent benchmark of unattended PR throughput.
- The pattern across all of them is that the human moves to scenario/spec writing and outer-loop judgment, which matches Osmani's "outer loop" framing.

### Gaps
- StrongDM primary post and Attractor repo not read; scenario counts, defect escape rates and actual spend are unverified.
- Yegge's own posts and repo not read (403).
- Factory, Devin, Codex, Copilot and Jules primary docs not read; no first-party autonomy or merge-rate data gathered.

## Loop patterns and convergence

### Takeaway
Loops are the unit of autonomy. Convergence depends on cheap, hard-to-fake verification and fresh-context iteration with state in files and git. Divergence follows from unverified "done" claims, long loops past roughly 3-10 steps, and parallel agents editing the same files.

### Cited Findings
- Inner loop vs outer loop: Osmani uses the harness as the inner unit and loop engineering as the layer above it, running on timers and spawning helpers. Source: [Osmani, loop engineering](https://addyosmani.com/blog/loop-engineering/)
- Example loop patterns from Osmani: scheduled triage (daily reads of CI failures, issues and commits, writing findings to a file or tracker); isolated fixes (each finding in its own git worktree, a maker subagent drafts, a separate verifier reviews); goal-based completion (`/goal` runs until a condition like "all tests in test/auth pass and lint is clean" holds, checked by a separate model); connected delivery (PR, ticket and channel updates after CI passes); state persistence (a markdown or tracker file records what was tried and what remains). Source: [Osmani, loop engineering](https://addyosmani.com/blog/loop-engineering/)
- Failure modes Osmani lists: unverified "done"; comprehension debt; "cognitive surrender" (accepting output without judgment); parallel collisions on shared files; context loss without skills; token cost variance, worse with subagents. Source: [Osmani, loop engineering](https://addyosmani.com/blog/loop-engineering/)
- Graph workflows: Osmani's factory article describes a predefined directed graph (reproduce, find cause, fix, test, review, done) with conditional edges where failing tests route back to fix and only approval reaches done. He says graph control flow tends to beat open-ended loops for reliability, a claim he does not quantify. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- Ralph convergence rules: fresh context per iteration, one item per loop, git as memory, and a planning loop to regenerate the TODO list when it drifts. Source: [Huntley, ghuntley.com/ralph](https://ghuntley.com/ralph/)
- Automation is justified only when checks are cheap, fast and hard to fake (Osmani). Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- StrongDM's "assert true" critique: agents writing both code and tests can game them, so scenario holdouts that the coding agent cannot read are the proposed countermeasure. Source: [Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory)
- Overnight/nightly pattern: a nightly cron job that makes one small fix and opens one small PR is cited by Osmani as acceptable unattended work. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)

### Inferences
- Convergence is a property of the verifier, not the generator. A loop with a weak done-check diverges even with a good model.
- "One thing per loop" and fresh context are the cheapest guards against divergence; they cost throughput.

### Gaps
- No controlled comparison of ralph vs. single-session vs. graph loops on the same tasks was found.
- Self-healing CI as a named pattern was not separately sourced.

## Why lights-out factories fail today

### Takeaway
The main limits are verification (the neck), spec ambiguity (moved upstream, not removed), context budget, compounding error over long horizons, and cost. Preconditions are strong sensors, holdout scenarios and, for external-service-heavy systems, digital twins.

### Cited Findings
- Verification is the bottleneck, not generation. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- Comprehension debt accumulates when nobody understands the code, and models alone are unlikely to fix it in large long-lived codebases (Osmani's claim). Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- Multi-agent coordination failure, the Cognition argument (June 12, 2025): subagents given partial context misread subtasks; parallel agents making implicit decisions produce conflicting outputs; so the author recommends a single-threaded linear agent by default, with a compression model for very long tasks. He calls multi-agent systems fragile in 2025. Source: [Walden Yan, Cognition, "Don't Build Multi-Agents"](https://cognition.com/blog/dont-build-multi-agents) (fetched via redirect from cognition.ai)
- Context budget: Huntley's rule of thumb is about 170k tokens of usable context, with output quality dropping as it fills. Source: [Huntley, ghuntley.com/ralph](https://ghuntley.com/ralph/)
- Token cost: Anthropic reports agents use about 4x the tokens of chat and multi-agent systems about 15x; token usage explained about 80% of performance variance on BrowseComp. Source: [Anthropic, multi-agent research system, 2025-06-13](https://www.anthropic.com/engineering/multi-agent-research-system)
- Multi-agent suits breadth-first, parallelizable, over-context tasks and is a poor fit for tasks needing shared context or many dependencies, "such as most coding tasks" (Anthropic's own statement). Source: [Anthropic, multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- Anthropic's multi-agent research system beat single-agent Opus 4 by 90.2% on its internal research eval, with lead Opus 4 and Sonnet 4 subagents. Source: [Anthropic, multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (self-reported internal eval)
- Scenario-quality risk: scenarios are only as good as their author. Source: [Willison, 2026-02-07](https://simonwillison.net/2026/Feb/7/software-factory) and critique cited above.
- Testing-your-tests risk, and reliance on verification of claims: Osmani warns that "done" is a claim, not a proof. Source: [Osmani, loop engineering](https://addyosmani.com/blog/loop-engineering/)

### Inferences
- Anthropic's and Cognition's positions are compatible: multi-agent helps for read-heavy, independent research; coding favors one writer plus read-only helpers. Neither source addresses unattended long-running factories directly.
- Holdout scenarios and digital twins address the verification gap by moving the oracle outside the agent's reach. They do not address spec ambiguity; scenario writers take that on.

### Gaps
- No public, independent measurement of defect escape rate for no-review code exists in the sources found.
- Digital-twin fidelity drift (twins diverging from real services over time) was not sourced.

## Long-horizon capability trends (METR)

### Takeaway
METR's 50% time horizon has been growing exponentially, with the doubling-time estimate contested (about 7 months in the 2025 paper, 130.8 days / about 4.3 months in the January 2026 Time Horizon 1.1 update). Measurements above 16 hours are unreliable on the current task suite.

### Cited Findings
- Definition: the task duration (in human expert time) at which an agent is predicted to succeed at a given reliability; the 50% horizon is the duration at 50% success. METR stresses it measures task difficulty, not how long an AI works. Source: [METR time horizons](https://metr.org/time-horizons/)
- Exponential fits better than linear or hyperbolic, and a logistic fit is poor because growth shows no sign of slowing. Source: [METR time horizons](https://metr.org/time-horizons/)
- "Measurements above 16 hrs are unreliable with our current task suite." Human baselines likely overestimate expert time. Tasks are mostly SWE, ML and cybersecurity and are cleaner than real work. 99%-reliability horizons not reported. Source: [METR time horizons](https://metr.org/time-horizons/)
- The page lists dated additions including GPT-5 (about 2h17m horizon, added 2025-08-06), Claude Opus 4.5 (2025-12-19), Claude Opus 4.6 and GPT-5.3-Codex (2026-02-20), GPT-5.4 (2026-04-10), Gemini 3.1 Pro (2026-04-15), Claude Mythos Preview (early, 2026-05-08). Page says it is "no longer actively updated," last updated 2026-09-08. Source: [METR time horizons](https://metr.org/time-horizons/)
- Doubling time: METR's March 2025 paper gave about seven months for 2019-2025. Time Horizon 1.1 (January 2026) estimates the post-2023 doubling at 130.8 days (about 4.3 months). Source: [Secondary summary citing METR, Wikipedia-style snapshot](https://www.greaterwrong.com/posts/EYb2K9acKfyG2bome/metr-time-horizons-now-10x-year) and [METR AI releases summary](https://thursdai.news/companies/metr) (secondary; METR's own figure not read directly)
- Forecasters revised present doubling to about 4 to 4.5 months (AI Futures). Source: [AI Futures Q1 2026 timelines update](https://hn.jakechampion.name/reader/https://blog.aifutures.org/p/q1-2026-timelines-update) (forecast, not measurement)
- Secondary summaries report Claude Opus 4.6 at a 50% horizon of about 14.5 hours and Claude Mythos at "at least 16 hours" (May 2026 snapshot). These are unverified against METR's chart. Source: [AI newspaper summary](https://ainewspapertoday.pages.dev/issues/claude-opus-46-metr-benchmark-exponential-progress) and the METR snapshot above.

### Inferences
- Horizons near the top of the scale are at or beyond what the benchmark can resolve, so 2026 headline numbers carry wide error.
- Doubling time depends on the methodology version; quoting "doubling every N months" without the version is misleading.

### Gaps
- METR's current chart values for late-2026 models were not read; no number after May 2026 is sourced.
- METR's own time-horizon-to-real-SWE-work mapping (software tasks vs. unattended delivery) was not found.

## Multi-agent vs single-loop, and standards

### Takeaway
The debate is unresolved in public. Cognition (2025) argues single-threaded by default; Anthropic (2025) shows multi-agent wins for breadth-first research at about 15x token cost. Standards are consolidating under the Linux Foundation's Agentic AI Foundation (AAIF).

### Cited Findings
- Cognition vs Anthropic: see the two entries under "Why lights-out factories fail" above. Sources: [Cognition](https://cognition.com/blog/dont-build-multi-agents), [Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)
- AAIF was announced by the Linux Foundation on 2025-12-09 with MCP (Anthropic), goose (Block) and AGENTS.md (OpenAI) as founding projects. Source: [Linux Foundation AAIF formation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation?lang=fr) (search snippet; primary press release date confirmed in search, not fetched). Some low-quality blogs date it to April 2026; this conflicts with the Linux Foundation date and was discarded.
- A2A joined AAIF as a hosted project. Dates conflict: Latent Space wiki says announced 2026-08-17; a Vietnamese blog says Google handed it over on 2026-08-20. Source: [Latent Space AAIF wiki](https://latent.space/wiki/aaif/) and [FlowHunt](https://www.flowhunt.io/vi/blog/agentic-ai-foundation-a2a-mcp-standards/). Google launched A2A in April 2025 (secondary).
- AAIF added agentgateway as a hosted project on 2026-06-04 and reports 300+ contributors across 60+ organizations at admission (Latent Space wiki, secondary). Source: [Latent Space AAIF wiki](https://latent.space/wiki/aaif/)
- AGENTS.md: a project-level instruction file for coding agents, launched by OpenAI in 2025. The "60,000+ projects" figure comes from a low-quality blog and is **not verified**. Source: [agentic-ai docs](https://agentic-ai.readthedocs.io/en/latest/Standards/agentic-ai-foundation/) (secondary)

### Inferences
- Standards are converging on three layers: MCP for tool access, AGENTS.md for repo instructions, A2A for agent-to-agent. For a factory, AGENTS.md and the repo's skills are the harness-facing files that matter most.
- Multi-agent design is an empirical question per task; the cited evidence points to read-heavy parallel work as the safe use.

### Gaps
- No A2A production adoption data found.
- No head-to-head benchmark of single-loop vs multi-agent on coding tasks with the same token budget.

## Forward-looking trends and predictions (2027)

### Takeaway
Sources agree the direction is toward longer unattended loops, verification-first tooling, and human work shifting to specs, scenarios and outer-loop review. Specific 2027 predictions in the sources are forecasts and should be labelled as such.

### Cited Findings
- Osmani expects the engineer's role to shift to the outer loop: choosing approaches, verifying diagnoses, approving changes and owning consequences. Source: [Osmani, software factories](https://addyosmani.com/blog/software-factories/)
- Shapiro says most teams stall at L3 and that small teams are already at L5 in some form. Source: [Shapiro, five levels](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/)
- AI Futures shortened its doubling-time estimates to about 4-4.5 months. Source: [AI Futures](https://hn.jakechampion.name/reader/https://blog.aifutures.org/p/q1-2026-timelines-update) (forecast)

### Inferences
- If METR's doubling holds near 4 to 5 months, the length of tasks agents complete reliably would grow by a factor of several per year. This is an extrapolation past the range the benchmark can measure.
- The binding constraint is shifting from generation to verification and cost. Expect investment in holdout suites, digital twins and sensors.

### Gaps
- No 2027 forecasts from Anthropic, OpenAI, Cognition or StrongDM were read directly.
- No evidence on how vendor pricing of long agent runs will move.

## Source quality notes
- Primary and read directly: Osmani x2, Huntley, Anthropic multi-agent, Cognition (via redirect), METR time horizons page, Shapiro (via fetch summary).
- Secondary: Willison (StrongDM), Gas Town coverage, Kilo, Ralph plugin, AAIF/A2A dates, Devin/Factory/Copilot/Jules descriptions.
- Conflicting or unreliable: Devin and Factory valuations, AGENTS.md adoption count, A2A transfer date, METR late-2026 values, Shapiro's level count.

## Gaps summary
- StrongDM primary post and Attractor repo: not read.
- Yegge Medium post and GitHub repo: returned 403 / not read.
- Shapiro's primary essay: read via a fetch summary.
- Factory, Devin, Codex cloud, Copilot coding agent, Jules, Claude Code routines: no vendor docs read; no autonomy or throughput data.
- METR current chart: not read.
- No independent evidence on defect rates for no-review code.
