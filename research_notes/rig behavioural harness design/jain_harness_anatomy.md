# Anatomy of the behavioural harness in "Are Harnesses Worth the Cost?" (Fowler)

Source-quality caveat: the article and its application-brief sub-page were read through a summarising fetch tool, not as raw HTML. Verbatim text beyond short phrases could not be retrieved. Every quote below is short, and the rest is paraphrase. The article names its author as "the author"; the attribution to Naresh Jain comes from the request and was not confirmed by the fetched text. Specmatic's own docs did not return CLI syntax, so the Specmatic command lines are not verified. Files named in the harness are not published in the article; the only concrete artifact located is the public Specmatic sample repo (see section 7).

## 1. Article structure (section headings, in order)

1. Title: "Are Harnesses Worth the Cost?"
2. Experiment setup
3. The application brief
4. The inner loop: behavioral harness
5. Keeping guides and sensors in sync
6. The outer loop: evaluation harness
7. Testing a cost-optimized model
8. What went better than expected
9. Where unharnessed runs slipped up
10. The harness as executable attention
11. The economics of consistent outcomes
12. The boundaries of this experiment
13. What this means in practice
14. Conclusion
15. Acknowledgements

Sub-pages and links found: the application brief (`are-harnesses-worth-the-cost/application-brief.html`); the "Exploring Gen AI" series index; Birgitta Böckeler's "Harness engineering for coding agent users"; Giles Edwards-Alexander's "The Economic Benefit of Refactoring"; Specmatic (specmatic.io); GPT-6 Sol and GPT-6 Luna model pages; the previous article "An Accidental Blackboard". No repo link for the harness itself was found.

## 2. Application brief

Structure (about 1,300 to 1,500 words of body text):

1. Context and intent: build a backend-for-frontend (BFF) for a product-discovery client. The BFF validates and forwards requests, applies resiliency rules, and publishes query events. It does not own product data.
2. Out of scope: the Order API, Kafka consumers, and a product database.
3. Solution architecture: an orchestration diagram and a responsibilities table covering the client, the BFF, the Order API (system of record), the Kafka `product-queries` topic, and downstream consumers.
4. Technology and delivery constraints: a runnable Spring Boot and Maven Java app; configurable Order API base URL and Kafka bootstrap servers; a README; a shallow `/health` endpoint.
5. Client-facing HTTP interface (four operations only, with shared shapes `ProductBase`, `Product`, and an error object):
   - `GET /health`: readiness, no business side effects.
   - `POST /products`: returns 201, or 202 with a `Link` header on timeout, or 400.
   - `GET /monitor/{id}`: returns a deferred request and, once complete, its response.
   - `GET /findAvailableProducts`: returns 200, 429, 400, 502 or 503.
6. Downstream Order API interface: `GET /products` and `POST /products`, with API-key and idempotency-key headers on POST.
7. Kafka interface: after a non-empty successful search, publish the first product's `id`, `name`, `inventory` (and optional `categories`) to `product-queries`; wait up to one second for acknowledgement.
8. Resiliency and business rules:
   - Deferred POST: retry every second, up to 10 attempts, reusing the same idempotency key.
   - GET throttling: 429 with `Retry-After: 1` on timeout; 503 when the Order API is unreachable.
   - Downstream validation: enforce `type`, `from-date`, `to-date` filters; return 502 on violations.
9. Connectivity timeout: `ORDER_API_TIMEOUT_MS`, default 500 ms.
10. Tests: automated tests must cover contracts, resiliency, validation, and Kafka publication rules.

Non-goal and constraint phrases (short quotes, as the summary gave them):
- "Do not use an in-memory product store."
- "Do not add operations or response statuses not listed here."
- "Do not publish a Kafka message for an invalid downstream response."

The brief is written as prose requirements plus a precise endpoint table; it is "unusually detailed" per the author.

## 3. Inner loop: guides (feedforward) given to the agent

Reported in the article, in prose (no filenames given):
- The application brief (given to both harnessed and unharnessed conditions).
- Baseline repository instructions (given to both conditions; filename not stated).
- OpenAPI specs for the BFF and for the downstream Order API.
- An AsyncAPI spec for the Kafka events.
- Request-response examples covering timeouts, malformed payloads, filter violations, retries, and Kafka confirmations.
- An API-development skill: implementation practices, dependency simulation, failure-diagnosis guidance.
- Helper scripts: scaffold a verification-evidence record; build, start and test commands.
- Configuration tooling that wires contracts to the app and to contract-driven dependency mocks.
- Timing-constraint helpers.

Filenames for these are NOT given in the article. Treat any AGENTS.md / skills / specs/ layout as inference.

## 4. Inner loop: sensors (feedback) and cadence

Sensors that run (as reported):
- Contract-conformance checks generated from the supplied specs.
- Example-based API tests asserting HTTP response values (status, content type, body).
- Assertions on side effects: calls recorded on downstream mocks, and Kafka messages published.
- Test reports, CTRF reports, API coverage reports.
- Build and unit checks, run as part of the test command.
- Linters: NOT mentioned.

Commands:
- `examples validate` (named in the article): checks that example payloads comply with the API specs. Runs before tests.
- "The project's test command" (name not given): validates configuration and examples; runs build and unit checks; starts downstream mocks; launches the app; runs the API checks.
- A scenario-rerun helper: reruns only the affected scenarios after a fix.
- Full suite: run once at the end as the final gate.

Cadence:
- NOT per edit. The article says the harness "did not run automatically after every code edit."
- The agent invokes the test command itself, per attempt.
- Per fix: rerun affected scenarios.
- Final: full suite.

Feedback delivery: test output and report summaries are returned to the agent in the tool result. The agent diagnoses, changes implementation or setup, and reruns. No hook, CI, or stdout-to-model channel is described beyond this.

Tools: the author used Specmatic. The article says equivalent contract-testing and service-virtualisation tools would also work. Dependency mocks are contract-driven: they simulate downstream responses, failures and recovery sequences.

## 5. Keeping guides and sensors in sync (the rule)

Rule as reported:
- Before tests run, a validation step checks that example payloads match the API specs, so guides and sensors agree.
- Tests are generated from the specifications and examples. The article calls these "human-agreed expectations," not derived from the agent's reading of the brief.
- The agent is told to keep those inputs unchanged, investigate failures, and fix the implementation or setup, not to weaken expectations. Paraphrase of the article's phrase: "rather than weaken the expectations."
- The same sensors serve two purposes: steering during development, and independent acceptance at the end.

Concrete drift examples the article names (from the "executable attention" section):
- A deferred request must not be treated as complete until it has a monitor link and eventually returns the downstream result.
- A Kafka message is valid only if payload and headers both match the contract (an extra type header was a failure mode).
- An optional field must be an array or omitted, not null.
- An error response must match status, content type and body together (e.g. 415 used where 400 was required).

How a guide relates to a sensor (inference from the above): the spec and the example files are both guide (the agent reads them) and sensor (the generated tests check against them). Drift is prevented by making the examples a machine-checked artifact (`examples validate`) rather than prose. What goes wrong when they drift (article's failure cases): the agent's own interpretation diverges from the spec; examples that are not validated can silently disagree with the spec, so tests pass for the wrong reason. The article does not describe a concrete drift incident in the harness itself.

## 6. Outer loop: evaluation harness (hidden acceptance)

- After development stopped, each app was run against 178 combined functional checks. These cover invalid inputs, downstream failures, recovery sequences, and Kafka output.
- Each attempt ran in an isolated Docker container with its own workspace and a fresh Codex home.
- The evaluator controlled its own downstream fixtures and captured Kafka messages. It did not use the app's development tests.
- The inner harness never had access to the 178-check suite.
- Accepted = the app starts successfully AND passes all 178 checks. Pass/fail per run.
- Design: 10 paired runs per model, with and without harness. Models: GPT-6 Sol and GPT-6 Luna, both at low reasoning effort, via Codex. Exploratory runs also used Claude Sonnet 4.6, Claude Opus 4.6 and Gemini 3.8 Flash at low effort; run counts for these are not given.
- Efficiency (tokens, time, cost) was tracked separately from pass criteria. Costs are API-equivalent estimates and exclude the human effort of writing and maintaining contracts.

Results as reported:
- Sol: 10/10 accepted with and without harness. About $2.679 per run with harness vs about $0.406 without.
- Luna: 3/10 accepted without harness; 10/10 with it. Harnessed Luna about $0.273 per run.
- Unharnessed Sol: all 10 passed every functional check on the first pass (one `/goal` prompt).
- Unharnessed Luna: about 94.8% of checks passed unaided; misses were edge cases. Failed apps still passed at least 144 of 178 checks.
- Unharnessed Luna failure clusters: deferred-creation (202) at the timeout boundary (returned 503, 400 or 429 instead of 202); missing monitor link (seven runs, a consequence of the 202 failure); Kafka wire-contract violations (three runs); error-response mismatches; one config-name mismatch.

## 7. Specmatic: role, invocation, minimal equivalent

What Specmatic is (from its own site and search results, not from the article's detail):
- Open-source, spec-first contract tooling. Reads OpenAPI, AsyncAPI, GraphQL, gRPC, Arazzo, WSDL.
- "Contract as stub": stubs a dependency from its API spec, so responses stay in sync with the spec.
- Contract tests: runs the contract against the real service.
- Kafka mocking from AsyncAPI requires a Specmatic extension/container (Docker must be running, per the sample README).
- A MCP server exists to expose Specmatic to coding agents.

Role in the article: it (a) generates contract-conformance tests from the OpenAPI/AsyncAPI specs; (b) stands in for the Order API over HTTP and the Kafka broker, so the BFF is tested in isolation; (c) lets the test suite inject downstream failures and recovery sequences.

Invocation: the article does not give CLI command lines. The public sample repo `znsio/specmatic-order-bff-nodejs` (a Node/Express BFF with the same domain, Jest, and `specmatic.yaml`) uses `npm test`, which per its README "launches the BFF, spins up Specmatic HTTP and Kafka mocks, and executes the Jest contract suite with API coverage reporting." Its test script enables generative tests (`SPECMATIC_GENERATIVE_TESTS=true`) and runs Jest with `--collectCoverage --detectOpenHandles`. Its `specmatic.yaml` fetches the Domain API OpenAPI spec and the Kafka AsyncAPI spec from a separate contracts repo. The HTML report is written to `reports/specmatic/test/html/index.html`. Exact `specmatic` CLI syntax was not verified; check docs.specmatic.io CLI Quick Start before relying on any command.

Minimal equivalent for a TypeScript/Node project (inference, not from the article):
- Specs: `openapi.yaml` for your HTTP API and downstream API; `asyncapi.yaml` for events. Keep them under `contracts/`.
- Examples: request/response example files per scenario, under `contracts/examples/`, one per case (timeouts, malformed, filter violation, retry, Kafka ack).
- Validator: a script that loads each example and checks it against the spec (e.g. with `ajv` for JSON schema plus an OpenAPI validator such as `@apidevtools/swagger-parser` or `openapi-response-validator`). Run it first.
- Contract tests: `vitest` or `jest` + `supertest`, generated from the spec or driven by the examples, asserting status, content type, body, and that downstream mock calls and Kafka publications match.
- Downstream stubs: `msw` or a small Express/Fastify stub server driven by the same OpenAPI spec (e.g. via `openapi-backend` or a mock generator). For Kafka: a fake producer/consumer that records messages and checks them against the AsyncAPI schema, or a Testcontainers Kafka.
- Run script: `npm run harness` = validate examples, build, start stubs, start app, run contract tests, write a JSON/HTML report.

## 8. Step-by-step run sequence and stopping rule

The article does not give an explicit numbered sequence. Reconstructed from the text:
1. Read the application brief and repository instructions.
2. Read the OpenAPI/AsyncAPI specs, examples, and the API-development skill.
3. Implement the app.
4. Run the project's test command (validate examples, build, unit checks, start mocks and app, run API checks).
5. On failures, diagnose from reports, change implementation or setup (never the expectations), rerun affected scenarios.
6. When scenarios pass, run the full suite as the final gate.
7. Stop. The stopping rule is passing the full suite, but the article does not state a cap on attempts. Treat any attempt cap as an inference you must add.

Outer evaluation then runs the hidden 178 checks once, separately.

## 9. What the author says made it work or not

- Contracts as the backbone: specs plus examples are human-agreed and independent of the agent's reading of the brief.
- Harness as "executable attention": it turns written requirements into feedback that catches details the agent drops ("attention lapse").
- Feedback is run-time, not per-edit: the agent runs the command itself; the article reports no per-edit hook.
- Model differences: Sol kept details in every run without the harness, so the harness added cost without a measurable acceptance gain. Luna needed it; with it, outcomes were consistent and about 33% cheaper than unharnessed Sol in this sample.
- Future work: a "final gate only" condition for frontier models.
- Limits the author states: 10 paired runs per model; one greenfield Java service; low reasoning effort; guides and sensors were added together, so their separate contributions cannot be isolated; cost excludes human effort; no legacy, other-language, or vague-requirement tests.

## 10. Answers to the key questions

- Concrete files and contents: not published in the article. Only the categories above are given. The public Specmatic sample repo is the closest concrete artifact.
- Guides (feedforward) vs sensors (feedback): guides are the brief, baseline repo instructions, OpenAPI and AsyncAPI specs, example request-response files, the API-development skill, helper scripts. Sensors are the validator, the contract and API tests, the mock-side-effect assertions, and the reports.
- Keeping the agent from gaming sensors: (a) the verification source (specs and examples) is fixed and agreed by humans and the agent is told not to weaken it; (b) the example set is validated against the spec before tests run; (c) the acceptance suite is hidden and run in a separate container with its own fixtures; (d) the inner harness never sees the 178 checks. The article does not describe any additional anti-gaming check such as test-file hashing or diff restrictions. Those would be inference.
- Minimal Node/TypeScript port with Claude Code: see section 7, plus a `CLAUDE.md` (guide) listing the brief, specs and the test command, and a single `npm run harness` that the agent runs after each change and at the end. (Inference.)

## 11. Gaps

- Verbatim text of the article and brief: not retrieved in full (fetch summarised).
- Harness filenames, the repository instructions file name, the exact command name, and the step cap: not given.
- Specmatic CLI invocations and config schema: not verified (docs page did not list them).
- Author confirmation (Naresh Jain): not verified by fetched text.
