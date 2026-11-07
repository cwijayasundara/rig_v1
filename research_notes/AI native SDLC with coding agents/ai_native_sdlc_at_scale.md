# AI-native SDLC with coding agents at team and enterprise scale (2025-2026)

Research date: 2026-11-07. Latest source found: Anthropic playbook, 2026-08-21. About 16 tool calls. Most numbers below come from one fetch or search snippet. Items marked **[secondary]** were not confirmed on the primary page. Items marked **[vendor]** come from a company selling the product being described.

## 1. Anthropic's "AI-native SDLC playbook"

### Takeaway
Anthropic's playbook (2026-08-21) treats planning, review/testing and deployment as the new bottlenecks once code is cheap to write. It proposes six stages, each committing an artifact the next stage reads, with human attention moved to gates. It gives no formal maturity model.

### Cited Findings
- Published 2026-08-21 by Louis Claxton, with a 40-minute reading time; it also calls the practice "agentic SDLC" or "AI SDLC" — [Anthropic playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- Core premise: AI makes code writing fast, but surrounding process still runs at human speed. Three consequences: the bottleneck moves to planning, review/testing and deployment; human-reviewed controls stop matching output volume; governance costs rise when exceptions wait for committees — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- Six stages and their committed artifacts: Plan → `intent.md` (originator-written proto-spec); Design → `spec.md` (requirements and design in one session); Build → `plan.md`, code, tests, governed by `CLAUDE.md`, skills and hooks; Test → continuous evals and self-verification loops replacing stage-boundary QA gates; Deploy → layered agentic PR review (`REVIEW.md`) with hooks as approval gates; Maintain → monitoring agents detect breaches and write new `intent.md` files — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- Roles named: originator/product owner (approves intent and spec); engineers (plan-mode sessions, steer parallel sessions, review); tech lead/architect (`REVIEW.md`, higher-risk decisions); code owner (branch-protection approval); platform/IT admin (managed settings, marketplaces, MCP allowlists); platform engineer (evals, hooks, CI/CD); policy owner (source of truth per policy, signs skill changes); release manager (production deploy authority); service owner/on-call (triage of monitoring findings); security lead; change management/compliance (approval gates that must survive) — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- Maturity: no formal model. The direction is from hand-prompting each step toward a loop where each accepted artifact triggers the next gate; start with plays that have no prerequisites and follow the dependency arrows — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- Practice specifics: plan mode before any code; keep `CLAUDE.md` under one page and add a rule for each repeated mistake; skills for institutional knowledge, hooks for guarantees; start with 2-3 parallel sessions using git worktrees; write failing tests before fixes and block agents from editing tests during fixes; eval suite of 20-50 real tasks; tiered monitoring responses (1σ log, 2σ diagnose, 3σ propose) with a 30-day rolling baseline in the example; schedule recurring security scans; feed incidents back into evals — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- The page's own caveats: skills are advisory, so always-true policies need hooks or a review pass behind them; auto-accept mode should be earned; managed-settings examples are "a starting point to tailor" — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- The page states that merges to Anthropic's monorepo grew from about 2,500 to more than 30,000 a day, as a related-article note. This was not verified — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor, unverified]

### Inferences
- The playbook is a vendor reference architecture. Its roles and gates are a template, not measured adoption data. Its evals and monitoring thresholds are examples.
- "Skills are advisory, hooks guarantee" is a useful governance rule to keep, because it matches the independent Thoughtworks concern about prompt injection (section 6).

### Gaps
- No independent data on how many teams have adopted the six-stage loop, or its effect on lead time or change failure rate.
- The playbook's example numbers (50 rps limit, `requiredMinimumVersion` 2.1.193) are illustrative and not evidence.

## 2. How each SDLC phase is changing (including spec-driven development)

### Takeaway
Specs are becoming the input artifact for coding agents, and several tools now package spec-first workflows. Independent evidence is limited to Thoughtworks' qualitative assessment. Tessl and BMAD were not researched.

### Cited Findings
- GitHub Spec Kit: open-source, MIT-licensed CLI that adds a specify → plan → tasks → implement workflow to any of about 30 agents (including Claude Code, Copilot, Cursor). Launch post dated 2025-09-02 — [secondary: ssojet](https://ssojet.com/blog/best-spec-driven-development-tools) and [secondary: glukhov.org](https://www.glukhov.org/nl/ai-devtools/ai-coding-assistants/spec-kit-vs-kiro-vs-claude-code/)
- Spec Kit star counts conflict: about 71K in a March 2026 post, over 115K in a June 2026 post. Treat as approximate — [secondary: morphllm](https://www.morphllm.com/spec-driven-development) [secondary]
- AWS Kiro: spec-first IDE built on a VS Code/Code OSS fork, using Bedrock-backed models with credit-based tiered pricing. One source says it launched 2026-05-07 as the successor to Amazon Q Developer. Unverified single source — [secondary: codemyspec](https://codemyspec.com/blog/spec-kit-vs-kiro) [secondary]
- Thoughtworks Technology Radar Vol. 34 (April 2026): "Our teams have also seen value in spec-driven development frameworks such as GitHub Spec Kit and OpenSpec." Also flags harness-style controls (guides before generation, sensors after: compilers, linters, type checkers, test suites), and says the term "spec-driven development" is used inconsistently. The ring placement was not confirmed — [Thoughtworks Radar](https://www.thoughtworks.com/en-us/radar) [independent]. Third-party digest: [agentic-ai digest of Vol. 34](https://agentic-ai.readthedocs.io/en/latest/AgenticTechStack/thoughtworks-radar-vol34/) [secondary]
- Google (Pichai) states about 75% of new code is AI-generated and engineer-approved, up from 50% "last fall" (cited in 2026 Cloud Next/blog coverage). Earlier figures: about 25% (Q3 2024 earnings call, 2024-10-29); more than 30% (Q1 2025 earnings call, April 2025). Primary blog/earnings transcripts were not opened — [secondary: freepressjournal](https://www.freepressjournal.in/tech/today-75-of-all-new-code-at-google-is-now-ai-generated-approved-by-engineers-ceo-sundar-pichai) [vendor, unverified]. Google has not disclosed how much AI code is rejected or rewritten before shipping — [secondary: techradar](https://www.techradar.com/pro/alphabet-ceo-says-more-than-a-quarter-of-new-code-at-google-is-ai-generated) [secondary]
- Stripe "Minions" (internal coding agents, one-shot end-to-end): 1,300+ merged PRs per week as of Feb 2026, up from about 1,000 ten days earlier. Humans review each change before merge; no example PRs published — [Stripe Dev Blog, Minions Part 2, Feb 2026](https://stripe.dev/blog/topic/developer%20productivity) [vendor]; reviewer skepticism and the lack of published PRs noted in [secondary analysis](https://software-factories.port.io/stripe) [secondary]
- Anthropic's own usage (secondary coverage of the Anthropic internal study, Aug 2025): 132 engineers and researchers surveyed, 53 interviews, 200,000 internal Claude Code transcripts (Feb and Aug 2025); engineers report using Claude in about 60% of their work, with self-reported productivity gain near 50%. Primary: anthropic.com/news/how-anthropic-teams-use-claude-code was not opened — [secondary: besthub / weihaoqu summaries] [vendor, unverified]

### Inferences
- The clearest phase shift is in the front (spec/intent) and back (review, verification, monitoring) of the loop. Implementation is the part agents already do.
- Spec-first tools converge on the same four steps (specify, plan, tasks, implement), which suggests the pattern is stabilising.

### Gaps
- Tessl, BMAD and OpenSpec were not researched beyond Thoughtworks mentions.
- No independent data on how specs affect defect rates or rework.
- Phase-level metrics for requirements, design and deployment are absent in what was found.

## 3. Team topology and roles

### Takeaway
Vendor sources describe engineers as orchestrators and reviewers, with approval gates owned by named roles and a platform team that owns hooks, evals and managed settings. The review bottleneck is asserted often but not quantified in independent sources found.

### Cited Findings
- Playbook roles (see section 1) assign the platform engineer to evals, hooks and CI/CD, and the platform/IT admin to managed settings and MCP allowlists — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- Stripe: humans still review each agent change; a commenter questioned whether review is substantive — [secondary: Stripe Minions coverage](https://ai-tools-aggregator-seven.vercel.app/blog/2026-02-20-stripe-minions-coding-agents) [secondary]
- Thoughtworks: "a task completed successfully once offers no guarantee it will succeed the next time"; "cognitive debt" concern: easy adoption of AI-generated solutions without the mental model to understand them — [Thoughtworks Radar Vol. 34](https://www.thoughtworks.com/en-us/radar) [independent]
- DORA 2025 names seven team archetypes; the blog names only "Harmonious high-achievers" and "Legacy bottleneck" without the full set — [Google blog, Sep 23 2025](https://blog.google/technology/developers/dora-report-2025/) [vendor-published research]

### Inferences
- The "engineer as orchestrator" framing comes from vendor material. Independent sources back the need for review and verification, not the orchestrator role itself.
- A platform team owning harness (hooks, evals, skills, CLAUDE.md) is consistent across the playbook and Thoughtworks' "harness" theme.

### Gaps
- No independent measurement of PR review queue time, reviewer load or the review bottleneck at scale.
- DORA's seven archetypes and their definitions are in the full report, which was not retrieved.

## 4. Productivity and quality evidence

### Takeaway
The best independent evidence is mixed: a controlled trial (METR, July 2025) found experienced developers were 19% slower on their own repos, while large-scale surveys (DORA 2025) show high self-reported productivity. Code-quality data from GitClear points to more duplication, though the source is a vendor and the causality is correlational.

### Cited Findings
- METR RCT (published 2025-07-10): 16 experienced open-source developers, 246 real issues across large repos (22k+ stars, 1M+ lines), each randomly assigned AI-allowed or AI-disallowed. AI allowed increased completion time by 19%. Developers predicted a 24% speedup and, after the study, still believed AI had sped them up by 20% — [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) [independent]
- METR's caveats: "a snapshot of early-2025 AI capabilities in one relevant setting"; likely selection bias in which developers participated; AI may still be useful in other contexts — [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) [independent]
- METR's banner: "We believe these historical results no longer reflect the current impact of AI models"; new data published Feb 2026 on late-2025 tools (figures not extracted) — [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) [independent]
- Primary paper: arXiv:2507.09089 — [arXiv](https://web3.arxiv.org/pdf/2507.09089) [independent]. The page does not report confidence intervals; METR says they are "forthcoming" [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) [independent]
- A separate randomized trial with 96 Google engineers reportedly found about 21% time saved on a complex enterprise task — unverified, secondary search snippet only, no primary URL retrieved [secondary: infoworld/other coverage] [independent, unverified]
- DORA 2025 (Google Cloud, Sep 2025; blog dated Sep 23 2025; survey of nearly 5,000 professionals; 100+ hours qualitative data): adoption 90% (+14 points year on year); median two hours a day with AI; 65% rely heavily on it; over 80% say AI enhanced productivity; 59% say positive effect on code quality; trust: 24% a great deal or a lot, 30% a little or not at all; AI adoption linked to higher delivery throughput (reversal of prior year). No stability figure given on the blog — [Google blog](https://blog.google/technology/developers/dora-report-2025/) [vendor-published research]; [DORA research page](https://research.google/pubs/dora-2025-state-of-ai-assisted-software-development-report/) [vendor-published research]
- GitClear "AI Copilot Code Quality" (2025): about 211M changed lines, Jan 2020 to Dec 2024. Duplicated code blocks rose roughly eightfold in 2024; five-plus-line duplicates about ten times higher than two years earlier — [LeadDev/secondary](https://zporigin.leaddev.com/?p=24110) [vendor-analytics, secondary]; [GitClear research page](https://gitclear.com/recent_ai_developer_productivity_code_quality_research) [vendor]; [DevClass, 2025-02-20](https://devclass.com/2025/02/20/ai-is-eroding-code-quality-states-new-in-depth-report/) [secondary]
- GitClear churn figures conflict: 3.3% (2021) to 5.7% (2024) in one source; 7.1% (2025) in a Larridin summary that could not be verified. Moved/refactored code fell from 25% (2021) to under 10% (2025) per GitClear material — [secondary: larridin](https://larridin.com/developer-productivity-hub/code-churn-ai-era-doubled) [secondary, unverified]
- Anthropic's Dario Amodei is reported (secondary, early 2026) to say Claude writes more than 80% of merged production code — [secondary: cryptobriefing](https://cryptobriefing.com/anthropic-claude-generates-80-percent-code/) [vendor, unverified]

### Inferences
- The METR result and vendor self-reports measure different things: METR measures time on familiar repos with early-2025 tools; surveys measure perceived gains. Neither gives cost per merged PR or defect rate under current tools.
- DORA's throughput-up finding and GitClear's duplication-up finding can both hold. Throughput is measured per delivery; duplication is measured per line.
- Vendor "percent of code written by AI" figures do not say how much is rejected or rewritten.

### Gaps
- No independent, current (2026) RCT comparable to METR's. METR's Feb 2026 follow-up was not read.
- No independent defect or change-failure-rate data attributable to coding agents.
- Shopify and Coinbase internal stats were not found; not researched.
- DORA stability/change-failure data for AI use was not in the blog text.

## 5. Economics: token cost, cost per PR, budgets, routing, caching

### Takeaway
Anthropic's current Claude Code cost page gives about $13 per developer per active day and $150-250 per developer per month, with 90% of users under $30 per active day. Routing and caching were not researched beyond the repo's own CLAUDE.md policy. No independent cost-per-PR data was found.

### Cited Findings
- Anthropic's Claude Code cost docs: average about $13 per developer per active day; $150-250 per developer per month; 90% of users under $30 per active day. Secondary reports say the figure was $6 a day before a change around 2026-04-16 — [Claude Code costs](https://code.claude.com/docs/en/costs) [vendor]; [secondary: shopifreaks](https://www.shopifreaks.com/anthropic-more-than-doubles-its-public-estimate-of-average-daily-claude-code-spending-from-6-to-13-per-developer/) [secondary]
- Enterprise cost controls per the same docs: spend report in org analytics (per user and per model, CSV export); Enterprise Analytics API; workspace spend limits on API orgs; OpenTelemetry export for per-user token and cost metrics — [Claude Code costs](https://code.claude.com/docs/en/costs) [vendor]
- Stripe Minions runs at 1,300+ merged PRs a week, but no cost figure was published in what was found — [Stripe Dev Blog](https://stripe.dev/blog/topic/developer%20productivity) [vendor]
- The repo's own CLAUDE.md pins model roles: Haiku for read-only search and docs lookup, Sonnet for implementers and test writers, Opus only for final diff review and chart review, with a stated target of under $8 and 45 minutes per Spec-2-sized change. This is a local policy, not industry evidence — `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/CLAUDE.md` [local]

### Inferences
- Spend is dominated by model choice, codebase size and parallel sessions (per Anthropic docs). Routing reads to small models and reserving frontier models for review is the common lever, but the savings were not quantified by any independent source found.
- A per-PR budget needs both spend and merged-PR counts from the same team. Neither was found with a shared denominator.

### Gaps
- Prompt caching savings, cache-hit rates, and budgets per team were not researched.
- No independent cost-per-merged-PR data.
- Routing evidence (quality impact of Haiku/Sonnet/Opus splits) was not found.

## 6. Governance: permissions, sandboxing, audit, security, prompt injection

### Takeaway
Governance sources agree that agent-written code has higher vulnerability rates and that prompt injection is unsolved. The strongest independent number is Veracode's 45% failure rate, from a security vendor. Permissions, sandboxing and audit mechanics were not researched beyond what the playbook names.

### Cited Findings
- Veracode 2025 GenAI Code Security Report (published 2025-07-30): 80 curated coding tasks, more than 100 LLMs; 45% of samples failed security tests and introduced OWASP Top 10 vulnerabilities; models picked the insecure option 45% of the time; no improvement in security over time despite better syntax; Java above 70% failure, Python/C#/JavaScript 38-45%; XSS and log injection failed in 86% and 88% of cases — [Veracode report](https://www.veracode.com/genai-code-security-report/) [vendor; sells Veracode Fix]; [press release](https://www.veracode.com/press-release/ai-generated-code-poses-major-security-risks-in-nearly-half-of-all-development-tasks-veracode-research-reveals/) [vendor]
- Thoughtworks Radar Vol. 34 (April 2026): flags prompt injection as an unsolved problem — [Thoughtworks Radar](https://www.thoughtworks.com/en-us/radar) [independent]
- Playbook: skills are advisory; policies that must always hold need hooks or a review pass; managed settings for regulated environments; scheduled security scans; Claude Security public beta for Enterprise — [playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) [vendor]
- DORA 2025: 30% of respondents trust AI little or not at all — [Google blog](https://blog.google/technology/developers/dora-report-2025/) [vendor-published research]

### Inferences
- A secure-by-default code path (checks in the harness, not in the prompt) matters more when Veracode-style failure rates hold. Veracode's sample is synthetic tasks, so real-world rates will differ.
- Trust gaps (DORA) and prompt-injection risk (Thoughtworks) point to the same control: deterministic gates the agent cannot skip.

### Gaps
- Not researched: sandboxing mechanics, permission models, audit log standards, and real prompt-injection incident data from 2026.
- No independent replication of Veracode's rates on current models.
- Veracode's 80-task sample and its recommendations favour its own product.

## Source-quality summary
- Independent: METR (2025), Thoughtworks Radar Vol. 34 (2026), arXiv 2507.09089.
- Vendor-published research: DORA 2025 (Google), Veracode 2025 (sells product), GitClear (sells analytics), Anthropic playbook and docs, Stripe Dev Blog.
- Unverified or secondary, use with caution: Google 75% figure, Anthropic 80% claim, GitClear 7.1% churn, Google-engineers 21% trial, Spec Kit star counts, Kiro launch date, Anthropic's monorepo growth figures.
