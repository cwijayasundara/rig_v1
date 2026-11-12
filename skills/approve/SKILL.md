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
**A chart (`chart-<N>`)** is approved from one generated page. The command above regenerates `.rig/product/sprints/sprint-<N>/approval.md`, prints its `page sha` and the check questions (1 to 3, numbered), and never approves (after a bare `/rig:approve` and an `ASK chart-<N>` yes, run the same command with `chart-<N> --ask` yourself to get them). Show the person that path ("read this page; the bundle is the evidence behind it"), then put every question to them in one `AskUserQuestion`: free text through Other, no "skip" option, each question starting with the marker `[page sha <first 12 characters>] ` and then its text as listed; never answer one yourself and never write an answers file (a hook records what the person answers, and denies you that file). Then run `SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve chart-<N>` as its own Bash call. It refuses when the answers are missing, belong to another version of the page, or hold a blank, `skip`, `n/a` or under-10-character answer, naming the question: ask again. It prints every question and answer it stores; editing `approval.md` or anything it is built from makes the approval stale.

For a change, run `SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve <slug>` as its own Bash call and tell the person its result in one line. After "Approve and build" succeeds, invoke `/rig:build <slug>` with the Skill tool. On Cancel do nothing.

A change with an `intent-map.md` approves it and its `freeze.json` (the scenario hashes) with spec.md and plan.md; a refusal names the rule id (`unmapped-said`, `both-ways`, `behaviours-drift`), and a later edit of either file makes the approval stale.

`arch` approves the layers block proposed in `architecture.md`, and `app <name>` approves that app's journeys after one more driver run: neither is asked about, the person typed the target. Run it as above, tell the person the result in one line and stop.

Otherwise tell the person the result above in one line. Do nothing else.
