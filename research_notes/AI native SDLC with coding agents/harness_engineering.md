# Harness Engineering for AI Coding Agents (2025-2026)

Research date: 2026-11-07. Sources were read through WebFetch or WebSearch snippets as noted. Several primary pages could not be fetched; those claims are marked **[secondary]**. Fetch results were summarized by a small model, so exact quotes are marked as such and should be re-checked against the original page before publication. Diagram descriptions below come from text summaries of the figures, not from viewing the images.

## Vocabulary and core definition

### Takeaway
"Harness" means everything around the model that turns it into an agent. In 2026 practitioners converged on "Agent = Model + Harness", and "harness engineering" is the discipline of designing guides (feedforward), sensors (feedback), and the loop that connects them. Martin Fowler's and Birgitta Böckeler's articles are the most structured treatment found.

### Cited Findings
- Böckeler cites a broad usage where a harness is everything in an agent "except the model itself," then narrows the term to the user's outer harness built on top of the agent's built-in harness. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html) (published 2 April 2026, Birgitta Böckeler, Thoughtworks; supersedes her February 2026 memo)
- Guides are controls that anticipate agent behaviour and steer it before it acts. Sensors are controls that observe after the agent acts and help it self-correct. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Sensors are most useful when their output is written for LLM consumption, such as linter messages that include fix instructions. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Sensors are a "mechanism for feedback" so the agent "can self-correct." Guides are instructions such as markdown files, AGENTS.md sections, or skills. — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html) (published 27 May 2026, Böckeler)
- Addy Osmani's formulation, attributed to Viv Trivedy: "Agent = Model + Harness. If you're not the model, you're the harness." — [Osmani, Agent harness engineering](http://addyosmani.com/blog/agent-harness-engineering/) (19 April 2026)
- The shorthand "Agent = Model + Harness" is credited to Mitchell Hashimoto in one secondary source. — [learnagentic](https://learnagentic.substack.com/p/what-is-harness-engineering) **[secondary]** This conflicts with Osmani's attribution to Viv Trivedy. See Gaps.
- Hashimoto popularised the term in early 2026. His 5 February 2026 post "My AI Adoption Journey" lists harness engineering as stage five of six. Some sources say he did not coin the term. — [star-history](https://www.star-history.com/blog/harness) **[secondary]**; [developertoolkit](https://developertoolkit.ai/pl/glossary/harness-engineering/) **[secondary]**
- Hashimoto's practice: when an agent errs, build a permanent fix such as a check or script so the mistake does not recur. — [star-history](https://www.star-history.com/blog/harness) **[secondary]**
- Osmani lists components of a harness: system prompts, CLAUDE.md/AGENTS.md, skill files, subagent prompts; tools, skills, MCP servers and their descriptions; infrastructure (filesystem, sandbox, browser); orchestration (subagent spawning, handoffs, model routing); hooks and middleware (compaction, continuation, lint checks); observability (logs, traces, cost and latency metering). — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- OpenAI's own definition: harness "encodes scaffolding, feedback loops, documentation, and architectural constraints into machine-readable artifacts." — [InfoQ, 21 Feb 2026, Leela Kumili](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex) **[secondary; OpenAI primary returned HTTP 403]**
- Context engineering asks "what should the agent see?" Harness engineering asks "what should the system prevent, measure, and correct?" — [Zby commonplace summary of OpenAI post](https://zby.github.io/commonplace/sources/harness-engineering-leveraging-codex-agent-first-world) **[secondary]**

### Inferences
- The terms "harness" and "agent" are used loosely. In Fowler's usage the harness is the user-controlled layer; Osmani uses it to mean nearly everything except weights. Reports should state which sense they use.
- Practitioner vocabulary has settled on: guides/feedforward, sensors/feedback, computational/inferential, ratchet/permanent rules, context engineering, compaction, context reset, handoff file, sprint contract, hooks.

### Gaps
- Could not confirm whether Hashimoto or Viv Trivedy first wrote "Agent = Model + Harness". Hashimoto's original post was not fetched.
- The OpenAI primary post (https://openai.com/index/harness-engineering/) returned HTTP 403. All OpenAI claims are from secondary coverage.

## Böckeler / martinfowler.com: guides, sensors, taxonomy, and diagrams

### Takeaway
Fowler's two articles give the most precise vocabulary found: guides (feedforward) and sensors (feedback), each either computational (deterministic, cheap) or inferential (LLM-based, expensive, probabilistic). The first article adds three regulation categories. The second article adds four timing points for sensors.

### Cited Findings
- Feedback-only setups produce "an agent that keeps repeating the same mistakes." Feedforward-only setups produce rules that are never checked for effectiveness. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Computational controls are "deterministic and fast, run by the CPU": tests, linters, type checkers, structural analysis. Cheap enough to run on every change. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Inferential controls are semantic analysis, AI code review, or "LLM as judge." They are slower, more expensive, and "more non-deterministic," though useful with a strong model. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Computational sensors reliably catch duplication, complexity, coverage gaps, and architectural drift. LLM review can partly address redundant tests and over-engineering, but does so "expensively and probabilistically." — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Neither approach reliably catches misdiagnosed problems, overengineering, unnecessary features, or misunderstood instructions. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Relying on AI-generated tests for behaviour is "not good enough yet." Approved fixtures help in some areas. The behaviour harness is called "the elephant in the room" and is not yet solved. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Fowler's three regulation categories: (1) maintainability harness (internal code quality; easiest today), (2) architecture fitness harness (fitness functions, e.g. performance tests, logging standards), (3) behaviour harness (does the app do what is needed). — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- Humans supply implicit harness elements: convention knowledge, accountability, organisational context. A good harness should direct human input to where it matters most rather than eliminate it. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- The sensors article tags each sensor as computational or inferential. Computational examples: type checker, ESLint, Semgrep, dependency-cruiser, test results and coverage, incremental mutation testing, GitLeaks. Inferential examples: prompt-driven AI security review, data handling review, AI modularity review, AI dependency freshness report. AI-generated tests are "created in an inferential way" even though the test suite runs computationally. — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- Sensors run at four points: during the coding session (fast feedback), after integration in the pipeline, repeatedly on a schedule (for drift that "accumulates over time"), and at production runtime. — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- The article asks: "Once we feel confident in a set of sensors, what guides can we delete?" The author ran an example app with no guides to see the sensors' effect in isolation. — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- Dependency rules replace describing code structure in a markdown guide. Lint messages double as self-correction guidance. — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- Enterprises may use "harness templates" (service topologies such as CRUD service, data dashboard, event processor, each bundled with guides and sensors). Böckeler cites Ashby's Law: topologies reduce the variety a harness must cover. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)

### Diagram structure (from text summaries of the figures)
- **Harness article, Figure 1:** three concentric rings. The model is the core, the builder harness is the next ring, the user harness is the outermost ring. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- **Harness overview:** guides feed forward into the coding agent; sensors feed back into it; a human steers both. The most reusable diagram for a white paper. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- **Change lifecycle:** feedforward inputs (AGENTS.md, LSP) feed the agent's first generation. Feedback sensors run before integration, then human review, then the pipeline reruns them plus expensive checks such as mutation testing. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- **Continuous feedback:** sensors for codebase drift (dead code, dependency scanning) and runtime health (SLOs, AI judges sampling responses). — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- **Harness types:** guides and sensors across the top, the three regulation dimensions down the side. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- **Sensors article, Figure 2:** four phases on a path to production: coding session, pipeline, scheduled, production runtime. — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- **Sensors article, Figure 6 (sidecar):** a coding agent, a "sidecar" CLI, and the target codebase. The sidecar starts with `sensors start`, loads a config file listing sensors, and the agent queries status with `sensors check`. — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- **Sensors article, Figure 10:** the config lists lint and layers sensors, and each sensor type needs a parser (one labelled "default"). — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html)

### Inferences
- Fowler's two axes (guide vs sensor; computational vs inferential) plus the timing axis give a 2x2 plus lifecycle diagram suitable for a white paper.
- The sensors article implies a "balance" goal: sensors earn the right to remove guides. This is an open question in the article, not a stated result.

### Gaps
- The sensors article has no formal definition of a sensor and no named taxonomy beyond the two axes and timing points.
- Fowler's diagrams were described by a text summariser, not visually inspected.

## Addy Osmani: agent harness engineering

### Takeaway
Osmani frames the harness as the lever that matters more than the model: configuration and feedback loops, not model weights, usually explain agent failures. He lists harness components, failure modes, and named practices such as the "ratchet."

### Cited Findings
- A raw model becomes an agent once a harness adds state, tool execution, feedback loops, and constraints. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/) (19 April 2026)
- Failure modes listed: missing conventions, destructive commands, committed commented-out tests, losing track in long tasks (e.g. 40 steps), finishing broken code without verification, context rot, early stopping, poor decomposition, and self-evaluation skew (agents grade their own work too positively). — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- Named practice "Ratchet": every real mistake becomes a permanent rule. AGENTS.md lines should trace to a past failure. Osmani's summary: "Ratchet; don't brainstorm." — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- "Working backwards from behaviour": start from the desired behaviour and derive the harness piece that delivers it. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- Context techniques: compaction, offloading tool output to the filesystem, progressive disclosure of skills, full context resets from a hand-off file. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- "Ralph Loop": a hook intercepts exit attempts and re-injects the prompt into a fresh context, with state carried through files. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- Hooks provide deterministic enforcement, such as running tests after edits or blocking destructive commands. Principle: "success is silent, failures are verbose." — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- Keep AGENTS.md short: HumanLayer's file is under 60 lines. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- "A decent model with a great harness beats a great model with a bad harness." — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- Viv Trivedy's Terminal Bench result: changing only the harness moved a coding agent from Top 30 to Top 5. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/); see LangChain entry below for the matching result.
- Harness-as-a-Service (HaaS): building on runtimes that supply the loop, tools, context management and hooks. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- Harnesses shape post-training: models improve at the primitives harnesses use. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)

### Inferences
- Osmani's failure-mode list maps closely onto Anthropic's observed failures (one-shotting, premature completion), giving a shared vocabulary across sources.

### Gaps
- The Ratchet and Ralph Loop are reported by Osmani; no primary source for Ralph Loop was fetched. One secondary source notes third-party sites use the "Ralph Wiggum Loop" label inconsistently.

## Anthropic: harness design, long-running agents, context engineering, and agent patterns

### Takeaway
Anthropic's engineering posts describe the same loop from several angles: a planner, generator, and evaluator (2026); an initializer plus incremental coding agent with a progress file and git (Nov 2025); context as a finite resource managed through compaction, notes, and sub-agents (Sep 2025); and "the simplest solution possible" (Dec 2024).

### Cited Findings: "Harness design for long-running apps" (24 March 2026, Prithvi Rajasekaran)
- Architecture inspired by GANs: a generator paired with an evaluator, plus a planner for full-stack builds. — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Planner expands a 1-4 sentence prompt into a product spec, staying at product and high-level technical level "so spec errors don't cascade downstream." — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Evaluator uses Playwright MCP to click through the running app and grade against criteria. — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- A reset clears the context entirely and starts a fresh agent with a structured handoff. Compaction summarises in place and keeps the same agent, which can preserve "context anxiety." — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Sonnet 4.5 showed strong context anxiety, so V1 used resets. Opus 4.5 largely removed this, so V2 dropped resets and used automatic compaction in one session. — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Sprint contracts: before each sprint the generator proposes what it will build and how success will be verified; the evaluator reviews until both agree. Communication is through files. Sprint 3 had 27 criteria. V2 removed the sprint construct. — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Out of the box Claude was a poor QA agent: it found real issues, then talked itself into approving the work, and tested superficially. Tuning took several rounds of reading logs and updating the evaluator prompt. — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Frontend evaluator criteria: design quality, originality, craft, functionality (design and originality weighted higher). Full-stack evaluator: a hard threshold per criterion; failing any one fails the sprint. — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Cost data: solo retro game maker run, 20 min, $9, core mechanic broken. V1 full harness (Opus 4.5), 6 hr, $200, "over 20x more expensive but of clearly higher quality." DAW with V2 harness (Opus 4.6), 3 hr 50 min, $124.70 total (planner $0.46; build rounds $71.08, $36.89, $5.88; QA rounds $3.24, $3.09, $4.06). — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Limitations stated: the DAW is "far from a professional music production program"; "Claude can't actually hear"; the generator still stubbed features that QA did not catch; the evaluator missed subtle nested bugs; scores plateaued; evaluator is "inclined to be generous towards LLM-generated outputs." — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- Self-evaluation "reliably skew[s] positive when grading their own work." Simplicity guidance: "find the simplest solution possible, and only increase complexity when needed." — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)
- "The space of interesting harness combinations doesn't shrink as models improve." — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)

### Cited Findings: "Effective harnesses for long-running agents" (26 Nov 2025, Justin Young)
- Core problem: sessions start with no memory of earlier ones. Compaction alone was not enough; Opus 4.5 with only a high-level prompt fell short of a production-quality web app. — [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Initializer agent (first session) creates an init.sh script, a progress file, and an initial git commit. It differs from the coding agent only in its initial prompt. — [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Coding agent makes incremental progress on one feature per session and leaves a "clean state" mergeable to main. — [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Feature list: JSON with over 200 end-to-end features, each initially failing. JSON was chosen because the model is less likely to change it inappropriately than Markdown. Agents may only change the `passes` field. — [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Failure modes and fixes: one-shotting (fix: incremental work), premature completion (fix: feature list), broken starting state (fix: init.sh and end-to-end check each session), untested features marked done after unit tests or curl (fix: browser automation, test as a human user). — [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Browser testing "dramatically improved performance," but alert modals were invisible to the Puppeteer MCP. — [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Consistent progress across context windows "remains an open problem." — [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### Cited Findings: "Effective context engineering for AI agents" (29 Sep 2025, Applied AI team)
- Definition: context engineering is "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference." — [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Context rot: recall accuracy falls as the window fills. "Context, therefore, must be treated as a finite resource with diminishing marginal returns." — [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Goal: "find the smallest set of high-signal tokens that maximize the likelihood of your desired outcome." — [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Compaction, structured note-taking (NOTES.md, to-do lists outside the window), sub-agent architectures (sub-agents return condensed summaries of roughly 1,000-2,000 tokens), and just-in-time retrieval via identifiers such as file paths and queries. — [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### Cited Findings: "Building effective agents" (19 Dec 2024, Erik S. and Barry Zhang, per fetched page)
- Workflows: LLMs and tools orchestrated through predefined code paths. Agents: LLMs dynamically direct their own processes and tool usage — "just LLMs using tools based on environmental feedback in a loop." — [Anthropic building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Five composable patterns: prompt chaining (with gates), routing, parallelization (sectioning and voting), orchestrator-workers, evaluator-optimizer. — [Anthropic building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Treat tool design (agent-computer interface) with the same care as prompt design. Require absolute file paths: this removed an error class from SWE-bench work. Use poka-yoke (mistake-proofing). — [Anthropic building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Core principles: simplicity, transparency (show planning steps), careful ACI design. Reduce framework abstraction in production because it can obscure prompts and responses. — [Anthropic building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

### Inferences
- Anthropic's evolution is informative: the 2026 post removes the sprint construct and resets once the model no longer needed them, so harness components encode assumptions about current model limits and should be re-tested as models change (Anthropic's own phrasing: "every component in a harness encodes an assumption about what the model can't do on its own" — quoted by Osmani, [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)).
- The evaluator-in-the-loop pattern in the 2026 post is an instance of the evaluator-optimizer workflow from the 2024 post.

### Gaps
- The Anthropic posts cover web-app and DAW examples; generalisation to other domains is stated as future work in the Nov 2025 post.

## OpenAI, LangChain, HumanLayer, and other practitioners

### Takeaway
OpenAI's Codex team (February 2026) described an internal experiment in which engineers designed environments and feedback loops and agents wrote the code. LangChain showed that changing only the harness improved a fixed model's Terminal Bench 2.0 score. HumanLayer's 12-Factor Agents supplies the earliest explicit "own your context window" framing.

### Cited Findings: OpenAI "Harness engineering: Leveraging Codex in an Agent-First World" (11 Feb 2026; attributed to Ryan Lopopolo)
- The primary post was not fetched (HTTP 403). Secondary coverage says: an internal beta with roughly one million lines of code over five months, no manually written source code, a small team. — [InfoQ](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex) **[secondary]**; [Zby summary](https://zby.github.io/commonplace/sources/harness-engineering-leveraging-codex-agent-first-world) **[secondary]**
- Architecture is "mechanically enforced with linters and CI validation." Dependencies flow Types → Config → Repo → Service → Runtime → UI, with structural tests. — [InfoQ](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex) **[secondary]**
- Lint error messages inject remediation instructions into the agent's context. Combined AGENTS.md size was capped at 32 KiB. — [Zby summary](https://zby.github.io/commonplace/sources/harness-engineering-leveraging-codex-agent-first-world) **[secondary]**
- One secondary source reports about 20% of weekly engineering time spent on "AI slop" cleanup; this is an aggregator figure and unverified. — [Zby summary](https://zby.github.io/commonplace/sources/harness-engineering-leveraging-codex-agent-first-world) **[secondary, unverified]**
- InfoQ found no AGENTS.md size or repo file-count figures in its article. — [InfoQ](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex) **[secondary]**

### Cited Findings: LangChain "Improving Deep Agents with harness engineering" (17 Feb 2026, author not listed)
- Definition: "refining systems around a fixed model," specifically gpt-5.2-codex. — [LangChain via PlushCap](https://www.plushcap.com/content/langchain/blog/langchain-improving-deep-agents-with-harness-engineering) **[secondary mirror]**
- Harness levers: system prompts, tools, middleware; automated trace analysis; self-verification; context delivery; testable code; compute management; preventing unproductive loops. — [LangChain via PlushCap](https://www.plushcap.com/content/langchain/blog/langchain-improving-deep-agents-with-harness-engineering) **[secondary mirror]**
- Terminal Bench 2.0: 52.8% to 66.5%, by changing only the harness. — [LangChain via PlushCap](https://www.plushcap.com/content/langchain/blog/langchain-improving-deep-agents-with-harness-engineering) **[secondary mirror]**; a third-party repost describes this as "Top 30 to Top 5" — [Hightower blog](https://rick-hightower.blogspot.com/2026/03/langchains-harness-engineering-from-top.html) **[secondary]**
- Deep Agents is described as "an agent harness": LangGraph is the runtime, LangChain the framework, Deep Agents the harness built on the core agent plus middleware (post dated 6 Aug 2026 per search snippet, by Sydney Runkle). — [LangChain deep agents vs LangChain vs LangGraph](https://langchain.com/blog/deep-agents-vs-langchain-vs-langgraph) **[snippet only; not fetched]**; [PlushCap overview](https://www.plushcap.com/content/langchain/blog/langchain-agent-frameworks-runtimes-and-harnesses-oh-my) **[secondary]**
- A third-party review describes Deep Agents as bundling filesystem tools, context compression, subagents, memory, and approvals, and notes it "does not create a security boundary by itself." — [wavect review](https://wavect.io/blog/langchain-deep-agents-review.md) **[secondary]**

### Cited Findings: HumanLayer "12-Factor Agents" (Dex Horthy)
- Twelve factors, exact titles: 1 Natural Language to Tool Calls; 2 Own your prompts; 3 Own your context window; 4 Tools are just structured outputs; 5 Unify execution state and business state; 6 Launch/Pause/Resume with simple APIs; 7 Contact humans with tool calls; 8 Own your control flow; 9 Compact Errors into Context Window; 10 Small, Focused Agents; 11 Trigger from anywhere, meet users where they are; 12 Make your agent a stateless reducer. Honourable mention: 13 Pre-fetch all the context you might need. — [12-factor-agents repo](https://github.com/humanlayer/12-factor-agents)
- The repo page's factor 3 text was not returned, only its title. Dex's talk says the "Context Engineering" term "blew up in June" (2025) and that the 12-factor diagram predates it (April 2025). — [12-factor search summary](https://home.mlops.community/public/videos/12-factor-agents-patterns-of-reliable-llm-applications-dexter-horthy-agents-in-production-2025-2025-08-06) **[secondary]**
- Osmani quotes HumanLayer's view: "it's not a model problem. It's a configuration problem." — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)

### Inferences
- Across OpenAI, LangChain, and Anthropic the same moves recur: encode rules as machine-readable checks, trace failures, verify with tests, and keep the model fixed while the harness changes. The benchmark gains attributed to harness changes (LangChain, Viv Trivedy) are the strongest quantitative evidence for the claim that harness matters.

### Gaps
- OpenAI primary and LangChain primary were not fetched. The 66.5% figure is from a mirror.
- No independent replication of the Terminal Bench harness results was found.

## Key mechanisms

### Takeaway
A working harness combines context management (what the model sees), guides (AGENTS.md, skills, prompts), sensors (linters, tests, judges, hooks), structure (sub-agents, handoffs, files), and permissions. Each mechanism below is tied to a source.

### Cited Findings
- **Context engineering:** the curated token set for each inference. — [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents); 12-factor factor 3 — [12-factor repo](https://github.com/humanlayer/12-factor-agents)
- **AGENTS.md / CLAUDE.md:** standing guides; short, ratcheted, each line tied to a past failure. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/); size cap of 32 KiB — [Zby summary of OpenAI](https://zby.github.io/commonplace/sources/harness-engineering-leveraging-codex-agent-first-world) **[secondary]**
- **Hooks:** deterministic enforcement; run tests after edits or block destructive commands; success silent, failures verbose. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/)
- **Skills:** progressive disclosure of instructions loaded only when relevant. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/); guides in Fowler's sense — [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- **Subagents:** isolated clean context windows, returning condensed summaries of about 1,000-2,000 tokens. — [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Permission models:** Not covered in depth by any fetched source. Osmani lists destructive commands as a failure to block via hooks. — [Osmani](http://addyosmani.com/blog/agent-harness-engineering/); LangChain's review says Deep Agents' approvals "does not create a security boundary by itself." — [wavect review](https://wavect.io/blog/langchain-deep-agents-review.md) **[secondary]**
- **Compaction:** summarises in place, keeps architectural decisions and unresolved bugs, drops redundant tool output. — [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Memory / state:** progress file plus git history; feature list in JSON; hand-off file for resets. — [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- **Tool design:** tools deserve prompt-level care; absolute paths; poka-yoke; enough tokens to think. — [Anthropic building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- **Linters and type checks as sensors:** computational sensors with fix instructions in messages. — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html); architecture enforcement via CI and structural tests — [InfoQ](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex) **[secondary]**
- **LLM-as-judge:** inferential sensor; the evaluator in Anthropic's design, tuned with few-shot examples and hard thresholds. — [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps); Fowler's caution — [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html)
- **Orchestration / routing:** Anthropic's five workflow patterns. — [Anthropic building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

### Inferences
- Guides and sensors form a loop: each recurring sensor failure should be turned into a guide or a computational check (the ratchet). This is the practical core of "harness engineering" as used by these authors.

### Gaps
- Few fetched sources give concrete permission-model designs (allowlists, sandboxes, approval tiers). Claude Code hooks/permissions were not researched against official docs in this pass.
- Simon Willison's blog and Latent Space were not searched in this pass (budget). They were suggested sources.

## Known failure modes and what harnesses address

### Takeaway
The recurring failure modes across sources are context rot and long-task drift, premature completion, unverified or self-graded success, repeated mistakes, and destructive or convention-breaking actions. Each has a named harness response.

### Cited Findings
| Failure mode | Harness response | Source |
|---|---|---|
| Context rot (recall falls as window fills) | compaction, resets, notes, sub-agents | [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| One-shotting / running out of context mid-feature | incremental one-feature sessions, clean state | [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| Premature completion / declaring done | feature list with passes field; sprint contracts defining "done" | [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents); [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps) |
| Self-evaluation skew / agent approves its own work | separate evaluator, tuned; hard thresholds | [Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps) |
| Untested features (unit tests or curl only) | end-to-end browser testing as a user would | [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| Repeating the same mistakes | ratchet: permanent rules and checks per failure | [Osmani](http://addyosmani.com/blog/agent-harness-engineering/); [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html) |
| Destructive commands, committed commented-out tests | hooks blocking actions | [Osmani](http://addyosmani.com/blog/agent-harness-engineering/) |
| Reward hacking / test deletion | feature list where agents may only flip `passes`; prompt warns against removing or editing tests | [Anthropic effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| Drift over time (dead code, dependency rot) | scheduled sensors | [Fowler sensors article](https://martinfowler.com/articles/sensors-for-coding-agents.html) |
| Misunderstood goals, overengineering | not solved by sensors; human specification required | [Fowler harness article](https://martinfowler.com/articles/harness-engineering.html) |
| Loops / unproductive repetition | prevent unproductive loops (harness middleware) | [LangChain via PlushCap](https://www.plushcap.com/content/langchain/blog/langchain-improving-deep-agents-with-harness-engineering) **[secondary mirror]** |

Reward hacking is named explicitly only through the "passes field" and "do not remove tests" guardrails; no fetched source documents a specific reward-hacking incident by name.

### Inferences
- The failure-mode list is consistent across Anthropic, Osmani, and Fowler, but the evidence is mostly anecdotal (single demos, practitioner posts). No controlled study was found.

### Gaps
- No quantitative study comparing harness-on vs harness-off outcomes with independent replication was found, beyond the LangChain self-report and Anthropic's own cost/quality examples.
- "Drift" is discussed by Fowler and Osmani, but no fetched source gives a formal measurement method.

## Source index (date, author, status)

| Source | Date | Author | Status |
|---|---|---|---|
| [Fowler: Harness engineering](https://martinfowler.com/articles/harness-engineering.html) | 2 Apr 2026 | Birgitta Böckeler | read (summary) |
| [Fowler: Sensors for coding agents](https://martinfowler.com/articles/sensors-for-coding-agents.html) | 27 May 2026 | Birgitta Böckeler | read (summary) |
| [Osmani: Agent harness engineering](http://addyosmani.com/blog/agent-harness-engineering/) | 19 Apr 2026 | Addy Osmani | read (summary) |
| [Anthropic: Harness design for long-running apps](https://www.anthropic.com/research/harness-design-long-running-apps) | 24 Mar 2026 | Prithvi Rajasekaran | read (summary) |
| [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | 26 Nov 2025 | Justin Young | read (summary) |
| [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 29 Sep 2025 | Applied AI team | read (summary) |
| [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | 19 Dec 2024 | Erik S., Barry Zhang | read (summary) |
| [OpenAI: Harness engineering](https://openai.com/index/harness-engineering/) | 11 Feb 2026 | Ryan Lopopolo (per secondary) | **HTTP 403, not read**; secondary only |
| [InfoQ on OpenAI harness](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex) | 21 Feb 2026 | Leela Kumili | read (summary) |
| [LangChain: Improving Deep Agents with harness engineering](https://www.plushcap.com/content/langchain/blog/langchain-improving-deep-agents-with-harness-engineering) | 17 Feb 2026 | not listed | read via mirror |
| [LangChain: Deep agents vs LangChain vs LangGraph](https://langchain.com/blog/deep-agents-vs-langchain-vs-langgraph) | 6 Aug 2026 (per snippet) | Sydney Runkle (per snippet) | snippet only |
| [HumanLayer: 12-Factor Agents](https://github.com/humanlayer/12-factor-agents) | 2025 | Dex Horthy | titles only |
| [Star History: Harness](https://www.star-history.com/blog/harness) | 2026 | not listed | secondary, used for Hashimoto |

## Gaps (overall)
- Primary OpenAI post not accessible; all OpenAI facts are secondary.
- Hashimoto's Feb 2026 post not fetched; the coining and "Agent = Model + Harness" attribution conflict between sources (Osmani credits Viv Trivedy; learnagentic credits Hashimoto).
- Simon Willison and Latent Space not searched.
- Diagram descriptions are from text summaries; verify visually before reproducing.
- The "Top 30 to Top 5" claim appears in Osmani and a repost, while the LangChain mirror reports 52.8% to 66.5%. These are not contradictory (rank change vs score change) but the source for the rank figure is a repost.
