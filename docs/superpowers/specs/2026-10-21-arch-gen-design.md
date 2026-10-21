# Architecture made executable: `arch` (Phase 1, item 1.1)

Status: draft for approval, 2026-10-21. Source: `docs/proposals/2026-10-21-harness-readiness-consolidated.md` item 1.1 and principle 2.
Nothing is built. Calls I made are marked **[my call]**; the person decided two things in the conversation (below).

## Intent

rig's `layering` sensor is switched on but inert: no pack or `init` sets `options.layers` (Phase 0.1 now says so in `status` and `check`).
`architecture.md` is prose that nothing reads, and the pack analysers (`depcruise`, `lint-imports`) run only when a person wrote
their config. Sources agree that a rule an agent cannot break beats one it should follow: Böckeler saw layering violations in the
first pass and then self-correction once a sensor existed; OpenAI and Dune make the bad dependency impossible rather than discouraged.
This change lets a repo declare its dependency direction once, have a person approve it, and have the existing checks enforce it.

## Decided by the person

- **Propose, then approve.** For an existing prose `architecture.md`, rig proposes the layer block and a person approves it. Rig does not enforce a block nobody approved.
- Work is sequenced Phase 0 then Phase 1; this is the first Phase 1 item.

## Goals

- One declared source of truth for layers: a short block in `.rig/product/architecture.md`.
- Edit-time enforcement through the built-in `layering` sensor (language-free, diff-level), and commit-time enforcement through the stack's real analyser, both generated from the same approved block.
- A violation message says what is wrong, the fix, and an example path to copy.
- A brownfield repo with existing violations is not red on day one: only new violations block.
- The model cannot loosen the rules by editing the block or the generated files.

## Non-goals and anti-goals

- No new analyser: generate config for `depcruise` and `lint-imports`; run them as they are.
- No inferring layers and enforcing them without a person. A proposal that is never approved enforces nothing and says so.
- Not a code generator or scaffold (1.4, 1.6), not scope checking (1.3), not Java/ArchUnit in this change **[my call: needs the person's yes]**.
- Anti-goal: a block that looks enforced but is not. Every state (none, proposed, approved, drifted) is named in `status`.

## The block

In `architecture.md`, under `## Layers`, one fenced block. Plain lines, no YAML (the vendored checker has no dependencies):

````
```rig-layers
layer domain  src/domain/**
layer app     src/app/**
layer infra   src/infra/**
allow app   -> domain
allow infra -> domain, app
forbid domain -> express, pg
example domain src/domain/ports/clock.ts
```
````

- `layer <name> <glob>`: a layer. The layer's *token* is the last path segment before the glob (`src/infra/**` -> `infra`); tokens must be unique.
- `allow A -> B, C`: A may import only B and C (and itself). A layer with no `allow` line may import no other layer. Allow-lists must not form a cycle.
- `forbid A -> x, y`: A must not import these external names (a framework or driver). Maps onto the `layering` sensor's `mustNotImport`.
- `example <layer> <path>`: optional exemplar named in the fix text.
- Code outside every layer is unconstrained and listed by `arch gen` as "not in any layer", never silently ignored.

## Parts

1. **`scripts/arch.ts`** (new, about 150 lines, vendored): `parseLayers(text)` and `validateLayers` (unique tokens, globs match real directories, no cycles, unknown layer names), `deriveLayering(layers)` giving `{ from, mustNotImport, why }[]` for the sensor, and `renderDepcruise(layers)` / `renderImportLinter(layers)` for the packs.
2. **Commands** (`sdlc.ts arch ...`):
   - `arch propose`: deterministic scaffold only. It lists the top-level source directories and the imports already between them (from the wiki index or a plain scan) so the proposer has facts. It writes nothing enforceable.
   - `arch gen`: parse and validate the block in `architecture.md`, print the derived rules and the files in no layer, and show what already violates. It writes only under `.rig/gen/` when an approval exists.
   - `arch approve` (person only, `SDLC_HUMAN=1`, like `approve` and `waive`): records `.rig/layers.approved.json` = `{ by, at, blockHash, layers }`, writes `.rig/gen/*` and the known-violations baseline.
   - `arch lint`: runs the stack analyser with the generated config, or prints `layers: not configured` and exits 0 (so 0.1's status names it).
3. **`skills/arch/SKILL.md`** (`/rig:arch`): the model-facing step. It reads `arch propose`, drafts the block into `architecture.md`, and stops at "ask the person to run approve". It cannot approve.
4. **Sensor wiring** (`scripts/sensors.ts`): `layering` reads layers from `.rig/layers.approved.json` (plus any hand-written `options.layers`, which still wins on conflict). It never reads `architecture.md`.
5. **Pack wiring** (`templates/stacks/{node,angular,python}.json`): the `layers` command sensor becomes `node .rig/bin/sdlc.ts arch lint`, which picks the analyser by stack. Repos already initialised keep their old command; `arch approve` prints the one-line change to make.
6. **Protection**: `.rig/layers.approved.json` and `.rig/gen/**` join the protected list, so the harness-tamper sensor and CODEOWNERS treat them like `sensors.json`.

## States and drift

| state | `status` shows | enforced |
|---|---|---|
| no block | layers: not configured | nothing |
| block, not approved | layers: proposed, awaiting approval | nothing |
| approved, block unchanged | layers: approved by <who> <date> | edit and commit |
| approved, block changed after | layers: block differs from approval | the old approved rules, plus a warning |

The last row is the point of the hash: editing `architecture.md` can only start a new proposal, never relax what is enforced.

## Generated output

- **node / angular**: `.rig/gen/dependency-cruiser.cjs` with one `forbidden` rule per disallowed layer pair, each with `comment` = the why, the fix sentence the sensor already uses, and the `example` path. Run as `depcruise src --config .rig/gen/dependency-cruiser.cjs --ignore-known .rig/gen/known-violations.json`. A team's own `.dependency-cruiser.*` is never touched.
- **python**: `.rig/gen/importlinter.ini` with `forbidden` contracts, used when every layer glob maps to a dotted module path under the package root; otherwise `arch gen` says which layer does not map and the sensor still enforces at edit time.
- **Baseline**: `arch approve` records today's violations in `known-violations.json`. New violations block; fixing one removes its row and the file never grows (the same ratchet as `knownRed`, and the base of item 1.5).

## Acceptance

- Parse and validate specs: each rule above has a passing and a failing block (duplicate token, cycle, unknown layer, glob matching nothing).
- A fixture repo with an approved block: a domain file importing infra is rejected by `layering` at Stop and by `check --at commit` through `arch lint`; a file in no layer is reported, not rejected.
- Drift: change the block after approval; the old rules still enforce and `status` shows the fourth row.
- The model path: with `SDLC_HUMAN` unset, `arch approve` refuses; editing `.rig/layers.approved.json` is a harness-tamper block.
- Brownfield: a repo with one existing violation passes `arch lint` after approval; adding a second fails.
- Stack e2e (`tests/e2e/stacks.mjs`, node first): the generated config blocks a real violation with the real `depcruise`.
- Eval (after merge, not a gate to build): an arm on a task that tempts a layer violation, with and without the approved block, scored by violations reaching the PR.

## Left to the builder

Exact command output wording, the file layout inside `.rig/gen/`, how `propose` scans imports (reuse the wiki index if it is warm), the Python mapping details, and splitting the work into tasks. Keep `arch.ts` near the 150-line estimate; the scripts cap rises with a dated note, as every feature has done.

## Open for the person

1. Java/ArchUnit stays out of this change and follows as its own item: yes or no.
2. Python in this change, or node and angular first and Python next: I lean node and angular first.
