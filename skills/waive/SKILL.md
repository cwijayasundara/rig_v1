---
name: waive
description: Human only. Waive a sensor finding for the active change. The model cannot run this.
argument-hint: <sensor> <file|*> <reason>
disable-model-invocation: true
allowed-tools: Bash(SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" waive *)
---
!`SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" waive '$ARGUMENTS' 2>&1 || true`

Tell the person the result above in one line. Do nothing else.
