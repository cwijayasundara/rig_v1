# U0: the `ui` eval variant (one endpoint, one screen, a real browser check)

2026-11-14. Second half of wave W5 of `docs/proposals/2026-11-14-implementation-order.md`; step U0 of
`docs/proposals/2026-11-14-frontend-design-in-the-loops.md` §8. Short design: the approach was picked in conversation (below).

## Why

W5 needs traps that rig-on can fail. knex (merged) covers backend reading limits. U0 covers what unit tests cannot see: a screen that
passes its own render tests but is wrong in a browser. Exit with knex: at least 2 traps escape rig-on across both variants. If none
escape, rig-on is production ready on this evidence and the order skips to W8.

## Goals, non-goals, anti-goals

- **Goals:** one new variant `ui` on the `hard` shop (B1 to B19 built). Two behaviours, B20 (endpoint) and B21 (screen), two traps.
  rig-on arms only (`sonnet-rig-on`, `haiku-rig-on`), 3 runs each.
- **Non-goals:** bare or rig-start arms in live runs (a dry bare run is a spec); any change in `scripts/`, `skills/`, `hooks/`; the
  designer, `ux.md`, `kind: ui` or screenshots (U1 to U3, deferred until a UI escape makes the case).
- **Anti-goals:** an issue text that names a trap (`TRAP_WORDS`); a trap whose right answer is a judgement call. Each hidden check has one
  correct behaviour that the issue's own words imply.

## Approaches (picked: option 1)

| Option | For | Against |
|---|---|---|
| **1. A screen on the existing `hard` shop** (picked) | Reuses the seed, child-process checks and scoring; `api/openapi.yaml` already exists for the field trap | Not a separate front end |
| 2. A new two-part app (API plus static page) | Closer to what U1 to U3 build for | New seed, new trap designs, more cost |

## The task and traps

- **B20:** `GET /customers/<name>/orders` answers 200 `{ customer, orders }`, newest first, each order with `id`, `status`, `placedAt`,
  `payableCents` and `lines` (`sku`, `qty`). An unknown customer (no orders) is 404 `{ error }`.
- **B21:** the page `/ui/customers/<name>` shows that customer's orders as a table. Each row shows the order id, the status, the
  placed date, the total in dollars (B16 rounding) and the product **name** of each line with its quantity.
- **Trap `error` (a forgotten state):** the issue says the screen "shows what B20 answers". For an unknown customer the endpoint is 404; a
  screen that parses the body as a list renders a blank table or `undefined`. Hidden check: the page for an unknown customer shows an
  element with `role="alert"` that holds the endpoint's error text, and no table rows.
- **Trap `field` (a field the contract lacks):** B20's order lines carry only `sku` (`api/openapi.yaml`), so the product name must come
  from the catalog (`GET /products`). A screen that shows the sku, or nothing, passes a render test built from the contract's own
  example. Hidden check: each line cell shows the product name from the catalog ("Green tea"), never the sku.
- Unit tests a careful model writes (the endpoint and a render function) pass under both slips.

## Hidden checks

- A real browser: Playwright with Chromium, run in a child process like every `hard` check, verdict in a harness-named file. The shop's own
  server is started by the check (as `hard.mjs` does); nothing model-reachable prints a verdict.
- Playwright and its browser are installed once into `~/.cache/rig-eval/playwright` by a setup script, never into the repo or the
  sandbox. `eval/lib/browser.mjs` resolves it; specs that need it skip with the reason when it is missing (as `upstreamAvailable` does).
- Basic and trap are split as in `hard.mjs`: a trap whose basic behaviour failed (page not served, no table) is missing, not escaped.

## Files

- `eval/variants/ui.mjs` mirrors `hard.mjs` (`TASKS`, `TRAP_TEST`, `TRAP_WORDS`, `BARE_PROMPT`, `PHASES`, `setupBare`, `setupRig`,
  `dryBare`, `checks`, `score`); `eval/variants/ui/{tasks,patches}/` hold the issue text, `ref.patch` and one slip per trap;
  `eval/lib/browser.mjs`; `eval/ui.test.mjs`; wiring in `eval/setup.mjs`, `eval/run.mjs` and `eval/score.mjs`.
- The run: `node eval/run.mjs --arms sonnet-rig-on,haiku-rig-on --runs 3 --variant ui` (about $2 to $4), started by a person.

## Constraints

- Only `eval/` changes. Each file at most 500 lines. Never run `npm test`, e2e or eval scripts; implementers run `eval/ui.test.mjs`,
  `npm run typecheck` and `npm run test:changed`.
- The dry run and slips are specs: ref passes both traps; each slip passes `npm test` and fails only its own trap.

## My calls (change any)

- The page lives under `/ui/` so it cannot collide with the API route; it may be server-rendered or fetch-rendered, since the check is
  black-box.
- Two traps, not three. A third (a loading state) is not added unless the dry run shows fewer than two hold.
- Playwright lives in the eval cache, not in `package.json`.

## Left to the builder

- The exact issue wording (kept clear of `TRAP_WORDS`), the catalog product names the check expects, and whether the ref page is
  server- or fetch-rendered.
