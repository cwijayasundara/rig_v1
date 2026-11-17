# Named tests must have executed (short design)

Size: small change. One new finding on the existing `traceability` sensor, Node `node --test` runner only.

## Intent and why

`traceability` (`scripts/check.ts:218`) proves a behaviour `B<n>` is *named* by a test by matching the id in the test
text (`missingBehaviours`, `scripts/sensors.ts:274`). `ranNothing` (`scripts/sensors.ts:21-34`, used at
`scripts/check.ts:126-129`) catches a suite that ran zero tests, and only for the sensor `unit`. Neither proves that the
test naming `B3` actually ran and passed. A runtime skip, a filtered-out test, or a file the runner glob never matches
leaves a green suite and a "traced" behaviour with no executed proof. Source: the comparison with Anthropic's
code-modernization plugin ("P0 rule coverage: named, not run"); commit 40aa00e covered only the zero-total case.

## Goals

- For a change whose `spec.md` has numbered behaviours, every `B<n>` must be named by at least one test that the `unit`
  sensor's run reported as **passed** (not skipped, todo, cancelled or absent).
- Failure message names the behaviour and says why: `B3 is named by a test that did not run (skipped)` or `... that
  the runner never reported (file not matched or filtered out)`.

## Non-goals

- Other stacks (python, go, rust, java, dotnet, angular). They keep today's behaviour; the check emits one `warn`
  saying per-test proof is unavailable for the stack. Adapters are a later change.
- Differential replay, adversarial inputs, three-level verdicts.
- Changing `ranNothing`, `TAMPER_PATTERNS` or red-proof.

## Anti-goals

- A check that fails a change because a runner prints differently than expected. When the report cannot be parsed the
  result is a `warn` ("per-test report unreadable"), never a `block`.
- Reading test files to guess execution. The runner's own report is the only evidence.

## Approaches considered

- **A. Parse a per-test report (chosen).** Exact; needs a reporter per stack, so Node first.
- B. Parse the summary line for skip counts. Small but cannot say which test was skipped.
- C. Use mutation survivors as a proxy. Indirect; adds nothing new.

## Design

1. **Capture.** When the `unit` sensor runs for a Node stack (`templates/stacks/node.json`, cmd `npm test`), also obtain a
   TAP stream. The registry command stays the person's; rig adds the reporter without editing it. Builder to confirm the
   mechanism: `NODE_OPTIONS=--test-reporter=tap` plus `--test-reporter-destination=<file>` if Node accepts them there,
   otherwise run the same command with the flags appended through `npm test -- ...` when the cmd is exactly `npm test`.
   Leave the command alone and warn if neither works.
2. **Parse.** New pure function in `scripts/sensors.ts`: `executedTests(tap: string): { name: string; status: 'pass' | 'skip' | 'todo' | 'fail' }[]`.
   Handles `ok`/`not ok`, `# SKIP`, `# TODO`, and nested subtests.
3. **Join.** In `shipVerdicts` (`scripts/check.ts:218`), after the existing missing-id loop, for each id that *is* named:
   find executed tests whose name contains the id (same boundary regex as `missingBehaviours`). If none passed, push a
   `traceability` finding at the sensor's severity (`block`). Ids with a named test that is only in a file not reported at
   all use the "never reported" wording.
4. **Where the report comes from.** `recordRun` / `runCommand` keep only a tail (`scripts/runs.ts`), so the TAP goes to a
   file under the change's run dir, which `shipVerdicts` reads. If the file is absent (non-Node stack, or the unit sensor
   did not run this cadence), emit the single `warn` from Non-goals and nothing else.
5. **Spec.** New cases in `scripts/sensors.spec.ts` (parser: pass, skip, todo, nested, empty, garbage) and
   `scripts/check.spec.ts` (finding appears for a skipped named test, for an unreported one, not for a passed one, and
   degrades to `warn` on unreadable TAP). Each fails without the change.

## Calls I made (check these)

- Severity `block` when the report is readable and the test did not pass; `warn` when it is not readable.
- Matching by id appearing in the reported test name, same rule as `traceability` today, so a behaviour named only in a
  comment (not the test title) will be reported as "never reported". That is stricter than today; the fix text tells the
  writer to put the id in the test title.
- No new registry id and no `sensors.json` change.

## Left to the builder

- Reporter mechanism in step 1 (verify on the repo's Node version before writing code).
- Exact file location of the TAP capture, following the existing run-dir convention.
- Message wording, within the two forms above.

## Verification

`npm run test:changed`. No `npm test` or e2e. A person should run `e2e:scripted` once, since this touches the ship path.
