---
name: start
description: Start or continue a change - write intent.md and spec.md with numbered behaviours. Use for any new request, an idea file under .rig/intent/, or /rig:start <slug> to continue one.
argument-hint: '"<request>" | <slug> | .rig/product/sprints/sprint-<N>/intents/<slug>.md'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Read, Grep, Glob, Write, Edit, Agent, Skill
---
# Start a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`. Run each command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables).

1. **Which change.** If `$ARGUMENTS` names an existing `.rig/changes/<slug>/`, run `S activate <slug>` and continue at the first missing file below. Otherwise pick a kebab-case slug of at most five words and a type: `feature` (new behaviour), `bugfix` (wrong behaviour), `refactor` (same behaviour, new structure) or `chore` (no behaviour change). Run `S new <slug> --type <type> --title "<one line>"`. A `.rig/product/sprints/sprint-<N>/intents/<slug>.md` argument is a charted intent: use its slug and run `S new <slug> --source <file> --title "<its heading>"`; if it refuses, print the reason and stop. The change then starts with the intent's behaviours in `spec.md` (same B-numbers): keep them, add only behaviours that cite a requirement from the intent's `prd:` list, and carry the intent's text into intent.md.
2. **Conversation.** Invoke `superpowers:brainstorming` on the intent. Its opening material is the intent file (or the request), the sprint design doc named by the `design:` line of `.rig/product/architecture.md` when present (`design: none`, the template default, counts as none), and `.rig/product/brief.md` (stay inside its non-goals). One added line: the design doc is frozen, so this conversation settles only this change's behaviours, edge cases and blast radius, and a point that needs the design doc changed goes under `## Open questions`, not into the doc. Skip the skill's size step. The skill does its own recon; When `.rig/wiki/index.md` exists, hand the brainstorm the code wiki as recon: it reads the pages that name the files in play, trusts a page only through its `[path#symbol]` citations, and runs `S wiki status` first, treating a stale page as a hint to read the cited code, never as fact. Let it run its conversation, then continue below.
3. **intent.md and spec.md.** Fill `## Intent` of `.rig/changes/<slug>/intent.md` in at most 15 lines: the problem, who has it, what done looks like. Then write `.rig/changes/<slug>/spec.md`:
   - `## Behaviours`: one line per observable behaviour, numbered `B1`, `B2`, … (a charted intent's B-numbers kept). A refactor lists the behaviours it must keep; a chore may write `none`. Every behaviour gets a test that names its number.
   - `## Blast radius`: the files and directories this change may touch, one per line; `plan.md` stays inside it and `S approve` refuses a plan that does not.
   - `## Out of scope`.
   - `## Open questions`: `none` once each is answered, or its default recorded under `## Decisions`.
4. Continue with `/rig:plan <slug>` in this turn. Stop here instead only while `## Open questions` has an item a person must answer: list it and end with `Next: answer the open questions, then /rig:plan <slug>`.
