# rig operations runbook

For the platform team and the support owner of a repo that runs rig (readiness doc R5). Commands assume a vendored install (`node .rig/bin/sdlc.ts`). From the plugin, use the plugin's `scripts/sdlc.ts`.

## Switch rig off for a repo

1. On a branch, run `node .rig/bin/sdlc.ts off --why "<reason>"`. It writes `.rig/off.json` (who, why, date) and nothing else.
2. Commit it, open a PR, and have a code owner approve it. `.rig/off.json` is protected (CODEOWNERS, harness-tamper, settings deny rules), so it cannot merge without a code owner.
3. Merge. From then on, while the trunk carries the file:
   - `rig-check` passes at once;
   - `ai-review` passes at once (it also passes on the off PR itself, see below);
   - the git hooks and the Claude Code hooks do nothing;
   - the session-start hook prints one line saying rig is off and why.
4. Engineers run `git fetch`. The local checks read the trunk's copy (`origin/<trunk>`), so an unfetched clone stays on until it fetches.

The marker counts only on the trunk. Writing it on a feature branch switches nothing off, so an agent cannot use it to get past its own gates.

**Switch it back on:** on a branch, run `node .rig/bin/sdlc.ts on` (it deletes the file), then open a PR, get a code owner's approval and merge.

## CI is down

GitHub Actions cannot report, so the required `rig-check` and `ai-review` checks never arrive and no PR can merge. `sdlc.ts off` does not help, because nothing runs to read it. Either:
- wait, or
- for a change that cannot wait, have a repository admin merge past the required checks.

Record the PR, the reason and the admin in the support log. Local git hooks keep running throughout, so changes are still checked before they are pushed.

## The model provider is down

`ai-review` fails with "gave no verdict line". Local Claude Code sessions cannot run either, though deterministic checks and git hooks do.
- **Short outage:** wait. PRs queue behind the required check.
- **Long outage:** run `sdlc.ts off --why "<provider> outage"` and merge that PR. Its `ai-review` passes because the PR adds `.rig/off.json`, and the code-owner review is the gate. Switch rig back on when the provider recovers.

`rig-check` needs no model, so it keeps judging while rig is on.

## rig itself is broken

A sensor or the checker blocks every PR, the off PR included, because `rig-check` judges it with the broken checker from the base. Last resort: a repository admin merges past the checks for the off PR only. Log it. Then fix the cause on `release/<x.y>`, tag a patch, upgrade the repo and switch rig back on.

## Upgrading

Rehearse every upgrade on a throwaway clone of the client repo before the real one.
1. Install the plugin from the new tag (your fork, pinned: SECURITY.md step 4).
2. Run `/rig:upgrade` in the clone. It shows the plan, asks about the files you changed and applies on a chore branch. Changes to the workflow template arrive as `.github/workflows/rig-check.yml.rig-new` for a person to merge by hand.
3. Run the client's own tests, `node .rig/bin/sdlc.ts readiness --client --managed <file>`, and one small change end to end (`/rig:start` to PR).
4. Open the upgrade PR on the real repo and have a code owner review it.

Rehearsal record: 0.8.0 → 0.8.1, date `<YYYY-MM-DD>`, by `<name>`, result `<pass | issues>`. A person does this before the pilot.

## Support

- Support owner: `<support owner>`
- Response time: `<response time>`
- Report: issues on the fork the repo installs from, with the output of `node .rig/bin/sdlc.ts status` and the failing check's log.
