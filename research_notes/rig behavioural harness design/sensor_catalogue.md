# Sensor catalogue for coding agents (Fowler articles) and Node/TypeScript equivalents

Sources:
- [S1] Sensors for coding agents: https://martinfowler.com/articles/sensors-for-coding-agents.html
- [S2] Harness engineering: https://martinfowler.com/articles/harness-engineering.html
- [S3] Are harnesses worth the cost: https://martinfowler.com/articles/are-harnesses-worth-the-cost.html

Method note: the articles were read through WebFetch, which returns a model-generated summary. Verbatim quotes below were re-fetched with targeted prompts, but they are excerpts of the fetched text, not a diff against the live HTML. Anything marked **[Inference]** is not stated in the articles. Where a tool is Java-only in the article, the Node equivalent is an inference.

---

## 1. The sensor catalogue as S1 names it

S1 "Overview of all sensors used" lists sensors in three groups: during the coding session, repeatedly (drift), and after integration (pipeline). It lists no separate production sensors. Its wording: "in the pipeline, on a schedule, and in production" (Figure 2 caption), but no production sensors are enumerated.

| # | Sensor (name as S1 writes it) | Detects | Comp. / Inferential | Tool named in article | Cadence | Blocks / advises | Matching guide | Caveats (article) |
|---|---|---|---|---|---|---|---|---|
| 1 | Type checker | Type errors | Computational | Not named | In-session; again in CI ("The same computational sensors run again in CI.") | Not stated | Not stated; article says strongly typed languages get "type-checking as a sensor" [S2] | None stated |
| 2 | ESLint | File/function-level maintainability issues: max function args, file length, function length, cyclomatic complexity; `no-explicit-any`; `no-console`; team rules such as "requiring test files or structured logging" | Computational | ESLint, with a custom formatter and self-correction messages | In-session; again in CI | Not stated; messages carry self-correction guidance ("A sensor is meant to give the agent feedback so that it can self-correct.") | Custom lint messages act as the guide (S1 Basic linting) | "a false sense of security and an illusion of quality"; "feedback overload for the agent, sending it into a spiral of over-engineered refactorings"; each new rule set surfaced "a mix of irrelevant things and things that actually matter"; `max-lines` and `max-lines-per-function` "showed some signs of tension" (splitting pushed complexity into long property chains) |
| 3 | Semgrep ("SAST tool prescribed by our internal AppSec team") | Security issues | Computational | Semgrep | In-session; again in CI | Not stated | Not stated | None stated |
| 4 | dependency-cruiser ("runs structural rules to check internal module dependencies") | Layer violations (e.g. `clients` must never import `services`); every new file must sit in the predefined folder structure | Computational (S1 calls it deterministic) | dependency-cruiser; run as `npm run dep-cruiser` in S2 | In-session; again in CI | Not stated in S1; agent "self-corrected based on dependency-cruiser feedback" | Layer rules; S1 calls them "a useful replacement for describing code structure in a markdown guide" | "These tools only cover what imports, file names, and folder structure can express" (S2 paraphrase); "The agent violated the rules a handful of times after I introduced them" |
| 5 | Test suite results including test coverage | Behavioural regressions; coverage gaps | Computational (tests were AI-written, so their creation was inferential) | Not named (S2 shows `npm run coverage`) | In-session; again in CI | Not stated | Test conventions (no guide named) | "coverage tells us that a line was executed, but not that its impact was verified"; "Coverage is not a sufficient indicator of test effectiveness"; "acceptance tests increase coverage, but are often not very assertion-heavy" |
| 6 | Incremental mutation testing | Weak or missing assertions (mutants that survive) | Computational | Stryker (named in the test-suite section; the overview row says "Incremental mutation testing" without naming the tool) | S1 lists it under "during coding session" but says "In my setup I didn't run it continuously (like some of my other sensors), but triggered incremental runs manually." So effective cadence is on-demand. | Not stated | Not stated | "It is quite resource intensive."; used a Python helper to query Stryker's large JSON report so the agent's context was not overloaded (a helper script, not a sensor) |
| 7 | GitLeaks ("runs as part of the pre-commit hook") | Secrets in committed code | Computational | GitLeaks | Per commit (pre-commit) | Feedback on commit attempt: "as it will give the agent feedback when it tries to commit". Blocking is [Inference]: a failing hook stops the commit | Not stated | None stated |
| 8 | Security review ("prompt derived from our AppSec checklist for internal applications") | Security issues beyond SAST | Inferential (LLM review) | LLM (no tool named) | Repeatedly / drift (not per change) | Advises (a report) [Inference] | Prompt derived from AppSec checklist | None stated |
| 9 | Data handling review ("prompt describes things like..."; example: user names must never reach the web frontend) | Data-handling violations | Inferential (LLM review) | LLM | Repeatedly / drift | Advises [Inference] | Prompt | None stated |
| 10 | Dependency freshness report | Stale or inactive dependencies; upgrade and deprecation candidates | Both: a script gathers age and activity data, then AI writes the report | Custom script + LLM | Repeatedly / drift | Advises [Inference] | None stated | None stated |
| 11 | Modularity and coupling review | Modularity and coupling problems | Both: coupling CLI (computational) + LLM modularity pass (inferential) | Custom `coupling-analyser` CLI (built with the TypeScript compiler); Vlad Khononov's "Modularity Skills" run on Claude Opus 4.7 | Repeatedly / drift; S1 also suggests applying the modularity pass to changed files per commit but says "I did not explore this yet" | Advises (report) [Inference] | Modularity skills are the guide side | Coupling data: "I don't have the impression that this type of coupling data is useful to AI on its own"; legitimate hubs (factory acting as DI container, shared `zod` schema as "god module") need suppression; barrel `index.ts` finding was useful. Run LLM analyses more than once: "when it matters, it's often worth running an LLM-based analysis multiple times, to get a fuller picture" (second run found an issue the first missed) |

S1 also names two techniques it considered and did not use: property-based testing ($) and fuzz testing ($$). Its cost markers in the test-effectiveness toolbox are $ and $$.

### Tools and sensors named in S2 and S3 but not in S1's catalogue

| Name | Where | Kind | Article's use | Notes |
|---|---|---|---|---|
| ArchUnit | S2 (Structural tests row; "A pre-commit (or coding agent) hook running ArchUnit tests that check for violations of module boundaries") | Computational | Module-boundary structural test | Java library |
| Structural tests (generic) | S2 | Computational | "Mutation and structural testing are examples of computational feedback sensors" that were "underused in the past" and are "having a resurgence" | Generic category |
| Mutation testing (generic) | S2 | Computational | Monitor test quality | Generic |
| Semgrep | S2 (listed as a feedback sensor) | Computational | As S1 row 3 | |
| Coverage (`npm run coverage`) | S2 | Computational | Shown in change-lifecycle example | |
| Dead code detection | S2 (drift) | Computational | Drift sensor example | Tool not named |
| Dependency scanners / Dependabot | S2 (drift) | Computational | "Example of a dependency drift sensor" | Dependabot named |
| Code mods (OpenRewrite) | S2 | Feedforward (guide), not a sensor | "Code mod recipes as a feedforward guide" | Java tool |
| Language Servers / LSP | S2 | Computational feedforward guide | Named in table | |
| Specmatic | S3 | Computational behavioural sensor | "I implemented the behavioral harness using Specmatic"; contract checks "generated deterministically from supplied specifications"; "examples validate" command checked example payloads against the API spec; "equivalent contract-testing and service virtualization tools could provide the same capabilities" | Output: test results, CTRF reports, API coverage reports |
| LLM as judge | S2 | Inferential | "Semantic analysis, AI code review, 'LLM as judge'". Used for semantically duplicate code, redundant tests, over-engineered solutions. Caveat: "expensively and probabilistically. Not on every commit." | No specific setup described |
| Drift / health sensors | S2 | Computational + inferential | "Codebase drift" sensors run continuously (dead code, coverage quality, dependency scanners); runtime feedback (SLOs, log anomalies) | Runtime: article asks "What runtime feedback could agents be monitoring?" |

**jscpd and duplicate-code tools:** neither article names jscpd. S2 mentions "duplicate code" only generically ("Computational sensors catch the structural stuff reliably: duplicate code, cyclomatic complexity, missing test coverage"). jscpd is therefore an inference for the duplication sensor.

---

## 2. Computational vs inferential (S2 definitions)

- Computational: "deterministic and fast, run by the CPU. Tests, linters, type checkers, structural analysis."
- Inferential: "AI code review" and "LLM as judge", "typically run on a GPU or NPU. These are slower, costlier, and more non-deterministic" (paraphrase of S2).
- "Computational sensors are cheap and fast enough to run on every change, alongside the agent." (S2)
- "In spite of their non-determinism, inferential sensors can particularly increase our trust…" (S2)
- Guides vs sensors: "Guides (feedforward controls) - anticipate the agent's behaviour and aim to steer it before it acts." "Sensors (feedback controls) - observe after the agent acts and help it self-correct." (S2)

---

## 3. Guides as the article describes them

- S1: "a system of guides and sensors that increase the probability of good agent outputs."
- S1 on its own app: "There are hardly any guides (e.g. markdown files) for AI about code quality and maintainability present." And "I did not bother with guides at all in this application."
- S1 harness-guide options: "A skill, or a section in AGENTS.md that asks the agent to check the sensors regularly." Then "This is the easiest way, and this is what I mostly did. But, it is also quite unreliable."
- S1 global guidance: a prompt in the sensors config, e.g. "Follow scouting rule: ..." (the article calls it "a global guidance prompt").
- S1 lint guidance example: for `no-explicit-any`, the custom formatter tells the agent to "make a judgment call" and suppress with a reason if needed. The agent may "slightly increase" thresholds if refactoring is unnecessary or impossible, and the increase is not permanent.
- S1 dependency rules: "quite a useful replacement for describing code structure in a markdown guide."
- S1 sensor-parser skill: "This became quite easy once I created a skill for it".
- S2 guide examples in its table: "AGENTS.md, Skills". S2: "Context engineering provides us with the means to make guides and sensors available to the agent."
- S2 harness templates: "a bundle of guides and sensors that leash a coding agent to the structure, conventions and tech stack of a topology."
- S2 architecture harness: "Skills that describe coding conventions for better observability (like logging standards)…"
- CLAUDE.md is not mentioned in either article.
- Rules: S1 section "Rules for typical AI shortcomings"; "publish ESLint plugins with rule sets that are specifically targeting known agent failure modes".
- Examples: S1 "Here is an example of my guidance for the `no-explicit-any` warning."

**Each sensor should have a guide, and vice versa:** neither article states this. S1 asks "How do we keep guides and sensors consistent with each other" and "Once we feel confident in a set of sensors, what guides can we delete?" S2 asks "How do we keep a harness coherent as it grows, with guides and sensors in sync, not contradicting each other?" The one-to-one rule is an inference.

---

## 4. "Keeping guides and sensors in sync"

Neither article defines it operationally. What the articles give:

- S2 steering loop: "Whenever an issue happens multiple times, the feedforward and feedback controls should be improved." Also: "…the feedforward and feedback controls should be improved to make the issue less probable…"
- S2 open questions: "…when instructions and feedback signals point in different directions?" and "If sensors never fire, is that a sign of high quality or inadequate detection mechanisms?"
- S2: "We need a way to evaluate harness coverage and quality similar to what code coverage and mutation testing do for tests."
- S3 [the only concrete mechanism]: validation before testing. An "examples validate" command checks example payloads against the API spec before they are used as test data. Contract checks are generated from the spec, so guide (the spec and examples) and sensor (the contract tests) come from one source. The same sensors serve two purposes: "During development: Sensor results feed back to the agent as executable attention" and "At completion: Sensor results become the basis for accepting the work".

**Operational reading [Inference]:** treat each guide and each sensor as one versioned pair. When a rule changes, update its lint message or dependency-cruiser message and the AGENTS.md/skill text together. Retire a guide only after its sensor has been green for long enough to trust it (S1's "what guides can we delete?"). Track sensors that never fire, since silence could mean either good quality or weak detection (S2's open question). Keep the guide and the sensor's error message in one place, so they cannot contradict each other.

---

## 5. Cadence design: what the articles say, and a proposed split

### What the articles say

- S2 timing: "Before integration: linters, fast test suites, basic code review agent." "After integration (pipeline): rerun the fast controls plus more expensive ones, such as mutation testing and broader code review."
- S2: "Feedback sensors, including the new inferential ones, need to be distributed across the lifecycle accordingly."
- S2 drift: "What type of drift accumulates gradually and should be monitored by sensors running continuously…" (e.g. dead code detection, test coverage quality analysis, dependency scanners).
- S1 modularity pass: an "garbage collection" pass; the article suggests it could run on changed files per commit, but says "I did not explore this yet."

### Proposed design, grounded in the above

**In-session (on every agent edit or tool call, must be fast):**
- Type checker (article names none; the TypeScript compiler is the obvious tool).
- ESLint with custom rules and self-correction messages.
- dependency-cruiser layer rules.
- Fast unit test subset, if it runs in seconds [Inference: S2 says "fast test suites" belong here].

**Per commit (pre-commit hook; blocks):**
- GitLeaks, as S1 does.
- Optionally the in-session set again, since S1 says the same computational sensors run again in CI. [Inference: whether to re-run the full set per commit is not stated.]

**CI (on push or PR; blocks merge):**
- The same computational sensors again: type checker, ESLint, dependency-cruiser, full test suite with coverage.
- Semgrep (S1 runs it in-session and in CI; in CI it is the natural place for the full ruleset).
- Specmatic-style contract tests (S3 runs them in the inner loop; the article does not say where else).

**Slow / on demand (not per change):**
- Incremental mutation testing (Stryker): S1 ran it manually because it is "quite resource intensive". Good fit for a nightly job or a manual trigger [Inference].
- LLM-as-judge and semantic review: "expensively and probabilistically. Not on every commit" (S2). Good fit for a nightly or drift job.

**Nightly / drift (scheduled):**
- Security review and data handling review (LLM prompts from S1).
- Dependency freshness report (S1 script + LLM). Dependabot as an example (S2).
- Modularity and coupling review (S1), run more than once when it matters.
- Dead code detection and coverage-quality analysis (S2 drift examples).

### How sensor output reaches the agent (what the articles say)

- Custom lint messages with self-correction instructions (S1, S2). S2 calls this "custom linter messages that include instructions for the self-correction".
- dependency-cruiser messages that recap the layering concept (S1).
- Failing tests: "A failing test gives AI the opportunity to ask that very question": did I break something, or change behaviour on purpose? (S1)
- A token-efficient sidecar summary with trend against a snapshot ("Worse than / Same as snapshot"), direction, and threshold (S1).
- Hook after every file edit: "a good starting point", with the warning that it "could be distracting" [S1 suggestion, untested by the author].
- Git pre-commit hook: "a pre-commit hook can be a good way to force a sensors check to take place before code even gets into a commit" (S1).
- AGENTS.md or skill telling the agent to check sensors: easiest, "quite unreliable" (S1).
- S2 suggests "pre-push hooks that run relevant linters based on a heuristic" as a starting point.
- **Not discussed in either article:** hook exit codes and CI comments. Claims about them would be an inference.

---

## 6. Node/TypeScript equivalents

Mark: tools named in the articles keep their name. Anything else is an inference.

| Sensor | Node/TS tool | Status |
|---|---|---|
| Type checker | `tsc --noEmit` (incremental with `tsBuildInfoFile`) | Inference (article names none) |
| ESLint | `eslint` with core rules `max-params`, `max-lines`, `max-lines-per-function`, `complexity`, `no-console`; `@typescript-eslint/no-explicit-any`; custom formatter for self-correction text | Tool named; rule names are inference |
| Semgrep | `semgrep` CLI (language-agnostic) | Tool named |
| dependency-cruiser | `dependency-cruiser` (`depcruise`, JS/TS native) | Tool named |
| Layer / boundary rules (ArchUnit-style) | `dependency-cruiser` rules, or `eslint-plugin-boundaries` | Inference (ArchUnit is Java; article names only ArchUnit) |
| Test suite + coverage | `vitest --coverage` or `jest --coverage` | Inference |
| Mutation testing | `@stryker-mutator/core` with its TypeScript runner | Tool named (Stryker); Node package is inference |
| Secrets pre-commit | `gitleaks` binary, via `pre-commit` or husky | Tool named |
| Duplicate code | `jscpd` | Inference (no article names it) |
| Coupling analyser | TypeScript compiler API, as S1 built one | Article used TS compiler; the script is inference |
| Modularity skills | Vlad Khononov's "Modularity Skills" | Named in S1; Node-agnostic |
| Security / data review | LLM prompt run via Claude CLI or Agent SDK in a scheduled job | Inference |
| Dependency freshness | `npm outdated`, `npm audit`, or Dependabot | Dependabot named (S2); npm commands are inference |
| Contract tests | `Specmatic` (CLI or Docker), OpenAPI-based | Tool named (S3); Node integration is inference |
| LSP | TypeScript language server | Named as a class (S2) |
| Codemods (feedforward) | `jscodeshift` | Inference (OpenRewrite is named but is Java) |
| Helper for big JSON reports | short Node script that reads Stryker's JSON | Inference (S1 used Python) |

---

## 7. Caveats, collected

- False confidence: "a false sense of security and an illusion of quality" (S1, lint). Coverage "is not a sufficient indicator of test effectiveness" (S1). "coverage tells us that a line was executed, but not that its impact was verified" (S1).
- Feedback overload: "feedback overload for the agent, sending it into a spiral of over-engineered refactorings" (S1).
- Cost of inferential sensors: "expensively and probabilistically. Not on every commit" (S2). "Building a coherent system of guides and sensors and self-correction loops is expensive…" (S2).
- Non-determinism: "non-deterministic guides and sensors that are harder to test" (S2, Ashby's law section).
- Dependency tools only see imports, file names and folder structure (S1).
- Coupling data alone is not useful to AI: S1 suggests using it for risk triage in review, or to prioritise where a review agent spends tokens.
- "Correctness is outside any sensor's remit if the human didn't clearly specify what they wanted in the first place." (S2)
- Tests may test faulty behaviour: "a separate problem" that S1 does not address.
- Cost: "Mutation testing has a practical limitation of course: It is quite resource intensive." (S1)
- S3: "running sensors continuously during development provides executable attention" for models with inconsistent unaided results.

---

## 8. Gaps

- No article gives a full sensor-output format or exit-code convention. Hook exit codes and CI annotations are not covered.
- Neither article defines the one-guide-per-sensor rule.
- S1's "Overview" lists no production sensors, although the caption mentions production.
- The Stryker cadence is manual in S1's setup; no article gives a recommended schedule for it.
- Fetch limits: the primary articles were read through a summarising fetch. Verbatim quotes were checked with targeted re-fetches, but the full page text was not diffed. Re-check the exact wording before quoting in a published document.
