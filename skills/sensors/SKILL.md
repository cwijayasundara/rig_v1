---
name: sensors
description: The sensors node - lint, types, dependency audit, coupling, complexity, security and performance compared with the base branch, plus the built-in sensors; one fix round.
argument-hint: <slug>
effort: low
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Read, Agent
---
# Sensors $0

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read and Grep; one-line commit messages.

**Models:** read `routes` from `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts next $0 --json` and pass that role's `model` and `effort` on every launch: `rig:architect` (architect), `rig:implementer` (implementer), `rig:reviewer` (`slice-review` in build, `reviewer` elsewhere). A `main` route means draft it in this thread. After a failed round, run that command again before the fix launch: the implementer route can rise.

**Subagents:** run them in the foreground and wait; never end your turn while one is running.

1. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts quality $0`. It runs each declared category on the branch and on the base, the built-in sensors and the test-count invariant, and records the round.
2. **Exit 0:** the node is done. **Exit 2:** read the findings.
   - `regressed` or a built-in block: send only those findings to one `rig:implementer` run (plan files only), then run step 1 again.
   - `fail` (a tool missing or broken on this branch): stop and show it. The person installs the tool or adds what it needs (a lockfile, a config). Never edit `.rig/sensors.json` in the change, and never offer that as a fix: the ship gate refuses a weakened harness from a PR. A command that is wrong for the repo is changed on the trunk as its own commit, then this branch is rebased.
   - `unmeasured (broken on the base too ...)`: the tool fails before this change; report it once, it does not block.
   - `blocked`: stop and show the reason.
3. `unmeasured` categories are reported, never passed: mention them once in your summary.

End with: `Next: <command from node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts next $0 --json>`. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts skill next` and follow it.
