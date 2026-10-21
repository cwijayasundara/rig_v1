# REVIEW.md: how changes are reviewed here

Read by the managed GitHub Code Review service. The local review in `/rig:pr` (`/code-review` and `/security-review`) follows `CLAUDE.md` instead: the rules for contracts and non-goals live there under `## Review`. Edit this file to match your team.

## What counts as Important (critical or high)
- Wrong behaviour, data loss, a security hole, a contract change the plan did not announce, or a missing test for a B-number.

## Nits (medium or lower; never block)
- Naming, comments, small duplication, style a linter does not catch.

## Exclusions
- Generated files, lockfiles, vendored `.rig/bin/**`, and anything CI's rig-check already enforces.
