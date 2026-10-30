# pstack, and hillclimbing rig: take two small things, measure before building the loop

Status: researched 2026-10-30, nothing built. Decisions at the end.

## The ask

> Can we pick any ideas from pstack to improve this harness? Deep research, and keep the harness as lean as possible.
> Then: read the other skills too, and check whether "hill climbing" can improve rig over time.

Sources:
- pstack original: `cursor/plugins`, `pstack/` (Poteto / Lauren Tan, commits to 2026-10-27). `backnotprop/pstack` is a mirror with the same skills.
- Blog: *Automating eval design and hillclimbing* (claude.dev, Lance Martin), read through a fetch summary.
- Read first-hand: `interrogate`, `show-me-your-work`, `create-verification-skill`, the `hillclimb`, `eval`, `babysit`, `autopilot-full` and `authoring-a-skill` playbooks, five principle files. The other ~60 files were summarised by two Haiku readers; their mechanism notes are used, their rankings are not (they listed `correct`, `reflect` and `automate-me` as gaps; `skills/learn` already has all three).
- Earlier review of the same lineage: memory `ub-mode-pstack-adoption` (2026-10-28).

## Verdict on pstack

Almost nothing is new. Two small things are worth taking.

### Already in rig

| pstack | rig |
|---|---|
| attack the premise | merged aa1e72f |
| prove it works, tdd, bug-fix repro | `proofOnBase` red proof, `## Evidence` from `runs.jsonl` |
| `correct`: a class counts after two repeats, a new check must fail on a real past mistake | `S learn mine` (2+ distinct changes); `PROMOTE`/`LAYER` need a passing replay on the earning changes |
| `reflect`: lint-enforceable lessons go to structure | `learn` proposes the strongest rung first |
| `automate-me`: 2+ sessions | corrections need 2 `session:<id>` citations |
| verification skill with feature map | `skills/app`, `scripts/app.ts`, journeys, `stale` state |
| cleanup by pid, not process name | `templates/verify/lib.mjs` kills by process group |
| decision trail, cross-model audit | change records, `evidence/runs.jsonl`, Opus evaluates Sonnet |
| patch-id verdict carry-over after rebase | `scripts/stamp.ts` stamps `git write-tree`, stricter; only a re-run of `npm test` is saved |

### Take (small)

1. **Findings that prove themselves** (`interrogate`). Add an optional `Repro: <cmd>` to a finding in `templates/review-brief.md`; the confirm pass runs it; a finding with no repro is marked `unproven`, not dropped (design and unmapped findings cannot have one). Two template edits, no new agent. It is the queued item 1e of 2026-10-29-verification-evidence. Gate: the seeded review eval, recall must not drop.
2. **Explain the number** (`principle-explain-the-number`, `benchmark-checklist`). In the eval results template: the decision the number would change, the noise floor, run count and spread, and what else the number could be measuring. The evidence for needing it is in the next section.

Optional, only if 1 proves out: the `blast-radius` evidence ladder in the review brief.

### Rejected

`arena`, `swarm`, per-PR verifier agents and `orchestrate` (break the 4-launch, $8 target); the `poteto-mode` router and its 23 playbooks; `never-block-on-the-human` (conflicts with the approve gate and `/rig:build` stop); `autopilot-*`, `shipping`, `babysit` queueing (Origin, cloud VMs, hourly root audit); TLA+ and `statechart`; the Grok/Opus panel; `why`/`how`/`recall` (wiki and native tools); `multi-phase-plan` (ten live lanes per PR).

## Hillclimbing rig

### What the sources describe

Blog: split cases into train and test; check the eval's noise is smaller than the smallest gain you would act on; one patch per round from the previous round's train failures only; keep only when train and test both improve; revert a train-only gain as overfitting; never paste failure content into the prompt; after two or three stalled rounds, bucket the remaining failures by cause and edit nothing; do not merge a gain inside the confidence interval. When the baseline is about 95% or higher, optimise cost at parity, not quality.

pstack `hillclimb` and `autonomous-run`: a frozen harness printing the median of N runs with an error count and a work count; a stop predicate (target plus a minimum number of attempts) fixed before round one; one change, one measurement, keep or revert; one commit per win; every attempt logged in a gitignored TSV; never relax the predicate. No train/test split.

### What rig already has

`eval/run.mjs` paired arms with caps and `--dry`; `chart`, `learn`, `wiki`, `app` and `review` evals; deterministic scorers (regex or exact match, never a model) for chart, learn, wiki, app; `ablate.mjs` with a verdict history; `gate.mjs` (baseline.json is `{}`, so it enforces nothing and says so). Ablation is the "cut" half. Hillclimbing would be the "improve" half.

Missing: a train/test split, a noise check, the propose-run-keep-or-revert loop, a rule that rejects a patch containing fixture strings.

### What the existing data says (computed 2026-10-30, $0, from eval/results)

Review eval, 2026-10-29 file (60 clean-arm calls per model across 20 cases, 3 runs each):

| reviewer | mean $/call | within-case sd | cv | smallest detectable cost change (n=60 per arm, 80% power) |
|---|---|---|---|---|
| Sonnet 5.5 | $0.056 | $0.0435 | 78% | about 40% |
| Opus 5.5 | $0.127 | $0.0920 | 73% | about 37% |

`templates/review-brief.md` is 28 lines, about 3.5 KB (roughly 800 tokens) of a call that also carries the diff, spec, plan and touched files. Shortening it cannot move the cost by 40%, and recall is already 100% (hard cases included, both models). **A hillclimb on the review brief has no detectable objective.** The planned $4-6 manual trial would only have confirmed this, so it was not run.

Whole-rig, 2026-10-21 `links2` (shop brief, 3 runs per arm):

| arm | accepted | $ per run | cv |
|---|---|---|---|
| haiku-rig | 3/3 | 0.69 / 0.94 / 0.74 | 16% |
| haiku-bare | 3/3 | 0.03 / 0.03 / 0.03 | 2% |

rig cost about 26 times bare per accepted change, with about 23 times the input tokens (11.8M against 0.5M median) and 14.4 minutes against 2.2, and no lift: bare Haiku already scores 100%, so the brief has no quality headroom. The gap is far above the noise, and with 6 runs per arm a 27% cost cut would be detectable. The earlier `paired` run had haiku-rig at 1/2 (an approve refusal on an open question). Caveats: n=3, and the run predates one-door-right-sized and later changes.

Chart eval (2026-10-17) costs $1.09-$1.29 per run and scores by keyword counts at n=3: too noisy and too dear to climb on. The learn eval costs about $0.006 per call with a deterministic regex score, and the `off` arm recurred 6/6, so it has headroom; what it would tune is the lesson-writing step, a narrow surface.

### Conclusion

Hillclimbing pays off in one place: **whole-rig cost at equal acceptance on the shop brief**, where the effect is large and the noise small. It costs about $0.79 per run, so a round of 6 runs on each side is roughly $9 and a five-round climb about $45; that sits outside the per-change $8 target and needs its own cap.

Before paying for a loop, answer "why not half?" (explain-the-number): where do 11.8M input tokens go? That is a $0 analysis of one existing run's transcript, split by skill, hook and tool output. If the answer is a few big contributors, they can be cut by hand, with no loop. The loop is justified only if the answer is many small ones.

## Step 2 result (2026-10-30): where the whole-rig cost goes

No transcripts of the 2026-10-21 runs survive (macOS cleared the sandboxes), so one live `haiku-rig` run was made: `eval/run.mjs --arms haiku-rig --runs 1 --variant links --cap-run 2 --cap-total 2`, sessions kept in the scratchpad. It ended not accepted (3/4 checks; a sandbox `git push` error and a 404 on the links check), and the delete change (S3) never reached its review, so it is a partial run.

**1. The eval's cost accounting double counts.** Sessions run with `--continue` share one conversation, and each `result` event's `total_cost_usd` and `modelUsage` are running totals for it. Check: the S2 chain's cache-read tokens are 0.18M (start) + 0.31M (plan) + 0.15M (answer) = 0.64M, which is exactly what the answer session's result reports. `readSession` (`tests/e2e/assert/process.mjs:21`) stores `total_cost_usd` as the session's cost and `totals()` sums the sessions. This run: reported $2.14, true $1.15 (last result of each chain: $0.938 + $0.211), 1.86 times too high. Input tokens are 2.08 times too high (haiku cache reads 12.41M summed, 5.96M true). The same code produced every rig-arm number in `eval/results`, so the 26x cost and 23x input-token ratios above are overstated (a rough correction by the same factor gives about 14x on cost); the bare arm is one session and is correct. The cap also trips early: it compares the inflated sum with `--cap-run`.

**2. Opus is 81% of the true cost, not Haiku's context.** True cost by model, from the last result of each chain: Opus $0.927, Haiku $0.223. The Opus is the review layer: the plan evaluator (`rig-evaluator`) costs $0.17 and $0.16 on the two changes, and the S2 build ran three Opus agents (code review, security review, confirm) for $0.60 on a toy change, as much as everything else in that session. `CLAUDE_CODE_SUBAGENT_MODEL` is set to Haiku for this arm, but the explicit `model: opus` on those agent calls wins. Input tokens are therefore the wrong lever: Haiku's 6M cache-read tokens cost about $0.22.

**Consequence for hillclimbing.** The big knob is how many Opus calls a change gets, and of what size, not prompt length. That is a policy question (the risk tiers, whether a toy change needs a security review and a confirm pass), and the review eval already shows Sonnet matching Opus on recall at about 44% of the cost per call, though saturated and so unable to rank them. Whether to act on that is the owner's call (memory: Opus evaluates Sonnet). A hillclimb loop is not needed to settle it.

## Design if the loop is built (not recommended yet)

One file, `eval/climb.mjs`, about 150 lines plus a spec. No new skill, hook or agent.

1. Pick a surface (an allowlist of files) and an objective (cost per accepted at parity).
2. Tag cases `train`/`test` (a `split` field, a `--split` flag on each eval). Run the baseline N times and compute the spread.
3. Refuse to start when the spread exceeds the smallest gain worth acting on.
4. Per round, a headless `claude -p` call (Sonnet) sees only the last round's train failures and edits one allowlisted file. A spec rejects any patch containing fixture ids or strings.
5. Run train and test. Keep (commit on `climb/<surface>`) only if both improve; otherwise `git checkout`.
6. Log each attempt in a gitignored `climb.tsv`.
7. Stop on the predicate, the budget (`--cap-total`), or two stalled rounds (then write the bucketed failure report and edit nothing).
8. One Opus review of the branch diff at the end (Sonnet output is evaluated by Opus). A person starts paid runs and merges; a gain inside the interval does not merge.

Risks: the fixtures are small (a shop and a cart), so without the held-out rule the loop tunes to them; the review eval's 20 cases give a test split too small to detect anything; real cases would come from `S learn reverts` and shop_app transcripts.

## Plan

| step | cost | gate |
|---|---|---|
| 1. "Explain the number" lines in the eval results template | minutes | none |
| 2. Token breakdown of a whole-rig run | done: one live run, $2.14 as counted, $1.15 true | Opus review layer is 81% of cost; eval cost accounting double counts |
| 2b. Fix the double count (per conversation, not per `--continue` session) | built on `fix/eval-cost-double-count`, uncommitted: `sinceSession` in `tests/e2e/assert/process.mjs`, applied in `createSessions`; 6 new tests, each guard mutation-checked; one Opus review, 2 findings fixed | still to do: re-state the earlier rig-vs-bare ratios (old `eval/results` rows keep the inflated figures; they do not compare with new runs) |
| 3. `Repro:` on review findings, small branch | small | seeded review eval, recall must not drop |
| 4. `eval/climb.mjs` aimed at whole-rig cost | about 150 lines, then about $45 per climb | only if step 2 shows many small contributors; dry run first, capped live run started by a person |

## Decisions (2026-10-30)

- Run the manual trial: agreed, then not needed. The free spread data shows the review brief cannot show a detectable cost change, so no paid run was made.
- Save as a proposal: this file. Not committed.
- Keep the shop brief as the whole-rig task for now: agreed. Revisit only if step 2 or 4 happens; a harder brief would add headroom but is a larger change.
- Open: whether the whole-rig numbers still hold after one-door-right-sized (a fresh run is the only way to know).
