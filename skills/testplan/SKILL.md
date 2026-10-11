---
name: testplan
description: Write the sprint's test plan, test cases and test data (.rig/product/testplan/) from its PRD and intents, each case traced to a requirement and an intent. For the test lead; /rig:chart runs it for you.
argument-hint: <.rig/product/prd/sprint-N.md>
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git *), Read, Glob, Agent
---
# Test plan for $0

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read; one-line commit messages.

1. Read `$0`; its frontmatter `sprint:` is N. Without a whole-number `sprint:`, stop and say so.
2. Launch one `rig:architect` agent in the foreground, model `sonnet`, effort `medium`, with the `## Brief` below ($0 filled in).
3. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart check N`. If `untested`, `orphanCases` or `missingData` is not empty, launch the agent once more with the Brief plus that list; then check again and show the result.
4. Commit `.rig/product/testplan/` on branch `rig/chart-N`: `chart: test plan for sprint N`.

End with: `Next: review the chart, then /rig:approve chart-N`.

## Brief
Chart work, not a change: write only under `.rig/product/testplan/` (this overrides the change-folder rule). Never edit source code.
Inputs: the PRD `$0`, `.rig/product/architecture.md`, the intents in `.rig/intent/` with `sprint: N`, the existing test plan, and `levels` in `.rig/sensors.json`. Format: `${CLAUDE_PLUGIN_ROOT}/templates/testplan-format.md`.
- Update `plan.md` and `cases.md`; keep earlier sprints' cases; delete only cases of requirements the PRD retired.
- Every FR and NFR id of the PRD has at least one case; each case names exactly one intent of this or an earlier sprint.
- NFR cases are `perf` or `security`, or `manual` with the reason in `Expected`.
- Data files go under `data/`, synthetic only (no real personal data), small; `Data` paths are relative to `.rig/product/testplan/`.
Reply in 15 lines or fewer: case count per level, data files, requirements you could not test and why.
