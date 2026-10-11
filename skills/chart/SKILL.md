---
name: chart
description: Chart a sprint from its PRD in one turn - the architecture and ADRs, the sprint's intents with dependencies, and the test plan, cases and data - then stop at the one human gate (/rig:approve chart-<N>). For whoever starts a sprint; not for a single change (that is /rig:start).
argument-hint: <.rig/product/prd/sprint-N.md>
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git *), Bash(gh pr create *), Read, Edit, Write, Glob, Agent, AskUserQuestion
---
# Chart the sprint in $0

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read; one-line commit messages. Run subagents in the foreground; never end the turn while one runs. Never approve the chart yourself.

**Models:** read `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart routes --json` and pass its `architect` route (`model` and `effort`) to the architecture and intents launch and its `testplan` route to the test plan launch, `rig:architect` in both. A `main` route means draft it in this thread.

1. **Ready.** Read `$0`; its frontmatter `sprint:` is N (a whole number), else stop and say so. If its `## Open questions` lists anything, show the list and stop: the product owner answers them in the PRD first. If `.rig/sensors.json` is missing: sprint 0 → stop with `Next: /rig:init greenfield "<stack from ## Integrations and constraints>, <goal from ## Context and problem>"`, then `/rig:chart $0`; later sprints → `Next: /rig:init`.
2. **Branch.** `git switch rig/chart-N`, or `git switch -c rig/chart-N` when it does not exist.
3. **Architecture and intents, one launch.** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts skill architecture $0` and `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts skill decompose $0`. Launch one `rig:architect` with the `architect` route; the brief is the two `## Brief` sections in that order, plus: "Write the architecture first; the intents follow its building blocks."
4. **Test plan, one launch.** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts skill testplan $0`. Launch one `rig:architect` with the `testplan` route; the brief is its `## Brief` section.
5. **Trace.** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart check N --json`. One fix round at most: `uncovered`, `unreferenced`, `unknownIds` or `deps` not empty → relaunch the architect-route agent with the decompose Brief plus those lists; `untested`, `orphanCases` or `missingData` not empty → relaunch the testplan-route agent with the testplan Brief plus those lists. Then run the check once more (plain output).
6. **Questions.** Relay the agents' open questions with their recommended answers in one AskUserQuestion when a person is present; otherwise record the recommended answers under `## Decisions`. Leave every `## Open questions` as `none`.
   **Concerns are the reviewers' call.** Collect every `## Concerns` bullet in `.rig/product/` (drift and policy concerns, with their owners). Never resolve one yourself: `/rig:approve chart-N` is refused until each ends ` → resolved: <decision> (<owner>)`, written by that owner or the approver.
7. **Commit and PR.** Commit `.rig/product/` and `.rig/intent/`: `chart: sprint N`. Push and run `gh pr create --title "chart: sprint N" --body "<the check output>\n\nConcerns to resolve before approval:\n<each concern with its owner, or none>\n\nReviewers: product owner, architect, test lead. After review, one of them runs /rig:approve chart-N on this branch, commits .rig/approvals.jsonl and pushes; CI asks a code owner to approve that row."`. Do not probe for `gh` or a remote first: if the push or `gh pr create` fails, say the review is local.

End with a table of the intents (name, cluster, depends), the remaining gaps from the check, the concerns with their owners, and: `Next: review the chart, then /rig:approve chart-N`.
