---
name: start
description: Start or continue a change - write intent.md and spec.md with numbered behaviours. Use for any new request, an idea file under .rig/intent/, or /rig:start <slug> to continue one.
argument-hint: '"<request>" | <slug> | .rig/intent/<file>.md'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Read, Grep, Glob, Write, Edit, Agent
---
# Start a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`. Run each command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables).

1. **Which change.** If `$ARGUMENTS` names an existing `.rig/changes/<slug>/`, run `S activate <slug>` and continue at the first missing file below. Otherwise pick a kebab-case slug of at most five words and a type: `feature` (new behaviour), `bugfix` (wrong behaviour), `refactor` (same behaviour, new structure) or `chore` (no behaviour change). Run `S new <slug> --type <type> --title "<one line>"`. A `.rig/intent/<file>.md` argument is the request: read it and carry its text into intent.md.
2. **intent.md.** Fill `## Intent` in at most 15 lines: the problem, who has it, what done looks like. Read `.rig/product/brief.md` when it exists and stay inside its non-goals. Delegate code searches to one `Explore` agent with model `haiku` and a brief of at most 20 lines.
3. **spec.md.** Write `.rig/changes/<slug>/spec.md`:
   - `## Behaviours`: one line per observable behaviour, numbered `B1`, `B2`, … A refactor lists the behaviours it must keep; a chore may write `none`. Every behaviour gets a test that names its number.
   - `## Out of scope`.
   - `## Open questions`: `none` once each is answered, or its default recorded under `## Decisions`.
4. End with `Next: /rig:plan <slug>`.
