---
name: chart
description: Chart a sprint - turn its PRD into intents (a brief each), the updated architecture and ADRs, every one traced to a PRD requirement. For the architect.
argument-hint: '<sprint number | .rig/product/prd/sprint-N.md>'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git checkout*), Bash(git add*), Bash(git commit*), Bash(git status*), Bash(git diff*), Read, Grep, Glob, Write, Edit, Agent
---
# Chart a sprint

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`. Run each command as its own Bash call.

1. **Which sprint.** `N` is `$ARGUMENTS` as a number, or the `sprint:` of the PRD path it names. The PRD is `.rig/product/prd/sprint-<N>.md`, written by the product owner and BA from `${CLAUDE_PLUGIN_ROOT}/templates/prd-format.md`. If it is missing, stop and say so. If `.rig/sensors.json` is missing, stop and tell the person to initialise a greenfield repo first, giving the stack and goal from the PRD.
2. **Architect.** Launch the `rig:architect` agent in the foreground with no model override (its frontmatter pins the design model) and a brief of at most 40 lines:
   - the PRD path, `.rig/product/brief.md` and `.rig/product/architecture.md` when they exist, and the formats `${CLAUDE_PLUGIN_ROOT}/templates/intent-format.md` and `architecture-format.md`;
   - write `.rig/product/intents/<slug>.md` (slug of at least two characters, `estimate_days` 1 or 2, every behaviour citing a requirement the PRD defines, a `kind: boundary` intent naming its `Contract:` and `Example:` files), update `architecture.md` and add ADRs under `.rig/product/adr/`;
   - sprint 0 always includes a `walking-skeleton` intent that every other intent depends on;
   - with code but no architecture document, read the code with read-only searches first.
3. **Check.** `S chart check <N> --json`. Each `block` finding names the rule and the file. Make at most one fix round: relaunch the architect with only those findings, then check again. Never edit the PRD to make a finding go away.
4. **Commit.** `git checkout -b rig/chart-<N>` (or `git checkout rig/chart-<N>` when it exists), `git add .rig/product`, `git commit -m "docs: chart sprint <N>"`.
5. End with the intents (slug, requirements, days, dependencies), any finding still blocking, and `Next: /rig:testplan <N>`, then the architect, QA lead and product owner review the branch and a person runs /rig:approve chart-<N>`.
