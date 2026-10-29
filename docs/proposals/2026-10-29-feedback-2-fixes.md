# Feedback 2: the six observations, checked, and what to change

Source: `docs/feedback/feedback_2.html` (shop cart, sprints 0-1, 28-29 Oct 2026). Each point was checked against the code at
`3549bcd`. Verdicts: real, partly fixed already, or real by design.

## Verdicts

| # | Observation | Verdict | Evidence |
|---|---|---|---|
| 1 | Suggest superpowers at `/rig:init`; if declined, warn, do not error | **Real** | `init` never mentions superpowers. `vendor.ts:233` force-enables `superpowers@claude-plugins-official` in `.claude/settings.json`, which turns it on but does not install it. `start`, `plan` and `chart` call `superpowers:brainstorming` with no fallback. The report's "3 list-items false starts while superpowers was disabled" is this. |
| 2 | `/rig:chart` with no argument should find the next sprint and a new PRD | **Real, half done** | `skills/chart/SKILL.md` step 1 already says N defaults to the next sprint and falls back to `docs/prd/sprint-<N>...`. It is prose the model carries out; no script computes it, so it works "most of the time". `argument-hint` still marks the argument required. |
| 3 | `pr-outline.md` piles up untracked | **Already fixed, not yet in the tester's repo** | `changes/*/pr-outline.md` was added to `GITIGNORED` in `d602e87` (28 Oct 20:36 UTC), after the tester's list-items run. `ensureGitignore()` runs on `pr`, `new` and `learn`. Repos with older `.rig/.gitignore` get it on their next of those commands; `/rig:upgrade` should also call it. |
| 4 | Dashboard prints the long intent path, not the slug | **Real** | `chart.ts:256` and `:267` build `start /rig-start .rig/product/sprints/sprint-N/intents/<slug>.md`. The path is needed today because a bare slug in `start` step 1 creates a plain change with no `--source`, losing the charted B-numbers. |
| 5 | `/rig:start` asks too many questions (20 over 2 sprints, was 1) | **Real, mostly by design, and partly fixed** | See below. |
| 6 | Decision making shifted from BA to developer | **Real, and it is the cause of #5** | See below. |

## Questions: what happened

Per slug (sprint 0): walking-skeleton 4, widen-lint 2, cart-store 5, add-item 3, list-items 4 = 18. Sprint 1:
remove-items 2, update-item 0 = 2.

- **Before 27 Oct** `start` ran `superpowers:brainstorming` as "collaborative": 1 question in the earlier test.
- **27 Oct, `32ca10f` (P2 "grill")** made it adversarial on purpose: *one question at a time, challenge each answer (edge cases,
  failure behaviour, out of scope, who is hurt)*. This is where 18 questions came from. Sprint 0 ran on it.
- **28 Oct 20:50 UTC, `45bc6e9`** changed it to one batch of at most 4, a second batch only for a question the first answers
  created. Sprint 1 (29 Oct) ran on it: 2 questions. So the count already fell 9x with no further change.
- Two gaps remain. `start`'s `allowed-tools` has no `AskUserQuestion` (chart has it), so the batch may be asked as numbered text
  or one at a time. And `superpowers:brainstorming` itself says "ask the clarifying questions that matter" with a per-path
  ceremony; the batch rule is one line in rig's text against a long skill.

Why a developer was asked at all: the report's three bugs are all questions nobody asked at chart time. Concurrency
(`last-writer-wins`, ADR 0002), the cart file being a symlink, and `--name --json` taking `--json` as the name. The
grill at `start` asks exactly those edge-case questions, one slice at a time, to whoever runs `/rig:start`, who is the developer.
The BA/architect saw the PRD once, answered one chart batch, and never saw the edge cases. Worse, the answers are not shared:
a decision made in `start` for `cart-store` is not seen by `add-item`, so a similar question comes back.

## Proposal

Principle: decisions about behaviour are asked once, at chart, to the person who owns the PRD. `start` asks only what its own
intent cannot answer.

### F1. Move the grill upstream, into the chart's gap pass (the real fix for #5 and #6)
After the architect returns, the chart already puts its open questions in one `AskUserQuestion` batch. Add a fixed checklist
the gap pass must answer *per intent*, and ask it in that batch (up to 4 per batch, repeated, cap 8 per sprint, recommended
answer first so "accept all" is one reply):
concurrency and ordering, file and path edge cases (symlink, missing, unreadable), option parsing (value-taking flags given another
flag), and failure exit codes. Each answer lands in the intent as a numbered behaviour or under `## Out of scope`.
Automate the rest: every checklist item gets a default from the PRD, the brief and the stack pack. Items whose default cannot
change an expected value, a security boundary or the risk tier are recorded as `default accepted` with no question. Only the
rest are asked. Human input stays, because the person owns the PRD, but it is one short batch at the one gate, never zero and
never per slug.
Effect: the three report bugs are caught where they were born, and `start` finds the answers already in `spec.md`.

### F2. `start` for a charted intent: no questions unless a gap is left
If the intent has every behaviour cited, `## Out of scope` and `## Open questions: none`, step 2 skips the conversation: write
`spec.md`, run `S weight`, go on. Ask (one batch, at most 4) only for what the intent file lists as open, each `C<n>` carried
item, or a conflict between intent and code found by the wiki recon. Free-text `/rig:start "<request>"` keeps the full grill:
there the developer is the owner.
Target: 0-2 questions per charted slug, measured by the report's own column.

### F3. Make the batch real
Add `AskUserQuestion` to `skills/start/SKILL.md` `allowed-tools`. Add a spec asserting every skill that says "one batch" lists
the tool. Record questions asked per `/rig:start` in the change's gate log so the report column is counted by a script, not by
reading transcripts.

### F4. Superpowers at init (decided: use the plugin, no inline copy)
- `init` checks `~/.claude/plugins/installed_plugins.json` and the project's `enabledPlugins`. If missing, it offers one
  `AskUserQuestion` (install now / later), prints the install command and never installs silently. Recommended: install.
- No `superpowers: false` mode and no inline replacement of brainstorming: rig keeps calling `superpowers:brainstorming`.
- If the person declines or the plugin is absent, `start`, `plan` and `chart` do not call the missing skill. They print one
  warning line (`superpowers is not installed: running without the brainstorm; install: <command>`) and carry on with only what
  rig's own text already says (one question batch, then write the file). No "skill not found" error, no second copy of the skill.
- `vendor.ts:233` keeps enabling the plugin in settings.
- Spec: with the plugin absent, `start-brief` emits a warning, not an error.

### F5. Chart sprint resolution in a script
Add `S chart next`: prints the next sprint number and the PRD path it found (`sprint-<N>/prd.md`, `docs/prd/sprint-<N>...`),
or `none`. The skill reads it instead of reasoning. `argument-hint` becomes `[sprint | path]` with no argument allowed; with
two new PRDs it asks one question, otherwise it goes.

### F6. Dashboard: slug in, path resolved
Make step 1 of `start` resolve a bare `<slug>` that matches a charted `intents/<slug>.md` (when no `.rig/changes/<slug>/`
exists) to that file and use `--source`. Then `chart.ts:256,267` print `/rig-start <slug>`. Spec: bare slug of a charted
intent produces a change with the intent's B-numbers.

### F7. Housekeeping
`/rig:upgrade` and `S new` already reach `ensureGitignore()`; add a spec that an old `.rig/.gitignore` gains
`changes/*/pr-outline.md` on upgrade, and tell the tester to run `/rig-upgrade`. No other change.

## Order and cost
F3 and F6 are small (one wave). F1+F2 are the change that matters and need a live run on the cart repo to confirm
bugs 1-3 are asked at chart and that `start` falls to 0-2 questions. F4 and F5 are one wave each. Per repo
`CLAUDE.md`: one review of the final diff, Opus on Sonnet output, no per-task review pairs.

## Not recommended
Cutting the grill for charted intents entirely (F2 without F1): that returns to 1 question and to the 3 bugs.

## Decided (2026-10-29)
1. Cap of 8 chart-time questions per sprint: yes. Goal is as automated as possible with little human intervention, but never
   zero: the chart batch and `/rig:approve chart-N` stay (a dark factory still has an owner).
2. Free-text `/rig:start "<request>"` keeps the full grill: yes.
3. Superpowers is used as is, not reimplemented: no config flag, no inline fallback (F4 above).
