# Verify the running app: `journeys` (Phase 2, item 2.1)

Status: draft for approval, 2026-10-21. Nothing is built. Source: `docs/proposals/2026-10-21-harness-readiness-consolidated.md` item 2.1 and principle 4.
Calls I made are marked **[my call]**; the open ones are listed at the end for the person.

## Intent

Green unit tests are weak evidence. Anthropic found unit tests and `curl` missed end-to-end failures that browser testing caught; Cursor's
verification skill is a project-local driver plus a map of how each feature is reached; reward-hacking papers show tests an agent writes can pass
while the app is wrong. The three evals so far show rig's builds failing at the seams between changes (an old test left red, a route that
does not match) that a run of the real app would show. rig has one real-app check today: the contract replay, for HTTP contracts. It has no
general way to launch an app, walk its main journeys, keep evidence, and refuse to ship when a journey breaks.

## Goals

- A repo-local **journeys** check: a driver that launches the real app, walks 3 to 5 named journeys, asserts the observable end state (including side effects: rows, files, messages), keeps evidence, and stops only what it started.
- It plugs into the gate rig already has: a command sensor that `/rig:test` (verify) runs, so `/rig:pr` cannot ship while a journey fails.
- A **feature map**, one short file per feature (how it is reached, the observable end state), that the driver and the next reader both use, and a check that it has not gone stale.
- The building model cannot weaken a journey to make it pass.
- A generated driver that was never run is a **draft**, and says so everywhere it would otherwise read as a green check.

## Non-goals and anti-goals

- Not a browser or UI driver in this change **[my call: needs the person's yes]**. Journeys drive HTTP services and command-line programs. A UI app uses the built-in browser tools natively when a person runs `/rig:app`; no CDP layer of our own.
- Not a replacement for unit tests or the contract replay; a fourth layer on top.
- Not a perf or load test, and not a visual diff.
- Anti-goal: a journey check that looks enforced but never ran, or that the builder edited until it passed.

## Parts

1. **`templates/verify/lib.mjs`** (about 60 lines, copied into the repo at `.rig/verify/lib.mjs` and vendored with the harness): the helper every driver imports. `launch(cmd, { ready })` starts the app in its own process group, waits for a ready line or a port, and records its pid in `.rig/verify/.pids`; `stop()` kills **only** the recorded group, never by name; `step(name, fn)` records a step and its evidence; `finish()` writes `.rig/verify/evidence/<run>.json` and the exit code. Node because rig already requires it; the app can be in any language, since the driver talks to it over HTTP or a process.
2. **`/rig:app`** (`skills/app/SKILL.md`, model-facing): reads the repo (README, package scripts, routes, the wiki if there is one), proposes 3 to 5 journeys with the person in one question batch, then writes `.rig/verify/<app>/journey.mjs` and `.rig/verify/<app>/features/<feature>.md`. It **runs the driver once**. Only then does it propose the `journeys` sensor entry for `.rig/sensors.json` (cadence `ci`, blocks, so verify and CI run it), which the person approves because that file is protected. An un-run driver stays a draft.
3. **`sdlc.ts app status|check`** (`scripts/app.ts`, about 90 lines): deterministic.
   - `status`: `none` (no `.rig/verify/`), `draft` (driver exists, no passing run recorded for its current hash), `current`, or `stale`.
   - `check` is what the sensor runs: it runs the driver, and exits 1 on a failed journey, on a driver changed since its last passing run by anyone but a person (hash in the protected record), or on a feature file naming a route, command or path that no longer exists.
   - A `draft` driver is listed as "not configured" by `status` and `check` (Phase 0.1's machinery), so it cannot read as green.
4. **Protection** **[my call]**: `.rig/verify/**` joins the protected list, the CODEOWNERS template and the settings ask rules, so the builder cannot edit a journey; a journey changes in a reviewed change, like a frozen contract. `journeys` evidence files and `.pids` are runtime state and excluded.
5. **Eval and acceptance**: a fixture app where a change keeps `npm test` green and breaks a journey (the shop with an `href` route that 404s while the unit tests only call the handler). The acceptance test is that verify blocks it with the journeys sensor on and passes it with the sensor off. A second check: the driver, run twice, leaves no process behind.

## States

| state | `status` shows | gate |
|---|---|---|
| no `.rig/verify/` | journeys: not configured | nothing |
| driver written, never run | journeys: draft (not enforced) | nothing |
| driver passed on its current hash | journeys: current | verify blocks on a failed journey |
| code changed, map names a missing route/command | journeys: stale | warns, blocks at CI |

## What is left to the builder

The exact `lib.mjs` API, evidence file shape, how `status` finds the app name when several apps exist, the stale check's reference extraction (reuse the wiki citation check if it fits), and the task split.

## Open for the person

1. **Scope**: HTTP services and CLIs only in this change, with browser UIs left to the built-in browser tools and a later item (my recommendation), or include a CDP-driven browser driver now.
2. **Who may edit a journey**: protected, changed only in a reviewed change (my recommendation), or editable by the builder with a warning.
3. **Cadence**: `ci` so verify and CI run it and commits stay fast (my recommendation), or `commit`.
