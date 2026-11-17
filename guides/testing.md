---
name: testing
paths: @tests
why: agent-written tests often pass without proving anything, and tests are the contract humans review instead of the code
---
# Testing rules (read before editing tests)

## Iron rules
1. **Red first.** Write the test and run it with `sdlc.ts run --expect-fail -- "<cmd>"`. See it fail for the right reason before writing code. Ship recomputes this against the base.
2. **Test behaviour, not implementation.** Assert on outputs, state and observable effects through the public interface, never on private calls.
3. **One reason to fail.** Each test pins one behaviour and its name says which, with the B-number: `B3 rejects an empty key`.
4. **Edges and errors are behaviours.** Empty, boundary, malformed, duplicate and failure paths each get a case when the intent covers them.
5. **Never weaken a test to get green.** No skip, only, xfail, deleted assertions or lowered thresholds. Fix the code. The sensors block these.
6. **Fake only at the boundary.** Use real objects inside your code; fake I/O, network, clock and randomness at the edge.
7. **Deterministic.** No sleeps, wall-clock time, network or test-order dependence; inject the clock and seeds.
8. **Readable as a spec.** Arrange, act, assert; literal inputs and expected values; no logic in tests.
9. **API tests use the real surface.** Call the handler or HTTP endpoint and assert on status and body, including the error statuses the spec names.
10. **Smoke and performance are declared commands.** `smoke` and `bench` in `.rig/sensors.json` `full`: smoke starts the app, hits a health check and stops under a timeout; bench exits non-zero when it misses the spec's `## Non-functional` number.
11. **Hostile surfaces get a test.** A change that writes shared state has a test that runs two writers at once and counts what survived; one that parses options has a test passing `--opt --other`, and one passing nothing after `--opt`.
12. **Flaky is a bug, never a rerun.** Do not skip, add a sleep, or retry until it passes (the test-tamper sensor blocks `retryTimes`, `@flaky` and `retries: N`). Find the nondeterminism (clock, order, shared state, network, randomness) and inject or isolate it. When no root cause can be found, request a waiver to delete the test and say why in it: a test everyone learned to rerun is worse than none.
13. **State a law, then try to break it.** A change that parses, serialises, normalises, migrates, retries or ships an optimised path gets a property test over generated inputs (fast-check, Hypothesis, proptest, or a seeded loop of a few hundred cases when none is installed). Pick the law: round trip (decode of encode is the input), invariant (a balance never goes negative), idempotency (twice is once), equivalence (optimised matches the naive version). Print the seed, and keep each failing case as a plain example test.
14. **A rewrite is judged against the old code.** For a migration or replacement, run old and new on the same inputs (generated, or sampled from real use), normalise differences that do not matter, and list each approved difference with its reason. The old system is the oracle; an unlisted difference is a bug until proven otherwise.

## Rationalizations
| Thought | Reality |
|---|---|
| "I'll write the test after" | Then it is shaped by the code and passes by construction. |
| "This assertion is flaky, drop it" | Find the nondeterminism and inject it; never skip, sleep or retry. |
| "A few examples cover it" | You chose them, so they share your blind spots. State the law and let generated inputs attack it. |
| "The new code looks equivalent" | Run both on the same inputs and diff. Looking equivalent is how migrations break. |
| "Mocking the internals is easier" | Then every refactor breaks tests that should still pass. |
| "Coverage is high enough" | Coverage counts lines run, not behaviours proven. |
