---
name: approve
description: Human only. Approve a change (its spec.md, plan.md and contract files), a sprint chart (chart-N, which covers a converted PRD too), the dependency layers (arch) or an app's journeys (app <name>). The model cannot run this.
argument-hint: <slug | chart-N | arch | app <name>>
disable-model-invocation: true
allowed-tools: Bash(SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve *), AskUserQuestion, Skill
---
!`SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve '$ARGUMENTS' --ask 2>&1 || true`

If the result above starts with `ASK`, no argument was given: name the target in one `AskUserQuestion`.
- `ASK change <slug>`: options "Approve and build" (first, the default), "Only approve", "Cancel".
- `ASK chart-<N>`: no change is in flight, so ask about the chart: options "Approve chart-<N>" (first), "Cancel". Say what the approval covers, in reading order: for a converted PRD, `prd.md` beside `source.md` and `conversion-review.md`; then `requirements.md`, the intents, the test plan and `chart-review.md`.
- `ASK none ...`: say so in one line and stop.
**A chart (`chart-<N>`)** is approved from one generated page with one decision: approve or not approved. The command above regenerates `.rig/product/sprints/sprint-<N>/approval.md`, prints its `page sha` and never approves (after a bare `/rig:approve` and an `ASK chart-<N>` yes, run it with `chart-<N> --ask` to get the sha). Show the person that path ("read this page; the bundle is the evidence"; its `## Look at first` list is reading, not questions), then ask ONE `AskUserQuestion` with a single question `[page sha <first 12 characters>] Approve chart-<N>?` and exactly two options, `Approve chart-<N>` and `Not approved: I will fix it`; never ask anything else, never answer for the person and never write an answers file (a hook records the choice, and denies you that file). Only the exact `Approve chart-<N>` option approves. On it, run `SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve chart-<N>` as its own Bash call and tell the person the result in one line. On anything else, stop with one line: nothing was recorded; they correct the chart (or `/rig:waive` a finding) and run `/rig:approve chart-<N>` again. Editing `approval.md` or what it is built from makes an approval stale.

For a change, run `SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve <slug>` as its own Bash call and tell the person its result in one line. After "Approve and build" succeeds, invoke `/rig:build <slug>` with the Skill tool. On Cancel do nothing.

A change with an `intent-map.md` approves it and its `freeze.json` (the scenario hashes) with spec.md and plan.md; a refusal names the rule id (`unmapped-said`, `both-ways`, `behaviours-drift`), and a later edit of either file makes the approval stale.

`arch` approves the layers block proposed in `architecture.md`, and `app <name>` approves that app's journeys after one more driver run: neither is asked about, the person typed the target. Run it as above, tell the person the result in one line and stop.

Otherwise tell the person the result above in one line. Do nothing else.
