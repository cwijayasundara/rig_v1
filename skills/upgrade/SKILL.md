---
name: upgrade
description: Bring a repo's installed rig up to this plugin's version without starting over. Shows the plan, asks about files you changed, applies on a chore branch and stops for review.
argument-hint: '[--force]'
model: sonnet
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git status*), Bash(git diff*), Bash(git log*), Read, AskUserQuestion
---
# Upgrade this repo's rig

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`. Run each command as its own Bash call (no `cd`, pipes, redirects or `&&`).

1. Run `S upgrade --json` (add `--force` only when the person passed it: it allows a downgrade). It changes nothing. Summarise in plain words: `from` and `to`, the counts (replace, keep, add, delete), the migrations that will run, and the proposed sensors. When `standalone` is false there is no vendored copy to replace: say that only the migrations and the sensors apply.
2. Conflicts are the `files` the person changed that the new version also changes. When there are none, skip to step 4. Otherwise ask ONE `AskUserQuestion` batch: one question per conflicting file, up to 4 per call. With more than 4 conflicts, group them by directory and ask a second call. The four choices on every question: keep mine, take new, show diff, write .rig-new (keeps their file and writes the new one beside it as `<file>.rig-new`). On show diff, run `S upgrade --diff <file>`, show the diff, and ask again for that file only.
3. Ask separately which of the proposed sensors to add: one `AskUserQuestion` with `multiSelect`, one option per sensor id, naming its command. Skip it when none were proposed.
4. Apply: `S upgrade --apply --decide '<json>' [--add-sensors id,id]`, where `<json>` maps each conflicting file to `mine`, `new` or `later` (keep mine is `mine`, take new is `new`, write .rig-new is `later`). The apply creates `chore/rig-upgrade-<to>`, vendors, runs the migrations, runs sync and baseline, and stops.
5. Report: the branch, what changed, the `.rig-new` files the person must merge by hand, and any baseline result it printed. End with `Next: review and merge the branch; nothing was pushed`.

Never edit `.rig/sensors.json` or the manifest by hand; the command owns both. Never push, and never commit anything yourself. If apply refuses (a dirty working tree, the branch already exists), stop, quote the refusal and tell the person what it asks for; do not work around it.
