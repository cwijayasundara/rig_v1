---
name: build
description: Build an approved change test-first - one failing test per behaviour, then the code - on its own branch.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git checkout*), Bash(git status*), Bash(git diff*), Read, Grep, Glob, Write, Edit, Agent
---
# Build a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S status --json`. The change (`$0` or the active one) must be at `build`. At `approve`, stop: a person approves first.
2. If HEAD is the trunk, run `git checkout -b sdlc/<slug>`.
3. For each behaviour in spec.md, in order:
   - Write the test that names its B-number.
   - Run it with `S run --expect-fail -- "<test command>"` and see it fail.
   - Write the code.
   - Run `S run -- "<test command>"` and see it pass.
   Touch only the files plan.md lists. If another file must change, add it under `## Decisions` in plan.md and tell the person, who re-approves.
4. The hooks run the sensors after each edit and at the end of each turn. Fix what they report. Never weaken a test, a sensor or a contract file.
5. For a large plan, run at most one `general-purpose` agent with model `sonnet` per independent group of files, in the foreground, each with a brief of at most 60 lines: the behaviours, the files and the test command.
6. When every behaviour has a passing test, continue with `/rig:test <slug>` in this turn.
