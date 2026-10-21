# Proposal: make the target repo need less explanation

Date: 2026-10-21. Status: proposed, not started. Companion to `2026-10-21-harness-readiness-consolidated.md`, which holds the phased plan, the cross-source evidence and the corrections to earlier drafts. This document applies one source, Josh Rosen's "Architecting the 'No Skills' Application" (posted 2026-10-20), to rig. The maintainer pasted the full article text on 2026-10-21, so it is read in full.

## What the article argues

Agent throughput outpaces architecture: fallbacks pile on fallbacks and each task makes the codebase messier. Skill packages and prompts can hide that the app was never architected for agents, go stale after model updates, and understate what models can do unaided. The bar: encode the application's architectural decisions in the application so an agent needs no special instructions to extend it correctly. Closing line: "Before writing another skill, ask whether the application should have made the decision instead."

His techniques: canonical implementations (every implementation is a potential example, so keep one way per concern and delete deprecated, workaround and one-off code); vertical slices (feature code together); constrained extension points (narrow typed interfaces, cross-cutting concerns through one provider interface); convention-based discovery (filesystem and build step instead of registration); schema-driven development (one authoritative definition, generated files that fail verification on drift); architectural enforcement (lint, AST, structural and dependency checks, contract suites run against every implementation, property tests, fitness functions); deterministic scaffolding (generators that are themselves tested); and checkpoints (goal plus validation criteria, deterministic or model-judged) for what cannot be encoded.

Limits of the source: one author's argument, no metrics or evals, nothing on junior versus senior, no codemods. The `app generate` CLI looks illustrative. He credits Lauren Tan's Dune for several ideas; Dune is an internal, unreleased Electron app framework, known only through secondary write-ups. He mentions ThruWire, his own checkpoint product, so treat the argument as unmeasured.

## Where the article differs from earlier drafts

- Canonical implementations in the article means consistency plus deleting bad examples, not designating blessed ones. The earlier "golden slice per stack" item (consolidated plan 1.4) goes beyond it, so it is now a hypothesis to eval.
- The "no skills" bar applies to rig itself, which is a skills plugin.
- Checkpoints map onto rig's existing intent behaviours (B1..Bn) and `verify.json`.

## Proposal

rig's job: generate and enforce structure so the target repo needs fewer instructions, and measure how much explanation the repo still needs.

| # | Change | Article idea | Builds on (consolidated plan) |
|---|---|---|---|
| R1 | **Decision-to-mechanism audit of rig's own prose.** Classify each normative rule in `guides/*.md`, templates and skills as enforced by a sensor or gate, or prose only. Convert the highest-value prose-only rules to checks. Thereafter a new skill or guide rule must state why a check cannot do the job. | "Before writing another skill..." | New; first pass needs no code |
| R2 | **Executable architecture.** Generate linter config from `architecture.md` and feed the `layering` sensor (`options.layers`). Declare cross-cutting concerns (auth, telemetry, flags) as one provider interface. Ship per-pack rule recipes: DB access outside persistence, handlers that bypass authorization, infrastructure importing app modules. Linter messages state the fix. | Constrained extension points, architectural enforcement | 1.1 and 0.1 |
| R3 | **One way to do it.** A `legacy` path list in `architecture.md`; a sensor fails changed files that import from those paths. jscpd and dead-code scans become ratchets; Maintain opens cleanup intents. | Canonical implementations, old code is dangerous | 1.5 and 3.1 |
| R4 | **Slice shape.** A per-pack feature template plus the scope check. The template is tested by generating from it, compiling, and running the R2 checks. rig emits the first scaffold into the target repo; the app owns its own generators afterwards. | Vertical slices, deterministic scaffolding | 1.3 and 1.6 |
| R5 | **Drift and contract checks.** A pack declares its `generate` command; a sensor runs it and fails if files change. Fill the blank `contracts.run` with the zero-dependency `contract.mjs` instead of waiting on Specmatic. Property-based tests stay optional. | Schema-driven development, behavioural contracts | New; no new dependencies |
| R6 | **Checkpoints.** Each behaviour B_n declares `validation: deterministic` or `judged` and the evidence `/rig:test` must record. Security-sensitive intents (auth, tenancy, money) get a mandatory checkpoint template (tenant isolation, authorization, backward compatibility). | Checkpoints | `verify.json`, frozen contracts |
| R7 | **Agent-readiness report.** Deterministic criteria: share of layer rules enforced versus prose, competing implementations, slice conformance, generated-file drift, contract coverage. Repo-level, not person-level. | "Needs the least explanation" | 4.1 (Factory-style) |

## Decisions recorded (maintainer, 2026-10-21)

1. R1's rule is accepted: a new skill or guide rule needs a stated reason a check cannot do the job.
2. rig emits the first scaffold into target repos (R4), not only checks that one exists.
3. Write this proposal to `docs/proposals/` and commit it. Specs for R1 and R2 are not yet requested.

## How to test the claim

Paired arms on the same task set, n of at least 3 per arm, hidden acceptance tests, fixed model and budget:

1. Bare.
2. rig as it is today.
3. rig plus R2 and R3, with the prose guides removed.

Measure architecture violations and dollars per accepted task. If arm 3 matches arm 2, cut the prose. If it loses, keep it. This extends consolidated item 0.2 by one arm and follows the "no pruning without evidence" rule. The only paired eval to date accepted 0/1 on every arm, so no harness lift is established yet.

## Order

R1 first (no code). Then Phase 0 from the consolidated plan (report inert sensors, first honest eval). Then R2, then R5 and R3, then R4, R6 and R7.

## Not building

A convention-based discovery or codegen framework (an app property), a dependency on ts-archunit (use the per-stack tools in the packs: dependency-cruiser, ArchUnit, import-linter, go-arch-lint), a Dune clone, an orchestrator.

## Risks

- Moving weight from skills to scripts adds code against the 6,000-line harness cap. R1 and R5 are cheapest; R2 is the largest.
- Layer rules and generators drift like documentation; each generated rule needs an owner and a retirement eval, and generators need tests (R4).
- `layering` is inert by default and `architecture.md` is prose nothing reads (audit finding); R2 depends on fixing that first, per stack, starting with node and java.
- Status records in the repo conflict (wiki built or unmerged; dashboard "not started" yet files exist). Reconcile before relying on them.

## Sources

- Rosen: https://x.com/JoshARosen/status/2112529815949443175 (full text supplied by the maintainer; the X page itself returned HTTP 402 to the researchers)
- Companion proposal: `docs/proposals/2026-10-21-harness-readiness-consolidated.md`
- Audit of rig today: `research_notes/Rig harness production readiness/rig_audit.md` (untracked, local only as of this commit)
