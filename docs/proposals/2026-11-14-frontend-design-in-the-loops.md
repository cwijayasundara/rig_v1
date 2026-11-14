# Frontend design in rig: the outer loop designs the UI, the inner loop builds it

2026-11-14. Companion to `2026-11-14-path-to-production-and-adoption.md`. Sources: `main` at 7324485; Anthropic's
`frontend-design` plugin v1.1.1 (Apache-2.0); public notes on Kiro, BMAD and Spec Kit. An independent Fable 5.2 evaluator reviewed
the first draft against the code and returned `changes-needed` with 16 findings. All are applied (§10), and the plan is now
a measured slice, not five feature waves.

## 1. The problem

A product with an API and a UI cannot be charted end to end today.

- **No design artifact.** The PRD format (`templates/prd-format.md`) has functional requirements, data rules and NFRs, but no screens,
  flows, UI states or visual direction. Two pieces exist:
  - mockups placed in the PRD folder are copied to `attachments/` and read by the architect (`skills/chart/SKILL.md:13`);
  - `architecture.md`'s `## Access` table names `web` as an interface (`templates/architecture-format.md:48`).

  Neither is traced, approved as design or checked.
- **No UI intent kind.** Intents are `kind: boundary | internal` (`scripts/chartcheck.ts:9`). A UI intent consumes a boundary.
- **One stack per repo.** `Registry.stack` is one string (`scripts/registry.ts:23`). Only `angular` of the eight packs is a UI stack,
  and slices exist only for node and python. A Python API plus a React app in `web/` gets one pack's sensors.
- **No UI sensors** for accessibility, design tokens or UI states. `ng build` already enforces Angular's bundle budgets, and
  `/rig:app` can drive a UI journey with Playwright (`skills/app/SKILL.md` step 3).

## 2. The `frontend-design` plugin: use it, do not vendor it

It is one skill of about 70 lines. It has no commands, agents, hooks, scripts, files or model pins.

| It gives | It does not give |
|---|---|
| A two-pass process. Pass 1 is a plan (4–6 named hex colours, typefaces and roles, a layout concept with ASCII wireframes, principles), checked against the brief and revised. Pass 2 builds | Any file: the plan lives only in the conversation |
| Grounding in the subject and audience, and a list of AI-default looks to avoid | A design system that later work must keep to |
| Copy rules: active voice, sentence case, errors that say how to fix, empty states that invite action | Traceability to requirements |
| A quality floor as guidance: responsive, visible focus, reduced motion, accessible | Any check that the floor holds |

It supplies taste; rig supplies the artifact, the gate and the checks. That split is `docs/GOAL.md`'s "native first" and "models
advise, scripts decide". `/rig:chart` recommends installing it at project scope when the PRD has an `## Experience` section, and
reads it when present, as it does superpowers. A short `guides/frontend.md` carries the quality floor when it is absent.

The skill pushes each design to be distinctive. That is right once, when the look is set, and wrong for the seventh UI intent,
which must match the first six. So the skill runs in the outer loop to set the design. The inner loop builds inside the
approved design, and a sensor enforces it.

## 3. How the others capture UI design

BMAD has an optional UX agent that writes a front-end spec after the PRD and before the architecture. Kiro has a general
`design.md` per feature, and Spec Kit keeps UI in free text in the spec. None of them traces screens to requirements or
checks the built UI's states and contract use deterministically. Fidelity to a mockup is judged by people everywhere, and in this
design too.

## 4. Outer loop

### 4.1 PRD: an optional `## Experience` section

```
### UX-1: Checkout
Users: shopper (signed in)    Screens: cart, payment, confirmation
Flow: cart → payment → confirmation; back from payment keeps the cart
- UX-1.1: WHEN the cart is empty THE UI SHALL show "Your cart is empty" and a "Browse products" link
- UX-1.2: WHEN payment fails with card_declined THE UI SHALL keep the form values and show "Card declined. Try another card."
States: loading, empty, error, success    Brand: <link or words; none = the designer proposes>
```

- `prd ledger` and `prd check` treat `UX-n.m` like `AC-n.m`: each one goes to an intent and a case, or out of scope. The weakening
  check applies.
- Most client PRDs have no screens or copy. Chart never rejects a PRD and never invents a requirement (`skills/chart/SKILL.md:11,14`).
  So the designer proposes UX criteria the PRD lacks, each one marked `(proposed at chart)` as data values are today. The
  approval page lists them under "agent supplied", where a person accepts or corrects them.
- The NFR table gains standard UI rows: accessibility (WCAG 2.2 AA), JS bundle budget and supported browsers.

### 4.2 Chart: the designer runs before the architect

Chart order today: ledger → step 2 design (a superpowers brainstorm, one batch of questions, a design doc) → architect (intents,
architecture, ADRs) → QA → evaluator. The architect needs screens to write UI intents, so the designer runs in step 2:

1. **No mid-chart checkpoint.** Like the architect and QA, the designer works without asking. Its output goes into the one chart
   approval at the end, with the intents, architecture, ADRs and test artifacts. It runs the skill's pass 1 on its own: it writes two
   or three directions, reviews them against the PRD and the brief, and picks one. The ones it rejected go in `design-system.md` in
   one line each, with the reason, so the approver sees what was considered.
2. **Designer** (Sonnet with the `frontend-design` skill; the generator model, `models.design` already exists at
   `scripts/registry.ts:61`). It writes:
   - `.rig/product/design/design-system.md`: the chosen direction, committed, which fixes the skill's ephemeral plan;
   - `.rig/product/design/tokens.css`: CSS custom properties for colour, type, spacing, radius and motion. Plain CSS variables
     need no Style Dictionary step; W3C token JSON can come later.
   - `sprints/sprint-<N>/ux.md`: the screen inventory, flows, and a state matrix (screen × state, each cell citing `UX-n.m`).
     Each state is given as the user sees it (roles and visible text only, no CSS selectors), so cases can be written before a
     DOM exists.
   - `sprints/sprint-<N>/mockups/<screen>.html`: one static page per screen, primary state only, using `tokens.css`. The other
     states stay as rows in the matrix.

   **Brownfield:** when the repo already has a design system (a Tailwind config, an MUI or Angular Material theme, Storybook), the
   designer derives `tokens.css` and the component inventory from it, and proposes no new look.

   **Structure and look are separate files on purpose.** The structure (`ux.md`: screens, flows, states) feeds the architect's
   intents. The look (`design-system.md`, `tokens.css`, `mockups/`) feeds only the inner loop's build. So a rejected look never
   reaches the intents.
3. **Architect** (as today) now reads `ux.md`. It writes `kind: ui` intents (§4.3), a `## Frontend` part of `architecture.md`
   (framework, routing, state, API client generation, component library as an ADR, Storybook yes or no), and sprint 0's walking
   skeleton gains the UI shell, `tokens.css` wired in, and the base components.
4. **QA** (as today) writes a case per `UX-n.m`.
5. **Evaluator.** This is the same single chart review (CLAUDE.md: one per chart), with two more categories:
   - `states`: a reachable empty, error or loading state with no matrix row;
   - `contract`: a screen that needs data no API intent provides.

   Colour and accessibility checks are scripts' work (§5.1), so the evaluator does not repeat them.

**Deterministic (`chart check`, zero tokens):**
- every `UX-n.m` is cited by `ux.md`, an intent and a case;
- every screen has a mockup;
- mockup CSS uses only colours and font families from `tokens.css`. Sizes are not scanned, because `0`, `1px`, `100%` and
  breakpoints would be false alarms.

### 4.3 Intents: `kind: ui`, plus an explicit integration intent

- `kind: ui` adds three fields:
  - `Screens:` from `ux.md`;
  - `Consumes:`, the API contract file and the operations it calls;
  - `Tokens: .rig/product/design/tokens.css`.
- **A contract consumed by a UI intent must be OpenAPI**, with the pack naming `validate` (for example `redocly lint`) and a mock
  (`prism mock`). All packs ship `contracts: { files: [], validate: '', run: '' }` today.
- **A new chart-level freeze.** Today chart approval only registers contract files in `sensors.json` (`scripts/sdlc.ts:248`), and the
  hash freeze happens at each change's plan approval (`scripts/contracts.ts:1-2`). For UI and API lanes to run in parallel, chart
  approval must hash the consumed contracts and `tokens.css`. This is new work, needed only for that parallelism. Without it, UI
  intents simply depend on their API intent, as any intent depends on another today.
- **The integration is its own intent**: `kind: internal`, depending on both the API and the UI intent. It owns one `/rig:app`
  journey that runs the real API and UI together. The journey is approved by that intent's PR approval (gate 2), with no separate
  `/rig:approve app`. It cannot be approved at chart, because the driver must run against a built app (see
  `2026-11-14-two-human-gates.md` §2).

### 4.4 The human gate

There is one human gate for the whole outer loop: `/rig:approve chart-<N>` covers the PRD conversion, ledger, intents, architecture,
ADRs, test plan, cases, data, holdouts, **and the UI design**, all hashed together, as today. The approval page gains a design
section:
- the chosen direction, with the alternatives the designer rejected and why;
- one screenshot per mockup at two breakpoints (mobile and desktop);
- the screen-state table;
- the agent-proposed UX criteria under "agent supplied".

One of the three check questions may come from design, for example an agent-proposed brand. `design/` becomes a CODEOWNERS path,
so a designer or the product owner can review it on the chart branch.

**When the approver rejects the design**, the redo matches what was rejected:
- **The look** (palette, type, mockups): `/rig:chart <N> --redo look "<what to change>"` reruns only the designer's look files,
  then the chart check, screenshots and evaluator. The intents, architecture and test plan are untouched, so their hashes still
  hold.
- **The structure** (a missing screen, a wrong flow or state): this changes the UX criteria, so it goes through the normal
  chart re-run from the ledger, exactly as a changed requirement does today.

Approving freezes `design-system.md`, `tokens.css` and the mockups by hash with the rest of the chart. A later token change is an
amendment that shows in the PR and needs a person.

## 5. Inner loop (one `kind: ui` intent)

| Stage | What changes |
|---|---|
| `/rig:start` | Behaviours cite `UX-n.m` and name the screen and state (settled at chart, so no questions) |
| `/rig:plan` | `## Files` lists components and routes; `## Consumes` names the operations |
| Test writer | Component tests (Testing Library) per behaviour and state, and Playwright per flow step against the contract mock; frozen by `tests-freeze` |
| Implementer | Sonnet with the `frontend-design` skill for copy and the quality floor. The brief says to use only `tokens.css` and the design-system components, with the mockup as the target |
| `/rig:test` | The three sensors below, the component tests and the UX holdout cases |
| `/rig:pr` | Screenshots of each changed screen beside its mockup in the PR body. A person judges fidelity |

### 5.1 First three sensors, run on the built app (in a new React + Vite pack, and added to `angular`)

| Sensor | Cadence | Tool | Catches |
|---|---|---|---|
| `contract-client` | turn | client types generated from the OpenAPI contract (`openapi-typescript`), then `tsc` | the UI calling an operation or field the API lacks |
| `a11y` | commit | `@axe-core/playwright` on each screen the component or journey tests render; serious and critical findings block; `eslint-plugin-jsx-a11y` at edit | contrast, labels, ARIA (not focus order: that is the keyboard journey's job) |
| `states` | commit | a built-in: each matrix state of a touched screen has a test that names it (`UX-1.1 empty`) | the forgotten empty or error state, the most common agent UI miss |

### 5.2 Holdout UX cases need a runner change

Today one `holdout` command runs each case file from the repo root, with a 300 s timeout and no app launch
(`scripts/holdout.ts:34-45`). Playwright cases need a per-app command with a launcher (start the app on `PORT=0`, as the
`/rig:app` Node helper already does). Cases use only roles and visible text, from `ux.md`.

## 6. Two apps in one repo

The minimum, within the harness size cap (13,000 lines after seven raises, `scripts/size.spec.ts:40-43`), is to compose packs, not
add `apps[]`:

- `init` detects a marker per directory (`pyproject.toml` at `api/`, a `package.json` with `vite` at `web/`) and merges both packs
  into the one sensor list, with ids prefixed (`web:lint`), commands run as `cd web && …`, and a path glob per sensor so
  `{changed}` is filtered to it.
- `stack` stays one string, and the layering rules come from the UI pack only for `web/**`.
- This also answers the companion's single-stack code map: `sdlc map` runs once per composed pack root.
- A real `apps[]` registry waits until composed packs show a failure it would fix.
- Separate API and UI repos work today, one rig per repo with the contract file copied. The cross-repo contract freeze is still
  open.

## 7. Cost (estimates, to be measured)

| Step | Model | Extra per sprint |
|---|---|---|
| Directions, self-review and design system (first sprint) | Sonnet | $2–4 |
| A `--redo look` after a rejection | Sonnet + `evaluate` | $2–5 each |
| `ux.md` + one mockup per screen (5–8 screens) | Sonnet | $3–8 |
| Design categories inside the one chart review, with 10–16 screenshots | `evaluate` (Fable 5.2 or Opus) | $1–3 |
| Sensors, screenshots | none | zero tokens |

So $5–15 per sprint on top of today's chart. The UI eval task (§8) measures it.

## 8. Order of work: measure, then the smallest slice

The companion roadmap and GOAL.md rule 4 put measurement before more features, so:

| Step | Change | Gate |
|---|---|---|
| U0 | Add one UI task to the Phase 1 eval set: an API endpoint plus one screen, with a hidden Playwright acceptance test and two seeded traps (a forgotten error state, a UI field the contract lacks). Run the bare arms | Do the bare arms miss a trap? If not, stop here |
| U1 | Traceability: PRD `## Experience`, `UX-n.m` ledger rows, `kind: ui` with `Screens:` and `Consumes:`, the integration intent | Deterministic, cheap |
| U2 | Designer in chart step 2 (no questions; directions chosen by self-review), `--redo look`, `design-system.md`, `tokens.css`, `ux.md`, one mockup per screen, the chart check, screenshots on the approval page | One extra Sonnet launch per chart |
| U3 | Composed packs, a React + Vite pack, the three sensors, the holdout launcher | Re-run the UI task on the rig arm |
| Later, only on a measured miss | `visual` baselines (from one pinned Linux CI container, since fonts differ by OS), mockup accessibility, size tokens, Web Vitals, the PR drift pass by the evaluator, the chart-level contract freeze for parallel lanes, `apps[]` | Each needs a miss it would have caught |

Each step follows CLAUDE.md: one Sonnet implementer per group of files, `npm test` once, one review, and a spec that fails without
the fix. The journey gains a two-app fixture (a tiny API plus a Vite UI), with one bad snapshot per new check.

**Not covered yet, named so they are not forgotten:** auth and session screens and role-gated screens from the `web` rows of
`## Access`; form validation matching the API's; API error codes mapped to UI messages (make it a `ux.md` column); i18n and RTL;
dark mode; keyboard-only journeys; responsive checks in the built app; a browser matrix; deterministic seed data, fonts, clock and
animation for screenshots.

## 9. Decisions for you

- **D1 Plugin.** Install `frontend-design` alongside rig (recommended), or vendor it, which Apache-2.0 allows with notice but which
  then drifts from Anthropic's updates.
- **D2 Mockups.** Static HTML from `tokens.css` (recommended: it renders in CI and a person sees it in a browser), or Figma over MCP
  (closer to designers' tools; needs a seat; not checkable in CI).
- **D3 First UI stack.** React + Vite (recommended, most common), or Angular first, since its pack exists.
- **D4 Owner of `design/`.** A designer or the product owner as code owner, or the architect.

## 10. Independent review

Fable 5.2 read the first draft and the repo, read-only, and returned `changes-needed` with 16 findings. Applied:
- the designer moved into chart step 2, before the architect. The reviewer suggested a direction checkpoint mid-chart. The owner
  ruled it out on 2026-11-14: the design is approved with everything else at the one chart gate. Look and structure are therefore
  separate files, and `--redo look` reruns only the look;
- the order of work is now measure-first, with U0 as a kill gate;
- `apps[]` replaced by composed packs, within the size cap;
- the contract freeze is described correctly (today at plan approval) and the chart-level freeze is named as new work;
- OpenAPI required for consumed contracts;
- the holdout runner's limits stated;
- visual baselines deferred, and mockup fidelity left to a person;
- UX criteria marked as agent-proposed when the PRD has none;
- screenshots cut to one state at two breakpoints;
- an explicit integration intent added;
- the mockup token and axe checks cut back, and no evaluator categories that duplicate scripts;
- CSS variables instead of W3C JSON;
- existing pieces credited (attachments, `models.design`, the Angular layers, `ng build` budgets);
- costs raised to $5–15 per sprint;
- brownfield, walking skeleton and the uncovered areas added.

The reviewer could not fetch the upstream plugin, so §2 rests on the separate read of its five files.
