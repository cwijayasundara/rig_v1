# Sensor catalogue and Jain's harness anatomy

Kept from `reports/rig behavioural harness design.md` (removed 2026-10-17; in git history). Sources: Jain,
[Are harnesses worth the cost?](https://martinfowler.com/articles/are-harnesses-worth-the-cost.html); Fowler,
[Sensors for coding agents](https://martinfowler.com/articles/sensors-for-coding-agents.html) and
[Harness engineering](https://martinfowler.com/articles/harness-engineering.html). Read through summarising fetches, so
treat quotes and numbers as leads. Tool status was checked on npm on 2026-10-16.

## How Jain's harness is built

Study: 10 paired runs per arm, two OpenAI models, one greenfield Spring Boot backend-for-frontend, 178 hidden functional checks.

1. **Brief**, about 1,300 to 1,500 words: context and intent, out of scope, orchestration diagram and responsibilities, technology
   constraints, client HTTP interface (operations, status codes, shapes), downstream API, message interface, resiliency rules,
   timeout default, required tests. Explicit non-goals ("Do not add operations or response statuses not listed here").
2. **Guides**: the brief, baseline repo instructions, OpenAPI for both HTTP boundaries, AsyncAPI for Kafka, request/response examples
   (timeouts, malformed payloads, retries, acks), an API-development skill, helper scripts.
3. **Sensors**: Specmatic generates contract tests deterministically from the specs, stands in for the downstream API and broker,
   and returns CTRF and coverage reports. The skill says to fix the implementation or setup, never weaken the expectations.
4. **Outer loop**: each attempt in an isolated container; the evaluator used its own fixtures; the inner harness never saw the
   hidden suite.

Details that are easy to misread: sensors were **not** run after every edit (the agent invoked them; full suite once at the end);
guide and sensor share one source (an `examples validate` step checks payloads against the specs); results depend on model grade
(strong model 10/10 with and without, about 7x the cost; cheap model 3/10 to 10/10, cheaper than bare strong). Limits: 10 runs,
one Java service, low reasoning effort, guides and sensors not separable, contract-writing cost excluded, no Claude model.

## Sensor catalogue for a TypeScript agent

Fowler's cautions: lint rule sets caused "feedback overload ... a spiral of over-engineered refactorings"; coverage shows a line ran,
not that it was verified; mutation testing is resource intensive; coupling data alone was not useful to the model. Computational
sensors suit every change; inferential ones are slower and probabilistic, "not on every commit".

| Sensor | Node/TS tool | Cadence | Mode | Note |
|---|---|---|---|---|
| Lint, changed file | `eslint` | edit | advise | one fast pass |
| Types | `tsc --noEmit` incremental | turn, commit, CI | block | inference |
| Fast tests | `vitest related` or `node --test` | turn | block | inference |
| Contract tests | Specmatic (npm wrapper 2.55.3), Schemathesis, Prism, or Ajv plus supertest | turn when contracts or http change; commit; CI | block | Specmatic needs a JVM; licence of the bundled jar unconfirmed |
| Tamper, suppression, secrets, frozen files | rig diff sensors | turn, commit, CI | block | already built |
| Regression suite | `npm test` | commit, CI | block | |
| Coverage floor | `c8 --check-coverage` | CI | block | weak signal alone |
| Dependency rules and cycles | dependency-cruiser 18.6.0 | commit, CI | block in CI | replaces regex layering |
| Duplication | `jscpd` | CI | advise | inference |
| Mutation | `@stryker-mutator/core` 10.0.0, `--incremental` | CI on changed files; nightly full | block below `thresholds.break` | named by Fowler |
| Dead code, audit, freshness | `knip`, `npm audit`, Dependabot | nightly | advise | |
| Coupling and modularity | dependency-cruiser metrics plus one LLM pass | nightly | advise | run the LLM pass more than once |
| LLM review | built-in `/code-review`, once per PR | CI final | advise | |

Rule for adding any of these: one at a time, each justified by a failure that repeated (Fowler's steering loop), and each with an
eval arm. Not yet in rig: mutation, coverage enforcement, duplication, real dependency-rule linting, architecture fitness tests.
