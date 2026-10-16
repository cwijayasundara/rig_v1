# Martin Fowler harness articles: what they prescribe

Sources were read via WebFetch (a small model extracted the content), so quotes are as extracted. Two of the three articles were re-checked with a second fetch (article 3 only). Inferences are marked.

Important correction to the brief: the "are harnesses worth the cost" article does NOT compare Haiku and Opus. Its main experiment uses two OpenAI models (GPT-6 Sol and GPT-6 Luna). Claude Sonnet 4.6 and Opus 4.6 appear only in exploratory runs, and Claude Haiku is not named at all. No line counts are given for the harness.

## Article 1: Harness engineering for coding agent users

URL: https://martinfowler.com/articles/harness-engineering.html

### Definition
- A harness is, in general, "shorthand to mean everything in an AI agent except the model itself." The article narrows this to coding agents and to a user harness that lets users "build an outer harness specifically for our use case and system."
- The article calls the harness a specific form of context engineering: "Engineering a user harness for a coding agent is a specific form of context engineering."
- The harness acts "like a cybernetic governor" that regulates the codebase toward a desired state.
- The sidebar "Metaphors only go so far" admits that wrapping harnesses around harnesses is an imperfect image.

### Parts
- **Guides (feedforward):** "anticipate the agent's behaviour and aim to steer it _before_ it acts."
- **Sensors (feedback):** "observe _after_ the agent acts and help it self-correct."
- Feedback-only harnesses yield an agent that "keeps repeating the same mistakes." Feedforward-only harnesses never learn "whether they worked."
- **Computational:** "deterministic and fast, run by the CPU."
- **Inferential:** semantic analysis, AI code review, "LLM as judge," with results that are "more non-deterministic."
- **Regulation categories:** maintainability, architecture fitness (fitness functions), and behaviour harnesses.
- **Ambient affordances:** "structural properties of the environment itself that make it legible, navigable, and tractable to agents." This is the basis of "harnessability."
- The human's job is to "steer" the agent by iterating on the harness.

### Concrete components it names
- Feedforward guides: AGENTS.md, skills, coding conventions, bootstrap instructions, code mods, reference docs, how-tos, language servers (LSP), MCP servers for team knowledge.
- Computational sensors: linters, type checkers, fast test suites, structural tests (e.g. ArchUnit), pre-commit or agent hooks, static analysis, dependency-cruiser, mutation testing, logs, browser checks.
- Inferential sensors: AI code review agents, review skills (e.g. `/architecture-review`), LLM-as-judge response sampling.
- Timing layers ("Keep quality left"): fast controls before commit or integration, expensive ones after integration, human review as an additional sensor.
- Continuous drift and health sensors: dead-code detection, coverage-quality analysis, dependency scanners, SLO monitoring, log-anomaly judges.
- Harness templates: bundles of guides and sensors tied to a service topology.

### What to keep out
- No explicit exclusion list. Closest statements:
  - Sensors cannot reliably catch "misdiagnosis of issues, overengineering and unnecessary features, misunderstood instructions." "Correctness is outside any sensor's remit" if the human did not specify what they wanted.
  - Inferential checks should not run "on every commit" given their cost.
  - A good harness "should not necessarily aim to fully eliminate human input," but should direct it to where it matters most.

### Quantitative findings
- Essentially none. "cover 80% of what they need" is an informal estimate about enterprise service topologies, not a study.

### Warnings
- Cost: building the outer harness is expensive, so teams "have to prioritise." Inferential controls are "more expensive"; LLM judgment is applied "expensively and probabilistically."
- Test trust: relying on AI-generated test suites "puts a lot of faith into the AI-generated tests, that's not good enough yet."
- Coherence: guides and sensors must stay "in sync, not contradicting each other" as the harness grows.
- Silent sensors: unclear whether a sensor that never fires means high quality or inadequate detection.
- Templates face "the same versioning and contribution problems" as service templates; instances "start fall out of sync with upstream improvements."
- "the harness is most needed where it is hardest to build" (legacy codebases).
- The article frames the harness as "an ongoing engineering practice, not a one-time configuration." It does not explicitly warn against over-engineering.

## Article 2: Sensors for coding agents

URL: https://martinfowler.com/articles/sensors-for-coding-agents.html

### Definition
- A system of guides and sensors "that increase the probability of good agent outputs."
- "A sensor is meant to give the agent feedback so that it can self-correct."
- No formal glossary entry. Computational vs inferential is used as a label and never formally defined.

### Examples given
- Computational: type checker, ESLint, Semgrep ("SAST tool prescribed by our internal AppSec team"), structural tests, coverage, mutation testing (cost marker "$$"), coverage ("$").
- Inferential: "A security review, prompt derived from our AppSec checklist for internal applications." The AI-generated test suite is described as "created in an inferential way."
- Mixed: a dependency freshness report ("computational and inferential").

### Where sensors run
- "Sensors that run continuously alongside the agent to provide fast feedback" (during the coding session).
- "The same computational sensors run again in CI" (after integration).
- "Sensors that run on a slower cadence to detect drift that accumulates over time."

### How many, cost, latency
- No recommended number of sensors is given.
- "Naturally, the more of these sensors we want to run, the more resources they are going to need."
- Mutation testing: "It is quite resource intensive." The author ran it manually, not continuously.
- Inference (mine): the cost guidance is directional only. Sensors are tiered by cadence and cost, not capped by count.

### Keep out / simplify
- Not addressed directly. Related: "Once we feel confident in a set of sensors, what guides can we delete?" and a preference "to keep the tool itself simpler" when pushing customisation into user-built parsers.

### Quantitative findings
- Mappers file had "100% statement coverage and 75% branch coverage" yet Stryker "reported 13 survivors."
- One date-range change required the AI to modify "over 40" files.
- A Semgrep sensor "spikes up to 9 violations" mid-session, then returns to 0 (Figure 11 caption).
- Coupling-data analysis "probably also used less time and tokens than if the agent had scanned the codebase itself."

### Warnings
- "I worry about feedback overload for the agent, sending it into a spiral of over-engineered refactorings."
- Linting may create "a false sense of security and an illusion of quality."
- "Coverage is not a sufficient indicator of test effectiveness."
- Sensors "are not a magical solution to take the human totally out of the loop."
- Conflicts between sensors may emerge.
- Relying on guidance alone to trigger sensor checks is "also quite unreliable."
- Sensor runs can strain hardware (the author's laptop fan ran hard on TypeScript sensors).

## Article 3: Are harnesses worth the cost?

URL: https://martinfowler.com/articles/are-harnesses-worth-the-cost.html
Author: Naresh Jain (Specmatic). Dated 13 October 2026. Part of the "Exploring Gen AI" series.

### Experiment setup
- Models in the main experiment, both run through Codex at low reasoning effort:
  - GPT-6 Sol, positioned by OpenAI as a flagship for complex work (frontier tier).
  - GPT-6 Luna, optimized for cost-sensitive, high-volume work, "roughly corresponds to the nano tier in earlier GPT-5 families."
- Exploratory runs only (low reasoning effort): Claude Sonnet 4.6, Claude Opus 4.6, Gemini 3.8 Flash. Each "managed to complete the task unassisted on the first try." No metrics are given for these.
- Design: 10 paired runs per model, with and without harness, each in an isolated Docker container with a fresh Codex home.
- Task: a greenfield backend-for-frontend (BFF) for product discovery in Java. It exposes an HTTP API, validates requests and downstream responses, calls an Order API, and publishes the first search result to Kafka.
- Evaluation: 178 automated acceptance tests run by an independent evaluator the harness never saw. Acceptance = successful start and all 178 passing.

### The harness
- OpenAPI specs (BFF and Order API), AsyncAPI spec (Kafka).
- Request-response examples covering timeouts, malformed payloads, filter violations, retries, Kafka confirmations.
- An API-development skill with implementation and diagnosis guidance.
- Sensors: contract conformance checks, API tests, CTRF reports, API coverage reports.
- An `examples validate` command checking example payloads against specs.
- Contract-driven dependency mocks (HTTP and Kafka) and timing-verification helpers.
- Helper scripts and configuration tools. Implemented with Specmatic; "equivalent tools could work."
- The harness did not run after each edit. The agent invoked it through the project's test command.
- No line count or component count is given. The harness is full, not thin. The article does not test a thin harness.

### Results (10-run averages, from the article's table; confirmed on second fetch)

| Model | Harness | Tokens | Time | Est. cost | Accepted |
|---|---|---|---|---|---|
| GPT-6 Sol | Yes | 11,331,970 | 19 min 53 s | ~$2.679 | 10/10 |
| GPT-6 Sol | No | 1,076,371 | 6 min 51 s | ~$0.406 | 10/10 |
| GPT-6 Luna | Yes | 22,933,648 | 35 min | ~$0.273 | 10/10 |
| GPT-6 Luna | No | 5,860,736 | 15 min 56 s | ~$0.086 | 3/10 |

- Sol with harness: about 10.5x tokens and about 7x cost vs Sol without, with no change in acceptance (both 10/10).
- Luna with harness vs Sol without: $0.273 vs $0.406, about 33% cheaper, and both reach 10/10 acceptance. This is the article's closest analogue to "a smaller model matches a larger one," and it is measured against the full harness.
- Luna without harness: 3/10 accepted, though it "passed 94.8% of functional checks on average."
- Adding the harness to Luna: about +17,072,912 tokens, +19 min 4 s, about +$0.187 per attempt.
- Luna's unharnessed failures clustered in the deferred-creation workflow (timeouts returned 503/400/429 instead of 202), missing monitor links, Kafka contract violations (extra `__TypeId__` header, `"categories": null`), exact error-contract misses (415 instead of 400), and a config mismatch (`ORDER_API_API_KEY` vs `ORDER_API_KEY`).
- Setup cost of authoring and maintaining contracts and examples was not measured and is excluded from the figures.

### Conclusions
- "My original assumption was too blunt. A behavioral harness is not an automatic win for every model on every task."
- "What changes with model capability is not whether independent sensors are needed, but when they run."
- Cost-optimized models: run sensors "continuously during development," which "provides executable attention."
- Frontier models: run the same checks "once as an independent final acceptance gate." The author plans to test this.
- "the harness did not unlock a capability Luna lacked; it turned a 3-in-10 baseline into 10-for-10 reliability."
- "The checks can enforce only the expectations humans encode."

### Limits the author states
- One greenfield Java service, one unusually detailed brief, low reasoning effort only.
- Guides and sensors were added together, so their separate contributions are unknown.
- Not tested on legacy code, other languages, other reasoning settings, vague briefs, or open-weights models.
- Sample is small; does not establish long-run failure rates.

### Over-engineering
- Not discussed as a term. Closest: the proposed "final gate only" mode for frontier models.

### Inferences (mine, not the article's)
- The article's model-tier claim is about cadence, not necessity: a cheap model benefits from continuous sensors; a frontier model may need only a final gate. This supports a thin-by-default, sensors-scaled-to-model stance, but the article does not say a thin harness suffices.
- For a team that relies on Claude models, the article's data does not transfer directly. Claude Haiku was not tested; Claude models were only sampled once in exploratory runs.

## Cross-article summary
- All three agree that feedback sensors and feedforward guides are complementary, and that sensors should be tiered by cost and cadence (fast and continuous vs slow or final gate).
- None of them gives a numeric cap on sensors or harness size, and none gives a line-count benchmark.
- Warnings recur: false confidence from coverage or AI-written tests, sensor conflicts, guide/sensor drift, feedback overload, and the setup/maintenance cost that the cost study excluded.
