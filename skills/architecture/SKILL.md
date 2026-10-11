---
name: architecture
description: Refresh the product's living architecture (.rig/product/architecture.md and ADRs) from a sprint's PRD. For the architect at the start of a sprint; /rig:chart runs it for you.
argument-hint: <.rig/product/prd/sprint-N.md>
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git *), Read, Edit, Write, Glob, Agent, AskUserQuestion
---
# Architecture for $0

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read; one-line commit messages.

**Models:** read `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart routes --json` and pass its `architect` route (`model` and `effort`) to the architecture and intents launch and its `testplan` route to the test plan launch, `rig:architect` in both. A `main` route means draft it in this thread.

1. Read `$0`; its frontmatter `sprint:` is N. Without a whole-number `sprint:`, stop and say so.
2. Launch one `rig:architect` agent in the foreground with the `architect` route, with the `## Brief` below ($0 filled in).
3. Relay its open questions with its recommended answers; record the person's answers in `architecture.md` under `## Decisions` (or the ADR) and leave `## Open questions` as `none`.
4. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart check N` and show it.
5. Commit `.rig/product/` on branch `rig/chart-N` (create it from the trunk if needed): `chart: architecture for sprint N`.

End with: `Next: /rig:decompose $0` (or `/rig:approve chart-N` once intents and the test plan are in and reviewed).

## Brief
Chart work, not a change: write only under `.rig/product/` (this overrides the change-folder rule). Never edit source code.
Inputs: the PRD `$0`; the previous `.rig/product/architecture.md` and `.rig/product/adr/*.md` when they exist;
`.rig/wiki/architecture.md` (as built) when it exists; `CLAUDE.md`. Format: `${CLAUDE_PLUGIN_ROOT}/templates/architecture-format.md`.
- Write `.rig/product/architecture.md` (≤ 200 lines, frontmatter `sprint: N`, `updated:` today).
- Sprint 0: design from the PRD's `## Integrations and constraints` and `## Non-functional requirements`; keep it to what this sprint needs.
- Later sprints: keep what exists; change only what `## Changes since last sprint` requires.
- Each new or reversed decision is a new ADR `.rig/product/adr/NNNN-<kebab>.md` (next number, `status: accepted`); a reversed ADR gets only `status: superseded-by NNNN`.
- Every NFR id appears under `## Quality attributes` with a tactic and how it is verified.
- Each gap between the intended and the as-built architecture is a `## Concerns` bullet `- [drift] <gap> → owner: <architect named in the PRD>`.
- Leave `## Open questions` as `none`: put questions in your reply, each with your recommended answer.
Reply in 15 lines or fewer: files written, key decisions, ADR numbers, open questions.
