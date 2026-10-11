---
name: decompose
description: Break a sprint's PRD into intents in .rig/intent/ with sprint, cluster, owner, depends and prd fields, so engineers can pick a cluster and /rig:start each intent. For the BA and architect; /rig:chart runs it for you. Not for a single idea (that is /rig:intent).
argument-hint: <.rig/product/prd/sprint-N.md>
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git *), Read, Glob, Agent
---
# Decompose $0 into intents

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read; one-line commit messages.

**Models:** read `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart routes --json` and pass its `architect` route (`model` and `effort`) to the architecture and intents launch and its `testplan` route to the test plan launch, `rig:architect` in both. A `main` route means draft it in this thread.

1. Read `$0`; its frontmatter `sprint:` is N. Without a whole-number `sprint:`, stop and say so. Without `.rig/product/architecture.md`, say once that `/rig:architecture $0` should run first, then continue.
2. Launch one `rig:architect` agent in the foreground with the `architect` route, with the `## Brief` below ($0 filled in).
3. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart check N`. If `uncovered`, `unreferenced`, `unknownIds` or `deps` is not empty, launch the agent once more with the Brief plus that list; then check again and show the result.
4. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts inbox --sprint N` and show it.
5. Commit `.rig/intent/` on branch `rig/chart-N`: `chart: intents for sprint N`.

End with: `Next: /rig:testplan $0`.

## Brief
Chart work, not a change: write only `.rig/intent/<kebab>.md` files (this overrides the change-folder rule). Never edit source code.
Inputs: the PRD `$0`, `.rig/product/architecture.md`, and the names in `.rig/intent/` (never reuse one; never edit an intent of another sprint or one with a change).
Each intent is one change one engineer ships in a few days (tier S or M); split anything bigger. Write ≤ 40 lines each:
    ---
    status: draft
    author: <PRD owner> via rig:decompose
    created: <today>
    sprint: N
    cluster: <architecture module it lives in, kebab>
    owner: <only if the PRD names one; else leave empty>
    depends: [<intent names without .md>]
    prd: [<FR and NFR ids>]
    type: feature
    ---
    # Intent: <title>
    ## Problem
    ## Proposed outcome
    ## Affected users and systems
    ## Constraints
    ## Open questions
    none
- Lists are flow style on one line (`[a, b]`), never a `- a` block list.
- Every FR id of this PRD is cited by at least one intent; an NFR is cited by the intents whose code it constrains.
- `depends` only for a real build order (it needs code or a contract another intent creates); no cycles.
- Clusters follow the architecture's building blocks so one engineer can own a cluster.
- Sprint 0: one `walking-skeleton` intent (one thin request through every building block, deployed to the first environment); every other sprint-0 intent depends on it directly or through another intent.
Reply in 15 lines or fewer: a table name | cluster | depends | prd.
