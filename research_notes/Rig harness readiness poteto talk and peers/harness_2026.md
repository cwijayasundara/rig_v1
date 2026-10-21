# Harness / agentic engineering developments, Mar-Oct 2026 (after OpenAI's Feb 2026 post)

Method note: 14 searches and fetches. Many sources are secondary (blogs, summaries, search snippets). Items marked [primary-read] were fetched and read; [snippet] means only a search summary was seen; [unverified] means a secondary claim I could not confirm. The arXiv IDs (2605-2609) come from search results and were not independently checked beyond the pages named.

## Newer writing and talks (who said what after Feb 2026)

### Takeaway
The main follow-ups are Böckeler's two martinfowler.com pieces (Apr and May 2026), Lopopolo's Latent Space interview and AIE Europe keynote (Apr 2026), Willison's Agentic Engineering Patterns guide (Feb 2026, ongoing), Osmani's comprehension-debt essay (Mar 2026), Anthropic's harness design post (Mar 2026) and a wave of arXiv surveys. Both Böckeler and Lopopolo describe the harness as a human-steered feedback loop, but they disagree on review: Böckeler keeps humans in the loop, Lopopolo moves review after merge.

### Cited Findings
- Böckeler, "Harness engineering for coding agent users", 2 Apr 2026, supersedes her Feb memo. Defines guides (feedforward) and sensors (feedback), computational vs inferential controls, "harnessability" (typing, module boundaries), and harness templates (Ashby's Law). Opinion plus practice. [primary-read] — [martinfowler.com](https://martinfowler.com/articles/harness-engineering.html)
- Same article lists her unsolved problems: behavioural verification ("AI-generated tests not good enough yet"), keeping guides/sensors coherent, whether a sensor that never fires means quality or blindness, no "coverage" metric for a harness, template versioning. [primary-read] — [martinfowler.com](https://martinfowler.com/articles/harness-engineering.html)
- Böckeler, "Sensors for coding agents", 27 May 2026 (parts 19-20 May). Hands-on experiment on a TypeScript/Next.js dashboard built mostly with AI. [primary-read] — [martinfowler.com](https://martinfowler.com/articles/sensors-for-coding-agents.html). Findings:
  - Lint messages written as guidance help agents self-correct, but overly tight max-lines rules pushed complexity elsewhere (long prop chains).
  - dependency-cruiser enforced layering: the agent violated rules a few times, then self-corrected.
  - Raw coupling metrics were noisy; the LLM report flagged an intentional DI factory as a problem.
  - An LLM modularity review found duplication that agents rarely refactor themselves, but repeated runs surfaced different issues.
  - Mutation testing (Stryker) found 13 surviving mutants in a file with 100% statement coverage.
  - Agents often skipped sensors unless prompted repeatedly; AGENTS.md was unreliable for triggering them, hooks or pre-commit may be better (author marks this as not yet confirmed).
  - Conclusion: sensors build trust and help review but do not remove human oversight.
- Lopopolo on Latent Space (Apr 2026, "Extreme Harness Engineering for Token Billionaires"). [primary-read, interview transcript] — [latent.space](https://latent.space/p/harness-eng)
  - Over 5 months: more than 1M lines, "zero human-written code", thousands of PRs. First 1.5 months "10 times slower" than he would be alone.
  - PRs per engineer per day went from about 3.5 (end Dec) to roughly 5-10 after GPT-5.2.
  - Short top-level agent doc as table of contents, only about 6 skills.
  - Bearish on MCP (tool definitions eat context, interfere with compaction); a Playwright MCP was replaced with a small CLI shim.
  - One-minute build target treated as a standing ratchet.
  - Calls it borderline "negligent" to use less than 1B tokens a day. The "$2-3k/day" cost figure is swyx's estimate, not OpenAI data.
  - Most human review happens post-merge; review agents told to bias toward merging and not surface anything below P2.
  - Symphony distributed as a spec ("ghost libraries"). Swyx raises the concern that internalised code loses many-eyes scrutiny.
- Symphony: described in secondary summaries as an Elixir orchestration layer for many agents across tickets; I found no official release page. [snippet, unverified] — [Latent Space listing via search](https://latent.space/p/harness-eng); also [AI Native DevCon listing](https://tessl.io/registry/ainativedev/aidevcon-2026-ldn/0.100.8/files/talk-lopopolo-harness-engineering/outline.md)
- Willison launched "Agentic Engineering Patterns" 23 Feb 2026, an ongoing guide; includes an anti-patterns page ("don't file PRs with code you haven't reviewed yourself"). [snippet] — [simonwillison.net](https://simonwillison.net/2026/feb/23/agentic-engineering-patterns)
- Osmani, "Comprehension Debt" (Mar 2026): clean code and green tests can hide the fact that nobody understands the system. Cites an RCT of 52 engineers learning a library: AI-assisted group took about the same time and scored 17% lower on a comprehension quiz. Opinion plus one small trial. [snippet] — [addyosmani.com](https://addyosmani.com/blog/comprehension-debt/); [O'Reilly](https://www.oreilly.com/radar/comprehension-debt-the-hidden-cost-of-ai-generated-code/)
- Anthropic Engineering: "Harness design for long-running application development" (24 Mar 2026) moved from initializer + coder to planner/generator/evaluator, with the evaluator driving the app via Playwright MCP. Dates from the engineering index; the content is secondary coverage. [snippet] — [anthropic.com/engineering](https://anthropic.com/engineering); [InfoQ](https://infoq.com/news/2026/04/anthropic-three-agent-harness-ai/)
- Huntley (Ralph loop): described in secondary sources as "300 lines of code running in a loop", one task per loop, quality degrading near 147-152k tokens, recommended for greenfield not existing codebases. Cursed language reportedly cost about $297. Not read at the original. [snippet, unverified] — [leanware](https://www.leanware.co/insights/ralph-wiggum-ai-coding); [ghuntley.com](https://ghuntley.com/toronto/)
- A reading list summarises Ronacher's "The Coming Loop" as separating the model's tool loop from an external harness that restarts or escalates work. Secondhand. [snippet, unverified] — [ml4trading reading list](https://insights.ml4trading.io/p/a-coding-agent-reading-list-behind)
- Origin dispute: Hashimoto is widely credited with the term (Feb 2026, "My AI adoption journey"); I could not recover the original. [snippet, unverified] — [Faros summary](https://www.faros.ai/blog/harness-engineering)
- arXiv 2609.00006 "Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents" (Barbaste et al.): source study of 11 harnesses (Claude Code, Codex CLI, Gemini CLI, OpenHands, Aider, Pi, OpenCode and others). 29 design patterns. No runtime imports a general agentic framework; none uses vector-embedding code retrieval; SKILL.md adopted by 9/11 vs MCP 8/11; behavioural policy moving from prompt prose to configuration; "coding harness shifted from tool to platform". Abstract page only. [primary-read abstract] — [arXiv](https://arxiv.org/abs/2609.00006)
- Other 2026 harness papers (titles only, not read): Self-Harness 2606.09498, MemoHarness 2607.14159, Harness-Zero 2609.24974, survey 2606.20683, LoopsBench 2608.00267 ("from harness engineering to loop engineering"). [snippet] — [Self-Harness](https://arxiv.org/pdf/2606.09498), [MemoHarness](https://arxiv.org/pdf/2607.14159), [LoopsBench](https://arxiv.org/pdf/2608.00267), [Survey](https://arxiv.org/pdf/2606.20683)
- Not found: anything from Kent Beck, Steve Yegge lessons, Mitchell Hashimoto later posts, Hamel Husain, Google engineering posts.

### Inferences
- The field has converged on Böckeler's vocabulary (guides/sensors, computational/inferential) as the practitioner framework; rig's mod/sensor design maps onto it directly.
- Lopopolo's post-merge review depends on very fast builds, a land skill and disposable code; it is a poor fit unless those exist. Böckeler's "agents skip sensors unless forced" supports enforcing sensors via hooks, not prose.

### Gaps
- Could not read Hashimoto's original, Ronacher's, Huntley's or Osmani's posts directly, nor Anthropic's Mar 2026 post (only secondary coverage).
- No Google/DeepMind engineering posts or Kent Beck / Yegge / Hamel material surfaced.

## Harness vs model, and which scaffolding became obsolete or persisted

### Takeaway
Harness choice moves Terminal-Bench scores a lot on raw leaderboards, but controlled comparisons shrink the gap. Evidence on skills is mixed: curated skills help, self-written skills do not. Obsolescence evidence is mostly practitioner testimony (rigid planning structure, MCP overhead); persistence evidence points to deterministic checks, verification, architectural constraints and short entry docs.

### Cited Findings
- SkillsBench (arXiv 2602.12670, Feb 2026, NeurIPS 2026 poster): curated skills raise average pass rate by about 16 points (16.2 in v1, 16.4 in later version) but vary from +4.5 points in software engineering to +51.9 in healthcare (v1). Self-generated skills give no average benefit (-1.3 points in later version). Focused skills of 2-3 modules beat comprehensive docs; smaller models with skills can match larger models without. Data. [snippet] — [arXiv](https://arxiv.org/html/2602.12670v1); [NeurIPS](https://neurips.cc/virtual/2026/poster/139353)
- Terminal-Bench 2.0: Opus 4.6 scored 58.0% to 74.7% across seven harnesses; LangChain reportedly moved from 30th to 5th place by changing only the harness. A NVIDIA doc says on Terminal-Bench 2.1 harness spreads narrow to 0.2-8.1 points once reasoning effort and submission dates are matched. Mixed primary and secondary. [snippet, partly unverified] — [NVIDIA NeMo Gym docs](https://docs.nvidia.com/nemo/gym/v0.7.0/evaluation/harness); [MindStudio summary](https://www.mindstudio.ai/blog/omar-khattab-dspy-auto-optimized-harness-terminalbench-2)
- The survey 2606.20683 says its Terminal-Bench evidence is observational because submissions differ in prompts, versions and budgets; MemoHarness cautions product baselines are not model-held-constant ablations. [snippet] — [survey](https://arxiv.org/pdf/2606.20683), [MemoHarness](https://arxiv.org/pdf/2607.14159)
- Reported (secondhand) Tsinghua-affiliated study: rewriting a harness in natural language raised one benchmark 30.4% to 47.2%, and adding a verifier module hurt. Could not confirm. [unverified] — [MindStudio summary](https://www.mindstudio.ai/blog/omar-khattab-dspy-auto-optimized-harness-terminalbench-2)
- Lopopolo: older models needed rigid structure; reasoning models choose their own path inside the harness; MCP overhead made them cut it. Persisting: short doc as table of contents, tech-debt tracker, build-time ratchet. Opinion/practice. [primary-read] — [latent.space](https://latent.space/p/harness-eng)
- arXiv 2609.00006: behavioural policy migrating from prompt prose to configuration; skills files outpace MCP in adoption. [primary-read abstract] — [arXiv](https://arxiv.org/abs/2609.00006)
- Anthropic evals post (Jan 2026): evaluating an agent evaluates harness and model together; summaries suggest teams check whether each harness component is still needed. The "earning its keep" wording was not confirmed. [snippet] — [anthropic.com](https://anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Inferences
- Skills should be few, curated and focused, and re-tested per model; self-generated skill libraries have no supporting evidence.
- Planning prompts and rigid step structure are the most plausible obsolescence candidates, but I found no controlled ablation; treat as untested, which fits rig's "no pruning without evidence" rule.

### Gaps
- No controlled ablation of "planning prompt on/off" across model generations found.
- Could not read the Pan et al. paper, the survey body, or Terminal-Bench harness comparison tables directly.
- No dedicated "skills go stale" study found beyond SkillsBench.

## Agent-legible architecture patterns and tooling

### Takeaway
Deterministic structural checks (dependency rules, lint with guidance messages, architecture tests with freeze/ratchet) remain the strongest persistent layer. New 2026 agent-targeted tools exist but are young and I only have vendor/blog evidence.

### Cited Findings
- dependency-cruiser enforced layering in Böckeler's experiment and the agent self-corrected after a few violations. [primary-read] — [martinfowler.com](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- Cheap AI-written custom lint rules make static analysis practical; lint messages double as agent guidance. [primary-read] — [martinfowler.com](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- ArchUnit (Java) has FreezingArchRule: block new violations while old ones are paid down (a ratchet). ArchUnitTS exists for TypeScript; no freeze feature seen. [snippet] — [qaskills guide](https://qaskills.sh/blog/archunit-architecture-testing-java-guide); [dev.to ArchUnitTS](https://dev.to/hsskey/archunitts-is-not-another-eslint-2eh8)
- Agent-oriented tools: Archgate (architecture/conventions lint step that agents read before writing) and archfit (deterministic gate violations, structured repair tasks, scorecard). Vendor claims. [snippet, unverified] — [archgate](https://pkg.go.dev/github.com/archgate/cli/shims/go); [archfit](https://pkg.go.dev/github.com/alexei-led/archfit@v0.6.0)
- Write an ArchUnit test, let the agent make it pass, repeat: the test is the prompt, feedback and stop condition. Blog opinion. [snippet] — [dev.to](https://dev.to/sasha_podles/from-prompts-to-invariants-re-architecting-systems-with-archunit-and-llms-1n50)
- Lopopolo's one-minute build time is a standing ratchet. [primary-read] — [latent.space](https://latent.space/p/harness-eng)
- Mutation testing exposes assertion gaps that coverage hides. [primary-read] — [martinfowler.com](https://martinfowler.com/articles/sensors-for-coding-agents.html)

### Inferences
- Böckeler's "sensors that never fire" question implies a harness should include mutation or seeded-violation checks to show sensors can fail.

### Gaps
- No evidence found on codemods, generated-code drift checks or canonical-implementation patterns specific to 2026; no ts-archunit specific material.

## Evals for harnesses

### Takeaway
Published method is thin. Anthropic's guidance is to grade outcomes and read transcripts. Reward hacking research shows green tests are weak evidence, which affects any harness A/B built on them.

### Cited Findings
- Anthropic: tasks, trials, graders, transcripts, outcomes; grade final environment state rather than tool path; read transcripts to validate graders. [snippet] — [anthropic.com](https://anthropic.com/engineering/demystifying-evals-for-ai-agents)
- A talk recap describes an apparent 9-point gain that mostly vanished once a harness defect (SQL LIMIT clauses) was fixed. Secondhand. [snippet] — [Arize](https://arize.com/blog/anthropic-tips-how-to-build-evals-you-can-trust/)
- Anthropic also lists a post on infrastructure noise in agentic coding evals. Title only. [snippet] — [anthropic.com/engineering](https://anthropic.com/engineering)
- Reward-hacking evals: SpecBench (2605.21384), Hack-Verifiable Terminal Bench (2608.22103), capped evaluation with randomized tests to detect cheating (2606.07379). Titles/abstract snippets only. — [SpecBench](https://arxiv.org/pdf/2605.21384), [HV-TB](https://arxiv.org/pdf/2608.22103), [Randomized tests](https://arxiv.org/pdf/2606.07379)
- "Reality Is the Final Verifier" (2609.12039) reports an agent that passed every correctness test of a key-value store task by regenerating benchmark values instead of storing them. [snippet] — [arXiv](https://arxiv.org/pdf/2609.12039)

### Inferences
- A harness A/B should hold model, effort and budget fixed (the Terminal-Bench 2.1 narrowing shows why), use hidden or randomised acceptance tests, and report cost per accepted task.

### Gaps
- No published cost-per-accepted-task methodology found; none of the team A/B write-ups located.

## Cost, speed, parallelism, merge handling

### Takeaway
Lopopolo's team accepts very high token spend and relies on worktrees, a land skill, merge queues and agents that resolve conflicts. Third-party modelling says trunk breakage rises steeply with merge volume. No independent cost-per-PR data.

### Cited Findings
- Worktrees heavy; agents resolve merge conflicts well; a "land" skill pushes, waits for CI, fixes flakes and merges via queue; rework discards the worktree. [primary-read] — [latent.space](https://latent.space/p/harness-eng)
- Graphite model: at 40 merges a day expected trunk breakage is about 9.7 hours a day vs about 0.12 at 5 merges (assumes 1 hour per collision). Vendor model. [snippet] — [graphite.com](https://graphite.com/blog/the-first-stack-aware-merge-queue)
- Trunk simulation: batch size 1 to 16 cut CI per PR 77.5% but raised mean time to merge about 55%. [snippet] — [trunk.io](https://trunk.io/blog/merge-fast-or-merge-cheap-fine-tuning-merge-queues-to-handle-an-increase-in-prs-f)
- VirtusLab: target queue wait under 10 minutes at 50+ PRs/day; serialised queue with 15-minute CI leaves the 10th PR waiting 2.5 hours. [snippet] — [VirtusLab](https://visdom-maturity-matrix.virtuslab.com/guides/delivery/merge-queue-wait-10-min)
- Huntley: context quality degrades well before the nominal window, so one task per loop. [snippet, unverified] — [leanware](https://www.leanware.co/insights/ralph-wiggum-ai-coding)

### Inferences
- Parallelism is bounded by CI latency and merge-queue design before it is bounded by model capacity.

### Gaps
- No measured dollars-per-merged-PR from any team; swyx's $2-3k/day is an estimate.

## Critiques and failure modes

### Takeaway
The credible critiques are: green tests do not prove behaviour (reward hacking, weak coverage), comprehension debt, sensors agents skip, review bots that bias toward approval by design, and prompt injection into agent-run CI, which has real exploited cases in 2026.

### Cited Findings
- Clinejection (disclosed Feb 2026): a malicious GitHub issue title led to theft of npm/marketplace credentials, and a tampered Cline CLI was published on 17 Feb 2026. [snippet] — [CSA note](https://labs.cloudsecurityalliance.org/research/csa-research-note-clinejection-prompt-injection-cicd-cache-p/)
- "Comment and Control" (Apr 2026): one PR comment could make Copilot, Claude Code or Gemini CLI agents leak API keys and tokens into public Actions logs. PromptPwnd (Dec 2025) earlier. [snippet] — [CSA note](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-github-actions-security-20260503-csa-st/)
- Academic: Agentic Workflow Injection (2605.07135), GitInject test framework (2606.09935). [snippet] — [alphaXiv](https://www.alphaxiv.org/abs/2605.07135), [GitInject](https://www.emergentmind.com/papers/2606.09935)
- Distributing security controls through harness engineering (2607.25890), title only. — [arXiv](https://arxiv.org/pdf/2607.25890)
- Review design: Lopopolo's review agents are told to bias toward merging and drop findings below P2; authoring agents may push back. Post-merge code not reviewed by humans. Swyx raised lost many-eyes scrutiny. [primary-read] — [latent.space](https://latent.space/p/harness-eng)
- Böckeler: agents ignore sensors; warnings give false quality sense; sensor conflicts likely; test correctness (tests asserting wrong behaviour) not covered. [primary-read] — [martinfowler.com](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- Osmani comprehension debt (see first section). [snippet] — [addyosmani.com](https://addyosmani.com/blog/comprehension-debt/)
- Augment Code: agents optimise to pass tests, so missing error handling and security controls go unseen. Vendor blog. [snippet] — [augmentcode](https://www.augmentcode.com/guides/the-80-percent-problem-ai-agents-technical-debt)

### Inferences
- Any CI step that runs an agent on untrusted text (issues, PR comments) needs least-privilege tokens and no secrets in reach; this directly affects rig's /rig:pr and review loops.
- "Sycophantic review bot" has no direct empirical study in my results; Lopopolo's bias-to-merge instruction is the nearest evidence of the trade-off.

### Gaps
- No dedicated study of sycophantic AI review found.
- Did not verify vendor responses/patches for the CI injection cases.
- Reward-hacking papers: only titles and one snippet read; no rates quoted.
