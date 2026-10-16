---
name: approve
description: Human only. Approve a gated sdlc artifact. The model cannot run this.
argument-hint: <slug> <design|spec|plan|impact|budget|full-route|tier S|M|L [type]>
disable-model-invocation: true
allowed-tools: Bash(SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve *)
---
!`SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve '$ARGUMENTS' 2>&1 || true`

Tell the person the result above in one line. Do nothing else.
