---
name: pr
description: Open the PR for a verified change, then run one advisory review by the evaluator agent.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git diff*), Bash(git log*), Bash(gh pr view*), Bash(gh pr comment*), Read, Grep, Write, Agent
---
# Open the PR

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S pr <slug> --message "<type(scope): summary>"`. It refuses without an approved plan and a fresh, passing `verify.json`. On a refusal, run `/rig:test <slug>` again or ask the person to approve. It commits on `sdlc/<slug>`, pushes and opens the PR, or stays local-only without a remote.
2. Review once: launch `rig:evaluator` with no model override (its frontmatter pins the evaluation model). Pass the change folder and the base it was verified against (`base` in `verify.json`). Write its findings to `.rig/changes/<slug>/review.md` and, when a PR exists, post them with `gh pr comment --body-file .rig/changes/<slug>/review.md`. Findings are advice and never block. Fix a critical one only when the person agrees: fix it, rerun `/rig:test <slug>`, then run `S pr <slug> --message "fix: <what>"` again, which commits and pushes the follow-up on `sdlc/<slug>`.
3. End with the PR URL (or `local-only`) and `Next: a person reviews and merges the PR`.
