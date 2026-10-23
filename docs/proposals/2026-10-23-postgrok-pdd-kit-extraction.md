# What rig takes from postgrok and pdd-kit (2026-10-23)

Sources: https://postgrok.com/concepts/ (the coding-agent pages from the Poteto software-factory talk) and https://pdd-kit.dev/docs
(pdd-ideate, pdd-verify, pdd-map, product model). Rule for this list: rig stays thin. An idea is taken only when it closes a gap
rig has today, fits in an existing skill, script or template, and can be proven by a spec or an eval. Neither source reports a
measured result, so each item ships with the check that shows it earns its place.

## Already in rig (nothing to do)

| Idea | Source | Where rig has it |
|---|---|---|
| Verification skill: drive the running app | postgrok agent-verification-skill | `app` journeys (2.1) |
| Turn repeated failures into environment constraints | postgrok environment-and-constraints | `learn` ladder, `rule`, `arch`, ratchets |
| Trust ladder, chef tastes at two places | postgrok trust-ladder, michelin-kitchen | autonomy rung, two human gates |
| One-way doors | postgrok verifiability-and-one-way-doors | `guides/irreversible.md`, production gate |
| Drift from the design is a conversation | pdd-kit verify (code-right / model-right) | `/rig:pr` `design` findings, doc-wrong left open |
| Stop instead of looping on the same gap | pdd-kit verify re-check | `/rig:pr`: one review; same check fails twice → stop |
| Typed, parsed output at the boundary | postgrok structured-outputs | review.md fixed line format, parsed by `learnmine.ts` |

## Take (three changes, in this order)

### 1. Two more review outcomes: `unmapped` and `unverifiable` (size S, text only)

Gap: the reviewer drops what it cannot verify, and flags code that breaks a non-goal, but has no word for behaviour that no
intent, spec or design line describes (quiet scope creep). pdd-kit names both.
- `templates/review-brief.md`: add category `unmapped` (code does something intent/spec/design never describes: name it and the
  doc line that would cover it) and a `## Unverifiable` section (what reading cannot settle, and what would: a journey, a live
  config, a test). Unverifiable never blocks the verdict.
- `skills/pr/SKILL.md` step 3: `unmapped` joins the category list; triage either fixes (remove the behaviour) or keeps it open
  like a doc-wrong `design` finding (the doc must gain the line, via a chart edit). Never self-dismissed.
- `scripts/learnmine.ts`: count `unmapped` like any category, so repeated creep can earn a rule.
- Proof: `reviewbrief.spec.ts` and `prskill.spec.ts` assert the text; `learnmine.spec.ts` counts the new category. Eval: the clean-
  context review eval (2.2) gains one seeded fixture with unrequested behaviour; the reviewer must report it as `unmapped`.

### 2. Who may do what, checked both ways (size M)

Gap: nothing in rig records access rules; `templates/REVIEW.md` only says "authn/authz on every new endpoint". pdd-kit's rule:
permissions live in one place, every grant is checked as enforced, everyone else is checked as refused, an action nobody may
take is refused to all, and each interface is checked separately (shared backend code proves nothing about web vs API).
- Design doc (`templates/architecture-format.md` design section): optional `## Access` table, one row per action:
  `action | allowed roles (or "nobody") | interfaces`. Optional, so apps without users pay nothing.
- `scripts/chartcheck.ts`: when `## Access` exists, every row is well formed and every action names a charted intent.
- `templates/testplan-format.md` + `/rig:testplan`: each row yields one allowed case and one refused case per interface.
- Reviewer brief: a change touching an action in `## Access` is checked against its row (category `security`).
- Proof: a chartcheck spec for a bad row; a testplan spec that one row with two interfaces yields four cases. Eval: add an
  owner-only action to the `rules` variant's hidden acceptance (a refused case) and compare runs with and without the table.

### 3. Learn from the person's corrections in session transcripts (size M)

Gap: `learn mine` reads only review findings and waivers. A correction the person types mid-session ("no, don't mock the DB")
never reaches the ladder unless a reviewer happens to repeat it. postgrok skills-as-process: past chats record the real process;
the second time you ask for the same thing, encode it.
- `scripts/learnmine.ts`: `learn mine --transcripts` reads this repo's `~/.claude/projects/<repo>/*.jsonl`, keeps only the
  person's own typed turns (no tool results, no pasted blocks, no hook output), drops turns over 400 chars, redacts secret-shaped
  strings, writes `.rig/learn/corrections.json` (turn text, session id, date). Never sent anywhere; `.rig/learn/` stays local.
- `skills/learn/SKILL.md` step 1: the model groups corrections; one seen in at least 2 sessions becomes a candidate on the same
  ladder (lesson, rule, test...). Same replay gate as today. The person still applies the proposal.
- Proof: `learnmine.spec.ts` with a fixture transcript: tool results, pasted content and a fake key are excluded; two sessions
  with the same correction produce one candidate. Eval: `eval/learn.mjs` gains a fixture where the only signal is in transcripts.

## Not taken, and why

- pdd-kit `product-model/` folder and its lint: a second spec format next to brief, architecture, design doc and intents.
- pdd-map (brownfield mapping): already a named non-goal in the 2026-10-22 design spec; revisit when init needs it. Keep its
  rule for later: tests and docs are leads only, every claim confirmed in code, gaps become questions, never guesses.
- Variations (flags, experiments): no target app uses them yet.
- Handoff packet: an intent already carries behaviour, scope and acceptance.
- Slop-code-bench (quality decays over successive changes): a sequential-intents eval is the right test of rig's whole claim, but
  it is costly; the source never read the benchmark. Revisit after item 3, as an eval, not a feature.
- Skill atrophy, cognitive offloading, AI-weekend: about people, not the harness.

## Budget

Three changes, each per CLAUDE.md: one implementer per group, `npm test` once, one review. Item 1 under $3, items 2 and 3 under
$8 each. Harness size cap (8,000 lines, `scripts/size.spec.ts`): items 1-3 together should add under 250 lines of script.
