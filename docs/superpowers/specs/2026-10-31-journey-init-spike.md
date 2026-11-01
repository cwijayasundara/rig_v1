# Journey init spike (2026-10-31)

`claude -p "/rig:init --quick" --plugin-dir <rig> --model claude-haiku-5-5 --permission-mode acceptEdits`, run once on a committed Python skeleton and once on an empty repo.

- **Skeleton needed: yes.** On the empty repo init defaulted to Node ESM (`package.json`, `node --test`). On the skeleton (`pyproject.toml`, `src/library/__init__.py`, `tests/test_smoke.py`) it detected Python, wrote the `python` pack's 8 sensors unchanged, and left `src`/`tests` alone. Skeleton: `tests/e2e/journey/skeleton/`.
- **No questions asked** in either run (`--quick`). 23 and 29 turns, $0.27 and $0.34, 1.3 and 1.4 min.
- **Init does not commit.** It left `.claude/`, `.claude-plugin/`, `.rig/`, `AGENTS.md`, `CLAUDE.md` untracked on main. The driver must `sb.commitAll` after init (the live driver already does for S0).
- **Permissions:** with no `--settings`, the workspace is untrusted, 52 `permissions.allow` entries were ignored and `pytest`/`command -v` were denied, so sensors were not fully checked. The journey passes the template settings through `createSessions` (`--settings`), as S0 does, so this does not recur there.
- **Baseline:** lint failed at baseline and was recorded in `knownRed`; types, unit, layers, duplication passed.
- `INIT_PROMPT = '/rig:init --quick'`; `SKELETON` = the directory above, committed as `chore: scaffold` before init.
