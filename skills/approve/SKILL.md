---
name: approve
description: Human only. Approve a change (its spec.md, plan.md and contract files), a converted sprint PRD (prd-N) or a sprint chart (chart-N). The model cannot run this.
argument-hint: <slug | prd-N | chart-N>
disable-model-invocation: true
allowed-tools: Bash(SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve *), AskUserQuestion, Skill
---
!`SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve '$ARGUMENTS' --ask 2>&1 || true`

If the result above starts with `ASK`, no argument was given: name the target in one `AskUserQuestion`.
- `ASK change <slug>`: options "Approve and build" (first, the default), "Only approve", "Cancel".
- `ASK prd-<N>`: a converted PRD waits: ask about it, options "Approve prd-<N>" (first), "Cancel"; say to read `prd.md` beside `source.md` first.
- `ASK chart-<N>`: no change is in flight, so ask about the chart: options "Approve chart-<N>" (first), "Cancel".
- `ASK none ...`: say so in one line and stop.
Then run `SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve <target>` as its own Bash call and tell the person its result in one line. After "Approve and build" succeeds, invoke `/rig:build <slug>` with the Skill tool. After approving `prd-<N>`, the next step is `/rig:chart <N>`. On Cancel do nothing.

Otherwise tell the person the result above in one line. Do nothing else.
