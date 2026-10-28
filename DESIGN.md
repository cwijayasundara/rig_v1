# rig: design

Why the harness is shaped the way it is, and what each part costs. Per-release changes are in [CHANGELOG.md](CHANGELOG.md); the trial runner, trial transcripts, plans and specs are in git history (before the commit that trimmed this file). Code is the reference for behaviour.

## 1. Why: evidence from the last build

The "Prism" build (`edm_sementic_layer_v2.0`, 2026-09-30 to 10-02, 356 transcripts) cost about $525-554 for 785M tokens. It was plain Claude Code plus two plugins acting as an unplanned harness (superpowers for process, security-guidance for reviews).

| Fact | Number |
|---|---|
| Share of spend that was cache *reads* of long contexts | 57% |
| Spend on turns with more than 150k context | 50% |
| Opus subagent vs Sonnet subagent, per run | $2.83 vs $0.36 |
| Retry, fix-wave and re-review agents | $64 |
| security-guidance auto-reviews (141 runs, Opus xhigh) | $79 (14%) |
| Cache rebuilds after idle (sleep-polling) | $49 |
| Human prompts that were "continue / yes" | 42 of 117 |
| Plans written (full code embedded) | 880 KB for 12.8k LOC of source |
| Wall time: active vs span | 23.7 h of 79.5 h (a sleeping laptop) |

The biggest lever is **bounded context**. Everything below follows from that.

## 2. Principles

1. **Thin layer, built-ins first.** Own three things: the artifact chain, human gates and guardrails. Plan mode, `/security-review`, `/goal` and worktrees are Claude Code's.
2. **State lives in files, not chat.** `.rig/changes/<slug>/` is the memory; status is derived from which files exist.
3. **Humans gate; models never self-approve.** Approval and waiver are human-only skills; `approval.json` goes stale when the spec or plan changes.
4. **Deterministic checks decide; models advise.** Sensors, red-proof and secrets are scripts at zero tokens; one advisory review per change.
5. **Local equals CI.** One `check` entry point serves Stop, git hooks and CI. CI judges a PR with the base branch's checker and config, so a PR cannot weaken its own judge.
6. **Bounded loops.** Stop blocks are capped; past a cap the finding goes to `unresolved.json`.
7. **Every step ends with the next command.**

## 3. Architecture

```
skills/      the stages, /rig:* (start plan build test pr rule init, chart testplan wiki learn app arch, plus human-only approve, waive and autonomy), prompts only
agents/      architect (charts a sprint); evaluator (sprint chart review; a change's diff is reviewed by a clean-context Opus reviewer agent and an Opus security agent in /rig:pr)
hooks/       hooks.json = six settings hook events (session start, prompt submit, post-edit, stop, agent launch/done, model switch) plus the journey dashboard module, none on Bash (work in -p and CI)
scripts/     zero-dependency Node, no build step; sdlc.ts is the CLI; check.ts is the one checker
templates/   CI workflow (rig-check), settings.json, stacks/ (stack packs), brief.md, REVIEW.md
guides/      contracts, engineering, testing: injected on first touch of a matching path
.rig/       the consumer repo's committed evidence (see §5)
```

- **Skills, not commands.** Plugin agents ignore `hooks`, `mcpServers` and `permissionMode`, so an agent's limits are its `tools:` list; there are no per-agent gates.
- **Standalone by default.** `vendor --standalone` copies skills, agents, hooks and scripts into the repo (`.claude/skills/rig-*`, `.claude/agents/rig-*`, `.rig/bin`), so a repo never depends on the plugin and a cloud session runs it as is. `/rig-approve`, `/rig-waive` and `/rig-autonomy` are vendored skills with `disable-model-invocation` and a pinned `!` command; `$ARGUMENTS` is single-quoted because it is substituted raw.
- **Artifacts live in `.rig/`, not `.claude/`.** Claude Code protects `.claude/`: writes there prompt, or are denied in `-p`, and allow rules cannot change that.

## 4. The change lifecycle

intent → spec → plan → approval.json → build → verify.json → PR

A change is `.rig/changes/<slug>/`. `/rig:start` writes `intent.md` (`type:` feature, bugfix, refactor or chore) and `spec.md` (`## Behaviours`, B1, B2…). Status comes from which files exist: spec, plan, approve, build, pr, review, shipped; the active change is in `.rig/state/active`. Work with no change gets the sensors only.

`approval.json` is written only by a person (`/rig:approve <slug>`): it holds hashes of `spec.md`, `plan.md` and the contract files, and goes stale when the spec or plan change. `sdlc.ts verify` writes `verify.json`: every commit and ci sensor, the contracts validate-then-run, traceability and red-proof, tied to the working tree. `/rig:pr` refuses without a current approval and a fresh passing `verify.json`; it commits on `sdlc/<slug>`, pushes and opens the PR, or stays local-only. With `"gates": {"plan": false}` in `.rig/sensors.json` the plan gate is off; otherwise verify and CI report a non-waivable `plan-gate` block.

## 5. Artifacts

```
.rig/
├── changes/<slug>/  intent.md  spec.md  plan.md (no code)  approval.json
│                    evidence/runs.jsonl  verify.json  pr.md
├── state/active     the active change
├── product/brief.md
├── sensors.json     the sensor registry: sensors, paths, contracts, gates, models, policy, knownRed
├── rules.json       regex rules          guides/   bin/ (vendored checker)
└── (gitignored)     .gate  unresolved.json
```

Evidence files (`approval.json`, waivers, `runs.jsonl`, `verify.json`, `pr.md`, `.gate`) are written only by sdlc. The template's `permissions` deny rules keep the Edit and Write tools off them and CI recomputes every verdict; a shell script can still write a file locally, so CI plus branch protection is the boundary. CI treats an `approval.json` added or edited by a PR as a human row that needs independent GitHub approval. Plans must not contain code (this alone would have removed the 880 KB of plan text).

## 6. Token and time policy

| Lever | Mechanism |
|---|---|
| Bounded context | Small fresh contexts per subagent (briefs of ≤ 60 lines); `/compact` rather than a handoff skill |
| Context guard: the session-start rules say to `/compact` at ~150k context, and the journey dashboard shows the session's context and dollars live | Live guard for the 50% finding above, not a retrospective; two review systems per turn is the single biggest waste found (proposal 2026-10-08) |
| Sonnet main thread, Opus advisor **off** | Template sets `CLAUDE_CODE_DISABLE_ADVISOR_TOOL` (the advisor was a third of each run's cost; a user-level `advisorModel` otherwise still applies) |
| One review per change | One clean-context reviewer agent (diff and intent only, builder triage with recorded dismissals) + an Opus security agent on the delta before the PR opens (Sonnet output is always evaluated by Opus) |
| Stamp, don't re-run | `verify` runs every commit and ci sensor once against the current tree and writes `verify.json`, tied to the working tree; `/rig:pr` checks it instead of re-running, and a stale one re-runs. CI reads no stamp |
| Lean plans | No code in plans |
| Plugin diet | Project `enabledPlugins` turns off unrelated plugins |
| Cloud for long builds | A cloud session keeps running while the laptop sleeps |

## 7. What the trials showed

The trials ran the previous lifecycle; their transcripts are in git history. Live, paid, one run per arm: treat as directional.

- **Defects the trials found, all fixed with tests:** verdicts must come from captured exit codes, not model claims; a path-scoped write permission must be an `Edit(...)` rule; plans must not carry unresolved gating questions; headless sessions end while a background subagent runs, so subagents run in the foreground.

## 8. Guard layer

**No auto-approval and no Bash hook.** The guard layer (the `PreToolUse` hooks for Bash and Edit, auto-approval and the read-only Bash allowlist) was removed in v0.5.0. `permissions` deny rules in `templates/settings.json` keep the Edit and Write tools off pure evidence; `ask` rules make a person confirm edits to `sensors.json`, `rules.json`, `.claude/settings.json`, `.rig/bin`, the git hooks, the guides, the `rig-check` workflow and CODEOWNERS. `CLAUDE.md` is deliberately not on the list (`init` writes it with the Write tool). Rules are evaluated deny, then ask, then allow, so the template's `allow: Edit(.rig/**)` is overridden by the more specific `ask` and `deny` rules; case-folded paths on case-insensitive file systems are not covered. The model can still run `SDLC_HUMAN=1 ... approve` through Bash; CI refuses an `approval.json` a PR adds or edits unless an independent reviewer approves the head commit. **Never self-approved:** approvals and waivers.

**CI never accepts a harness waiver from the PR**: a `harness-tamper` finding cannot be waived at CI, so a harness change lands on the trunk first as its own reviewed change.

## 9. Git hooks (spec 5)

Git is the common layer for every editor, agent and person, so `hooks install` sets `core.hooksPath` to the committed `.rig/githooks/` (POSIX `sh`, running the vendored checker). `check --at commit` runs the built-in sensors on the staged diff plus every edit-, turn- and commit-cadence command sensor; `check --at push` runs the sensors against CI's base (merge-base with the trunk), within `githooks.budgetMs`; from a clean checkout whose tree matches `verify.json` it skips the command sensors (a stale `verify.json` re-runs them). A hook that cannot run warns and lets git continue; a finding that blocks still blocks. Warnings are visible: Stop prints a `systemMessage` and the next prompt carries them over once. `/rig:pr` commits with `--no-verify` because `verify` has just judged that tree. Opt out with `hooks uninstall` (`rig.githooks = off`).

There is no guard against the model passing `--no-verify` or running `hooks uninstall`: no hook runs on Bash, because a text match over shell commands was too leaky to be worth its size. A person keeps `--no-verify` too, so **CI plus branch protection is the boundary**; the hooks are a fast local signal.

Open: command sensors at commit and push see the working tree rather than the index or pushed commits.


## 10. Open items

- `/rig-approve` has not been tried in a cloud session.
- The git hooks have not been trialled live; the live trials predate them.
- Whether `autoCompactWindow` is honoured from project settings.
- Windows is unsupported (the hook scripts are POSIX `sh`).

## The sprint outer loop (2026-10-17)

A sprint starts from a PRD. The architect and the QA lead use `/rig:chart` and `/rig:testplan` to produce traced, sized intents, the architecture and the test plan; one human approval covers them; engineers then run the single-change lifecycle per intent. The chain requirement → intent → behaviour → test case is checked by a script, not a model. Measured by trace coverage, estimate against actual, chart staleness and the chart-quality eval (`eval/chart.mjs`).
