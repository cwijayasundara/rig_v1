# Josh Rosen, "Architecting the 'No Skills' Application"

Verification status: x.com direct fetch returned HTTP 402 and the nitter mirror is down (legal takedown). The article text was read through the fxtwitter API mirror (https://api.fxtwitter.com/JoshARosen/status/2112529815949443175), fetched via a summarising tool. So all content below is a tool-summarised rendering, not verbatim. Only two short quotes are given, both as returned by that tool. The raw article endpoint (api.fxtwitter.com/i/article/2112313639742935040) returned 404. Web searches found no blog mirror, HN or Reddit discussion, or quote-tweet commentary.

## What problem does the article name, and who wrote it?

### Takeaway
Rosen (@JoshARosen, co-founder of TopCoat, acquired by Snyk; builder of ThruWire) argues that when teams scale agent "software factories" and merge many agent PRs, change outpaces architecture, so "fallbacks on fallbacks" and slop accumulate with each task. His fix is to make the application itself carry the architecture instead of relying on skills or prompts.

### Cited Findings
- Article title "Architecting the 'No Skills' Application", posted Tue 20 Oct 2026 13:02 UTC; metrics at fetch: 5,492 views, 89 likes, 158 bookmarks, 8 reposts, 4 replies, 2 quotes — [fxtwitter](https://api.fxtwitter.com/JoshARosen/status/2112529815949443175); post at [X](https://x.com/JoshARosen/status/2112529815949443175)
- Problem: teams running software factories or merging many agent PRs hit a wall when change outpaces architecture; "fallbacks on fallbacks" pile up and slop emerges with each task — [fxtwitter](https://api.fxtwitter.com/JoshARosen/status/2112529815949443175)
- Critique of open-source skill packages and prompts: they can hide that the app was never designed for agents, go stale after model updates, and understate what models can do unaided. The bar proposed is an app whose architecture lets agents extend it correctly without special instructions — same source
- Nine section headings in order: Canonical Implementations; Vertical Slices; Constrained Extension Points; Convention-Based Discovery; Schema-Driven Development; Architectural Enforcement; Deterministic Scaffolding; What If It's Still Not Enough?; Architecture Is Part of the Harness — same source
- Closing claim: two agents with the same model and tools perform very differently depending on whether the architecture offers one clear path. Apps should be "opinionated, discoverable, and difficult to misuse by default." Closing line: "Before writing another skill, ask whether the application should have made the decision instead." — same source
- Sources the article cites: OpenAI "Harness Engineering" (openai.com/index/harness-engineering/), Basti Ortiz on vertical slices, ts-archunit, Stripe Sorbet, Next.js App Router, OpenAPI Generator, GraphQL Code Generator, Prisma, Hypothesis, fast-check, Rails generators, Thoughtworks *Building Evolutionary Architectures*, ThruWire — same source

### Inferences
- The thesis is "architecture is part of the harness". For rig, this supports pushing rules into mechanical checks and templates rather than skill prose.

### Gaps
- No full verbatim text; exact wording, any further numbers or examples beyond those below are unverified.

## Canonical implementations: what they are, and how kept authoritative and discoverable

### Takeaway
Agents search for something similar, inspect it and copy it, so every implementation in the repo is potentially an architectural example. The remedy is one obvious way per concern, plus deleting deprecated code and workarounds. Discoverability comes from structure (vertical slices, convention-based discovery), not documentation.

### Cited Findings
- Credited to Lauren Tan (@poteto), who architected Dune, the architecture behind the Grok Bot application layer — [fxtwitter](https://api.fxtwitter.com/JoshARosen/status/2112529815949443175)
- Mechanism: agents search for something similar, inspect it, copy the pattern, taking the shortest path to completion — same source
- Example framing: four ways to do one thing versus one obvious way (not a measured number) — same source
- Keep structure, naming, interfaces, error handling and tests consistent. Remove deprecated code, temporary workarounds and one-off abstractions, because agents reproduce them — same source
- Quote (as returned by the tool): "every implementation in the repository is potentially an architectural example." — same source
- Vertical slices: code organised by technical layer forces agents to reconstruct features from scattered files. Example layout `src/features/invoices/` and `customers/`, each with `api.ts`, `schema.ts`, `service.ts`, `repository.ts`, `components/`, `tests/`, `index.ts`. Cites Basti Ortiz, OpenAI's business-domain grouping, and Dune's co-location — same source
- Constrained extension points: narrow typed interfaces (e.g. `InvoiceRepository` with `find`/`save`, `InvoiceDependencies` with repository and events) instead of raw infrastructure access; the repository requires tenant context so features lack unrestricted DB access. Cites OpenAI's single provider interface for cross-cutting capabilities (auth, telemetry, connectors, feature flags) and Stripe Sorbet for explicit public interfaces — same source
- Convention-based discovery: adding an endpoint otherwise needs handler, router registration, DI, authorization metadata and validation schema. Example: Next.js App Router derives routes from the filesystem; a `src/commands/` directory (`create-invoice.command.ts`, etc.) where a build step discovers modules, validates exports and assembles the registry. Extends to event handlers, plugins, jobs, migrations — same source
- Schema-driven development: define a contract once and derive validators, types, SDKs, docs (OpenAPI Generator, GraphQL Code Generator, Prisma). Principle: generated files should look generated and fail verification when they drift from source — same source

### Inferences
- "Kept authoritative" is achieved by removal of competing examples plus checks (see enforcement), not by a registry of blessed examples; the summary mentions no such registry. Unverified whether the full article says more.

### Gaps
- Whether the article describes explicit marking or indexing of canonical examples for agents (e.g. in docs or AGENTS.md): not reported by the source.

## How is architecture enforced mechanically?

### Takeaway
Rules not enforced mechanically become prose that people and agents ignore. Enforcement is by custom lint/AST rules, structural tests, dependency-direction checks in CI, shared contract test suites, and property-based tests.

### Cited Findings
- Problem statement and OpenAI Harness Engineering precedent: fixed layers, enforced dependency directions, custom lint rules for prohibited relationships — [fxtwitter](https://api.fxtwitter.com/JoshARosen/status/2112529815949443175)
- Dune: CI rules reject disallowed patterns, including React's `useEffect` — same source
- Example checks: AST rule banning direct DB access outside persistence modules; structural test rejecting handlers that skip authorization; dependency checks blocking infrastructure from importing app modules — same source
- ts-archunit (nielspeter.github.io/ts-archunit/): executable TypeScript architecture rules catching direct DB access, copy-pasted logic, generic errors, skipped validation — same source
- Behavioural contracts: `runRepositoryContractTests(() => createPostgresRepository())` and the same for an in-memory repository; suite covers transactions, pagination, tenant isolation, error semantics — same source
- Property-based testing (Hypothesis, fast-check) for domain invariants; background concept is architectural fitness functions (Thoughtworks) — same source

### Inferences
- Codemods are not mentioned in the summary; the CI-gate role is implied by "CI rules" (Dune) only.

### Gaps
- No metrics on rule counts, false positives or enforcement cost.

## Deterministic scaffolding versus LLM-driven work

### Takeaway
Generators produce the standard structure of new features, providers and events; the agent then fills in the judgment-bearing logic. Where judgment cannot be encoded, replace prose with checkpoints.

### Cited Findings
- Precedent: Rails generators (models, controllers, tests, routes from templates). Proposed CLI: `app generate feature invoices`, `app generate provider stripe`, `app generate event invoice-paid` — [fxtwitter](https://api.fxtwitter.com/JoshARosen/status/2112529815949443175)
- Output: directory structure, public exports, typed interfaces, dependency declarations, contract tests — same source
- Generators themselves should be tested: generate components, compile them, run contract tests, apply architectural checks — same source
- Checkpoints for what remains: each defines a goal and validation criteria and leaves method to the agent. Example: a security-sensitive feature with checkpoints for tenant isolation, authorization, backward compatibility, each requiring implementation evidence. Validation is deterministic where possible, model-based where judgment is needed. ThruWire's checkpoint architecture is mentioned — same source

### Inferences
- Division of labour implied: scaffolding and checks are deterministic; the LLM supplies logic inside the scaffold; model-based review is the fallback for judgment calls.

### Gaps
- No generator implementation details beyond the CLI sketch (it is illustrative, not a shipped tool as far as verified).

## Metrics, failure modes, and org/human-role implications

### Takeaway
The article reports no metrics (as summarised) and, per the fetch, does not discuss junior versus senior roles.

### Cited Findings
- Failure modes named: fallbacks on fallbacks; slop; stale skills after model updates; skills that mask unagentic design; agents copying deprecated or one-off code — [fxtwitter](https://api.fxtwitter.com/JoshARosen/status/2112529815949443175)
- The summariser stated the article does not discuss junior or senior roles — same source

### Inferences
- Human role implied: architects design the opinionated structure, rules and generators; this is inference, not stated.

### Gaps
- No quantitative evidence, evals, or case-study numbers found. No independent commentary, HN or Reddit threads found (article is one day old as of 2026-10-21).
