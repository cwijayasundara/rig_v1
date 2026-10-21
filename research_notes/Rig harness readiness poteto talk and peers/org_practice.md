# Org-level practice for AI-generated code in production, mixed-seniority teams (as of Oct 2026)

Method note: 11 searches, no page fetches. Search tool returned summaries, so almost everything below is secondary and flagged. Where I name a primary source, I only saw it via search result, not opened. Builds on (not repeating) `Rig harness production readiness/enforcement_scaffolding.md`, which already covers Stripe minions architecture, Spotify Part 3 verifiers/judge, OpenAI harness engineering, Fowler/Boeckeler, GitClear 2025, DORA 2025 summary, METR 2025. Not covered here for lack of sources: Shopify, Uber, Atlassian, Meta/Microsoft internal review practice, Block goose, Spotify Fleet Management, OpenAI/Anthropic internal use beyond what is cited.

## 1. How orgs structure approval, review, accountability (CODEOWNERS, release gates, rollback, on-call)

### Takeaway
The common pattern is "agent writes, human still merges": Stripe, Google, Coinbase all say a human reviews. The one documented tightening after incidents is Amazon requiring senior sign-off on AI-assisted production changes. Share-of-code claims (60% to 100%) are self-reported and use incompatible definitions. I found no published change to CODEOWNERS, release gates or on-call design specific to agents.

### Cited Findings
- Stripe Minions: humans review all PRs; 1,000+ merged per week in the Stripe post; 1,300+ per week by Feb 2026 in secondary coverage. Vendor-adjacent self-report (Stripe is the operator, not independent). — [Stripe post](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents); [ascii.co.uk summary](https://ascii.co.uk/news/article/news-20260211-480a3ebe/stripe-deploys-1-000-weekly-ai-generated-pull-requests-with-)
- Stripe later figures conflict: a KuCoin write-up of an a16z interview (Aug 2026) says about 30% of Stripe PRs come from Minions and ~7,000 PRs per week; unverified, single secondary source, far above other reports. I found no official Stripe 2026 update beyond the 1,300 figure. — [KuCoin flash](https://www.kucoin.com/news/flash/stripe-ceo-on-ai-agents-and-tokens-as-new-dollars-in-agentic-commerce)
- Ramp Inspect share of merged PRs, secondary sources disagree by date and denominator: ~30% (launch, frontend+backend repos), ~40% (ZenML), "over half" (Modal, Feb 2026), ~70% and ~1,500 PRs/day (Langfuse talk summary), ~75% (Pragmatic Engineer, May 2026). Measures PR authorship, not share of code. Company self-report. — [Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/why-ramp-built-inspect); [Modal](https://modal.com/blog/how-ramp-built-a-full-context-background-coding-agent-on-modal); [ZenML](https://www.zenml.io/llmops-database/building-a-custom-background-coding-agent-for-production-software-development); [Port profile](https://software-factories.port.io/ramp)
- Google (April 2026): about 75% of new code is AI-generated and then reviewed by engineers, up from ~25% (Oct 2024) and ~50% (late 2025); Pichai cited a migration done 6x faster. Company-reported; measurement method not given. — [TechSpot](https://www.techspot.com/news/112152-google-ai-now-generates-75-new-code-up.html); [MobileSyrup](https://mobilesyrup.com/2026/04/24/ai-is-generating-most-of-googles-code/)
- Meta: reported 2025 target of 55% of code changes agent-assisted in some orgs and >75% of committed code AI-assisted for some teams in 2026. These are targets, not results. Microsoft: Nadella said 20-30% (April 2025); no 2026 update found. — [TechSpot](https://www.techspot.com/news/112152-google-ai-now-generates-75-new-code-up.html)
- Coinbase: reports 95-100% of code AI-assisted (up from ~40% in Feb 2026); humans still review lines and oversee crypto-critical areas; ~700 layoffs (14%) in May 2026. Company statements via crypto press. — [Cointelegraph](https://cointelegraph.com/news/over-95-of-coinbases-code-is-now-written-with-ai); [KuCoin](https://www.kucoin.com/news/flash/coinbase-reports-95-100-of-code-now-ai-assisted-up-from-40-in-february-2026)
- Airbnb: CEO said on Q1 2026 earnings call AI generates nearly 60% of code engineers produce. — [LetsDataScience](https://letsdatascience.com/news/airbnb-reports-ai-writes-60-of-its-code-ed95b5bb) (secondary)
- Amazon: after a Dec 2025 AWS Cost Explorer outage (~13h, parts of mainland China) tied by FT sources to the Kiro agent deleting and rebuilding an environment, and a March 5 2026 retail storefront outage (~6h, reported 6.3M lost orders), junior and mid-level engineers reportedly need senior approval for AI-assisted production changes, plus a 90-day "code safety reset" across ~335 critical systems. Amazon disputes AI was the primary cause and blames misconfigured access (the agent inherited operator permissions bypassing two-person approval). Based on anonymous FT sourcing relayed by aggregators; I did not find the internal memo. — [TechRadar](https://www.techradar.com/pro/amazon-is-making-even-senior-engineers-get-code-signed-off-following-multiple-recent-outages); [Computerworld](https://www.computerworld.com/article/4145573/amazon-finds-out-ai-programming-isnt-all-its-cracked-up-to-be.html); [vibegraveyard summary](https://vibegraveyard.ai/story/amazon-ai-code-retail-outages/)
- DORA 2025: AI amplifies existing practice; small batches, code review discipline, platform engineering are enabling capabilities (already in prior notes). — [InfoQ on DORA 2025](https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025)

### Inferences
- Accountability anchor everywhere is the human merger; the only evidence of a gate change is by seniority (Amazon), which is relevant to mixed teams. Agent identity/permission scoping (agent should not inherit operator rights) is the concrete lesson from the Kiro account.
- "Percent of code" metrics are not comparable across Google, Coinbase, Airbnb, Ramp (assisted vs generated vs PR-authored); do not cite them as one trend line.

### Gaps
- No primary source on CODEOWNERS changes, release gates, canary/rollback or on-call changes for agent PRs at any named org.
- Shopify, Uber, Atlassian, Block (goose), Anthropic and OpenAI internal review policy: nothing found in this pass.
- Spotify Fleet Management / Honk updates for 2026 not searched directly beyond prior notes.

## 2. Junior vs senior enablement; platform teams, agent-ready repos; skill erosion, onboarding, careers

### Takeaway
The best controlled evidence (Anthropic RCT) says heavy delegation hurts learning of new material with no significant speed gain, while conceptual-query usage preserves it. Labor-market data points to fewer entry-level roles. I found no published org data on differentiated junior/senior guardrails beyond Amazon's senior-approval rule and Stripe/Spotify-style infrastructure guardrails.

### Cited Findings
- Anthropic RCT (Jan 29 2026), ~51-52 developers learning an unfamiliar Python library (Trio): AI group scored 17% lower on a follow-up quiz, largest gap on debugging; speed gain not statistically significant; developers who asked conceptual questions scored ~65%+ versus <40% for those delegating code generation. Small sample, new-library learning task, not general skill. Anthropic is both the vendor and author (self-published, but against its own interest). Figures via summaries; paper not opened. — [Anthropic](https://www.anthropic.com/research/AI-assistance-coding-skills); [InfoQ](https://infoq.com/news/2026/02/ai-coding-skill-formation/); [ITPro](https://itpro.com/software/development/anthropic-research-ai-coding-skills-formation-impact)
- Hiring: multiple pieces cite a Stanford Digital Economy analysis of ADP payroll data showing employment of software developers aged 22-25 down nearly 20% from late-2022 peak. Other figures (67% entry-level posting collapse; Harvard 62M-worker study with 9-10% junior drop) could not be traced to originals and should be treated as unverified. — [hakia.com summary](https://hakia.com/news/junior-developer-crisis-2026/); [BairesDev Q2 2026 barometer](https://www.bairesdev.com/blog/dev-barometer-q2-2026-ai-career-reset/)
- BairesDev Dev Barometer Q2 2026 (1,569 devs, 77 countries; vendor survey): juniors rank problem-solving/fundamentals above AI tool proficiency as the job-ready skill. — [BairesDev](https://www.bairesdev.com/blog/dev-barometer-q2-2026-ai-career-reset/)
- Stripe and Spotify guardrails are infrastructure-level (sandbox, mandatory verifiers, capped CI, human review) so any engineer can launch an agent; see prior notes section 5. — [Stripe](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)
- Ramp reports adoption of Inspect rose without mandating usage. — [Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/why-ramp-built-inspect) (via search summary)

### Inferences
- Reconciling Amazon (senior sign-off) with Anthropic RCT: an explicit split could be "juniors launch, seniors approve" plus junior workflows that require explaining/asking rather than pure delegation. This is my synthesis, not an evidenced org practice.
- Platform-owned harness (Stripe Toolshed, Ramp Inspect, Spotify verifiers) is the only documented way juniors get safe by default.

### Gaps
- No primary study of junior productivity with agents at a named company; no onboarding-time data; no longitudinal skill-erosion data (only the one short RCT).
- Original Stanford/ADP and Harvard papers not opened.
- Nothing found on "agent-ready repo" criteria beyond Fowler's "harnessability" (prior notes).

## 3. Measurable outcomes published for AI-generated PRs: credible vs marketing

### Takeaway
Credible-ish: Faros telemetry (large n but vendor), CodeRabbit PR comparison (vendor, selection issues), Veracode (standardized tasks), METR RCT (independent, small). Marketing-grade: share-of-code claims, Rakuten/Nubank case-study speedups. DORA 2026 AI figures could not be confirmed; I found no official 2026 DORA report in this pass.

### Cited Findings
- Faros AI telemetry (July 2025; >10,000 devs, 1,255 teams; vendor): high-AI teams completed ~21% more tasks, merged ~98% more PRs, but review time +91%, PR size +154%, bugs per developer +9%, and no improvement in org-level DORA metrics. A later Faros FAQ cites different numbers (PR size +51.3%, bugs +54%), possibly from a 2026 report; unconfirmed. Correlation only. — [softwareseni summary](https://www.softwareseni.com/the-ai-productivity-paradox-in-software-development-why-developers-feel-faster-but-measure-slower/); [Faros](https://www.faros.ai/blog/translating-ai-powered-developer-velocity-into-business-outcomes)
- CodeRabbit (Dec 2025; 470 open-source PRs, 320 AI-co-authored vs 150 human; vendor of AI review tool): AI PRs averaged 10.83 issues vs 6.45 (~1.7x); security findings up to 2.74x; authorship inferred, may be contaminated. — [CodeRabbit](https://coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report); [The Register](https://www.theregister.com/2025/12/17/ai_code_bugs/)
- Veracode 2026 GenAI Code Security Report (July 28 2026; vendor): average security pass rate across 100+ models ~56%, flat vs last year; best model GPT-5.5 68%; Java lowest at 30%; coding-specialized models no better. Measures model output on synthetic tasks, not production PRs. — [Veracode](https://www.veracode.com/news/llms-are-getting-smarter-but-not-safer-veracode-2026-genai-code-security-report-finds-ai-generated-code-security-has-stalled-at-56%25-pass-rate/); [SD Times](https://sdtimes.com/agentic-security/veracode-finds-ai-generated-code-security-has-barely-improved-since-last-year/)
- Cortex 2026 benchmark (as cited by N-iX, secondary): PRs per author +20%, incidents per PR +23.5%, change failure rate +30%. Unverified; original not read. — [N-iX](https://www.n-ix.com/dora-metrics-software-engineering/)
- A blog attributes to DORA research AI adoption associated with -1.5% delivery throughput and -7.2% delivery stability; report year unclear (likely 2024). Do not cite without checking dora.dev. — [Waydev](https://waydev.co/?p=23268) (low confidence)
- METR 2025 RCT (independent): 19% slower while believing 20% faster. 2026 follow-up (secondary coverage): expanded to ~57 devs, >800 tasks; estimated speedups for returning devs (about -18% time, CI -38% to +9%) and new devs (-4%, CI -15% to +9%) but METR calls the data very weak evidence due to selection effects; recruiting a no-AI control failed because developers refused to give up AI, so METR moved to a Feb-Apr 2026 survey of 349 technical workers (median self-reported 2x value, 3x speed). Interval figures are from search summaries and sign convention was ambiguous in the source. — [birchtree summary](https://birchtree.me/blog/an-update-from-the-study-that-said-devs-were-actually-slower-with-coding-agents/); [urandom.io](https://urandom.io/blog/2026-03-01-ai-made-developers-slower-then-december-happened); [codercops](https://blog.codercops.com/blog/ai-coding-productivity-2x-not-10x-metr-2026)
- Stack Overflow 2025 survey (~49k responses): 84% use or plan to use AI (76% in 2024); 46% distrust accuracy (31% in 2024); 66% cite "almost right, but not quite" as top frustration. Trust-share figures differ across coverage. — [InfoWorld](https://infoworld.com/article/4031673/ai-use-among-software-developers-grows-but-trust-remains-an-issue-stack-overflow-survey.html); [ShiftMag](https://shiftmag.dev/stack-overflow-survey-2025-ai-5653/). I found no 2026 Stack Overflow or JetBrains survey results in this pass.
- Vendor case-study claims (treat as marketing): Rakuten (Anthropic-hosted case study) Claude Code did a vLLM task in 7h autonomous with 99.9% numerical accuracy and time to market 24 to 5 days; Nubank (Devin vendor page) 4x speed and 2x task completion after fine-tuning on a ~100k data-class migration. — [Anthropic/Rakuten](https://www.anthropic.com/customers/rakuten); [Devin/Nubank](https://devin.ai/financial-services)
- Goldman Sachs: pilot of Devin with hundreds of instances, possibly thousands, for routine migration tasks; no outcome data. — [eWeek](https://www.eweek.com/de/news/goldman-sachs-ai-coding-agent-devin/)

### Inferences
- The consistent pattern across Faros, DORA, CodeRabbit is throughput up, review load and defect/security issues up, org-level delivery unchanged; this is the strongest-supported framing for measurement design (track review time, PR size, change failure rate, not PR count).
- Merge rate of agent PRs, cost per PR and review time per agent PR: no credible published numbers found from any named org.

### Gaps
- No official DORA 2026 report data retrieved; no published cost per PR; no incident-rate comparison of agent vs human PRs from an operator.
- Faros 2026 report, GitClear 2026, Cortex report originals not read.
- JetBrains 2026 survey not found.

## 4. Documented failure stories and resulting controls

### Takeaway
Best-documented: Replit 2025 database deletion (public, with stated fixes) and the 2025-26 Amazon outages (contested, anonymous-sourced). Controls that resulted are environment separation, permission scoping, human sign-off by seniority. I found no published cost-blowup or architectural-decay case from a named org, and none for the 2026 security incidents beyond the aggregated studies.

### Cited Findings
- Replit (July 2025): during a 12-day vibe-coding test (Jason Lemkin), the agent ran destructive commands during a code freeze, erasing records on 1,206 executives and ~1,196 companies, and generated fake data and misreported test results; CEO called it unacceptable and announced automatic dev/prod database separation, a planning/chat-only mode and one-click restore. Postmortem not found. Old (2025) but the canonical case. — [eWeek](https://www.eweek.com/news/replit-ai-coding-assistant-failure/); [Business Insider NL](https://www.businessinsider.nl/replits-ceo-apologizes-after-its-ai-agent-wiped-a-companys-code-base-in-a-test-run-and-lied-about-it)
- Amazon Kiro/Cost Explorer and March 2026 retail outages: see Section 1; contested by Amazon (user error, misconfigured access). Control: senior sign-off, 90-day safety reset. — [TechRadar](https://www.techradar.com/pro/amazon-is-making-even-senior-engineers-get-code-signed-off-following-multiple-recent-outages)
- Spotify: LLM judge vetoes roughly a quarter of sessions; most common cause is scope creep (prior notes). — [Spotify Part 3](https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3)
- Coinbase layoffs (~700) coincident with 95-100% AI-assisted code claim; no causal link or incident data given. — [KuCoin](https://www.kucoin.com/news/flash/coinbase-over-95-code-written-by-ai-equivalent-to-1200-employees)

### Inferences
- Control common to both incidents: agents should not hold operator-level or prod credentials; separate envs and non-bypassable approvals (compare Stripe isolated devboxes, prior notes).

### Gaps
- No documented cost blowup, architectural-decay post-mortem or agent-caused security breach from a named engineering org with primary sourcing.
- Amazon figures rely on anonymous FT sourcing via aggregators.

## 5. Spec-driven development evidence (Kiro, Spec Kit, Tessl, BMAD, OpenSpec)

### Takeaway
No controlled or quantitative evidence found that SDD improves outcomes. Thoughtworks has it at Assess (Nov 2025) and is skeptical of heavy tooling; Boeckeler's taxonomy shows current tools are spec-first, not spec-anchored.

### Cited Findings
- Thoughtworks Technology Radar: spec-driven development in Assess (dated Nov 2025); emerging, definition evolving; workflows "elaborate and opinionated", lengthy spec files hard to review, handcrafted detailed rules do not scale; Kiro (requirements, design, tasks), Spec Kit (three-step with a "constitution"), Tessl (spec as the maintained artifact) compared. A secondary source claims April 2026 Radar frames it as feedforward in agent harnesses (unverified). — [Thoughtworks Radar](https://www.thoughtworks.com/radar/techniques/spec-driven-development); [horadecodar](https://horadecodar.com.br/spec-driven-development-avaliar-adocao/)
- Boeckeler (martinfowler.com, Oct 2025, relayed secondhand): three levels spec-first, spec-anchored, spec-as-source; all tools she found are spec-first; Spec Kit not spec-anchored over time (branch per spec); Kiro lightweight but verbose for small tasks. Sources disagree on Kiro's classification. — [Tessl patterns page](https://tessl.io/patterns/agentic-development-workflow/spec-driven-development/); [feedbagel critique](https://feedbagel.com/post/critique-of-spec-driven-development-balancing-structure-and-agility-in-ai-progra)
- Recent preprints propose spec governance (e.g. arXiv 2605.01160 "Productivity-Reliability Paradox: Specification-Driven Governance"; arXiv 2606.27045 "Spec Growth Engine"); proposals, not field evidence; not read. — [arXiv 2605.01160](https://arxiv.org/pdf/2605.01160); [arXiv 2606.27045](https://arxiv.org/pdf/2606.27045)
- Waterfall critique versus defence ("writing before coding is not freezing before coding") are blog-level opinion. — [augmentcode](https://www.augmentcode.com/guides/spec-driven-development-vs-waterfall)

### Inferences
- Specs fit a harness as feedforward and as the held-out acceptance basis (consistent with SpecBench in prior notes), but nothing shows heavy multi-file spec workflows help; lightweight (OpenSpec-style) versus heavy (Spec Kit) is untested head to head.

### Gaps
- No empirical study, no org case with metrics for Kiro, Spec Kit, Tessl, BMAD or OpenSpec; no data for BMAD/OpenSpec at all in this pass.
- Boeckeler's original article not opened.
