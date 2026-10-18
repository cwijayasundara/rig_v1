---
name: chart
description: Chart a sprint - turn its PRD into intents (a brief each), the updated architecture and ADRs, every one traced to a PRD requirement. For the architect.
argument-hint: '<sprint number | .rig/product/prd/sprint-N.md | any PRD path>'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git checkout*), Bash(git add*), Bash(git commit*), Bash(git status*), Bash(git diff*), Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
---
# Chart a sprint

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`. Run each command as its own Bash call.

1. **Which sprint, which PRD.** The person's PRD is accepted in any format and from any path; never reject it, ask for a template or tell the person to rewrite it. `$ARGUMENTS` may be `<N>`, `<N> <path>`, `<path>`, `sprint <N>: <path>` or `.rig/product/prd/sprint-<N>.md`. `N` is the number given, else the `sprint:` in the file, else the next number after the highest sprint in `.rig/product/` (0 when there is none). If there is no PRD at `.rig/product/prd/sprint-<N>.md` and no path was given, stop and ask for the PRD's path. If `.rig/sensors.json` is missing, stop and tell the person to initialise a greenfield repo first, giving the stack and goal from the PRD.
   **Take it as given.** For a path elsewhere, write `.rig/product/prd/sprint-<N>.md` as a copy of that file, keeping its text and acceptance criteria word for word. The only additions are what rig reads: `sprint:` and `engineers:` (1 unless stated) in frontmatter, and a stable id on each requirement (`### FR-n:` heading or `| NFR-n |` row; keep the file's own ids, number the rest in order). Never invent a requirement, a number or an answer; put every unclear point under `## Open questions`.
   **Ask for what is missing.** Read the PRD, `.rig/product/brief.md`, `.rig/product/architecture.md` and `.rig/sensors.json`. If none of them says which technology to use (language, framework, datastore, hosting), or the PRD states no non-functional requirements (performance, security, availability, accessibility, scale), ask the person with `AskUserQuestion` before the architect runs: one question per gap, with the likely options for this product and a free-text answer. Record each answer in the sprint PRD (technology under `## Integrations and constraints`, each non-functional answer as a numbered `NFR-n` row with the person's own target), marked `(answered at chart)`. If the person says "you decide", leave it for the architect to recommend in an ADR and list it under `## Open questions`. Do not ask about what the PRD already states.
2. **Architect.** Launch the `rig:architect` agent in the foreground with no model override (its frontmatter pins the design model) and a brief of at most 40 lines:
   - the PRD path, `.rig/product/brief.md` and `.rig/product/architecture.md` when they exist, and the formats `${CLAUDE_PLUGIN_ROOT}/templates/intent-format.md` and `architecture-format.md`;
   - write `.rig/product/intents/<slug>.md` (slug of at least two characters, `estimate_days` 1 or 2, every behaviour citing a requirement the PRD defines, a `kind: boundary` intent naming its `Contract:` and `Example:` files), update `architecture.md` and add ADRs under `.rig/product/adr/`;
   - sprint 0 always includes a `walking-skeleton` intent that every other intent depends on;
   - with code but no architecture document, read the code with read-only searches first.
3. **Check.** `S chart check <N> --json`. Each `block` finding names the rule and the file. Make at most one fix round: relaunch the architect with only those findings, then check again. Never edit the PRD to make a finding go away.
4. **Commit.** `git checkout -b rig/chart-<N>` (or `git checkout rig/chart-<N>` when it exists), `git add .rig/product`, `git commit -m "docs: chart sprint <N>"`.
5. End with the intents (slug, requirements, days, dependencies), any finding still blocking, and `Next: /rig:testplan <N>`, then the architect, QA lead and product owner review the branch and a person runs /rig:approve chart-<N>`.
