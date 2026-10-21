# poteto (Lauren Tan) talk: "here's how i shipped 2,500 PRs last month to production"

Method note: I could NOT watch or read a transcript of the 38-minute video (no transcript accessible). Everything about the talk's content is from secondary write-ups (redreamality blog, a GitHub PR summarising the transcript, tweets by viewers, a profile article). pstack content is primary (read from cursor/plugins). Brainmaxxing/Noodle were read from READMEs only. Several user-listed items (specialist bots with scoped memory, blind skill evals judged by another model family, "typed in PR comment 3 times", import-graph and useEffect bans, 20+ parallel agents) are NOT confirmed in the talk summaries I found; they trace to the HappyRock blog already in poteto_dune.md.

## 1. What the talk is, and the headline numbers

### Takeaway
A solo ~38 min video posted free on X on 2026-09-21 (originally for Cursor Compile London; she skipped it to livestream for Grok Bot Galaxy). Its thesis is trust before parallelism, not PR volume. Title says 2,500; the talk itself says ~2,000. Both figures are self-reported.

### Cited Findings
- Tweet text: "here's how i shipped 2,500 PRs last month to production ... originally supposed to be for Cursor Compile in London. i couldn't make it since i was livestreaming for Grok @Bot Galaxy ... watch it on 2x speed, i talk slowly". One video, 2,281.98 s (~38 min). ~4.02M views, 18,985 likes, 34,019 bookmarks at fetch. Bio: "Grok @Bot at @SpaceXSI ... React compiler core team, prev cursor, meta, netflix" — [fxtwitter](https://api.fxtwitter.com/poteto/status/2102050467505430555)
- She says ~2,000 PRs at 0:13 in the talk; title says 2,500; PR summary notes both are her own figures — [bubbles-brain PR #486](https://github.com/DylanDDeng/bubbles-brain/pull/486); [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- Profile article: ~1,000 PRs in July, ~2,000 in August, 2,500 in the post; "never set out to hit a number"; she reportedly works 12+ hours/day, 7 days/week — [mvanhorn article via fxtwitter](https://api.fxtwitter.com/mvanhorn/status/2111481455906103390)
- Talk section order (from transcript-based summary): 1 trust first; 2 agent verifies its own work (CLI in skill dir + feature map); 3 teach agent to write like an engineer (pstack); 4 codebase constrains agent (five layers); 5 Dune conventions (ban comments, "gardener", lint rule, main vs renderer); 6 outer loop (Grok Bot routines); 7 "only remember one thing" — [bubbles-brain PR #486](https://github.com/DylanDDeng/bubbles-brain/pull/486)
- Most-repeated line (per profile article): "You can't spawn 100 agents when you don't even trust the output of one agent." — [mvanhorn](https://api.fxtwitter.com/mvanhorn/status/2111481455906103390)
- Metaphor: rejects "software factory", prefers "Michelin kitchen": humans stay responsible for the plate; scaling = who is at the stove, tools, prep-to-chef ratio — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/); [MaiYang](https://x.com/MaiYangAI/status/2102344659276099794) (snippet)

### Inferences
- "PRs merged" counts a Bot/Cloud-Agent-heavy pipeline; PR count is an activity metric, not a quality or value metric.

### Gaps
- No transcript read; exact wording of rules is paraphrased by third parties. No independent verification of 2,000/2,500.

## 2. Process: idea to production, parallelism, orchestration

### Takeaway
No fixed "N agents" figure from the talk. The described path is a trust curve: 1-5 agents watched closely, build verification so agents prove work, then scale and let agents merge overnight. Orchestration at the outer loop is Grok Bot routines launching Cursor Cloud Agents; every agent runs /poteto-mode.

### Cited Findings
- Early: she could supervise only 1-5 conversations with constant course correction; stepping away meant nothing happened or wrong thing. Opening 100 sub-agents/cloud agents without trust gave "garbage PRs, regressions, and bugs" — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- Context: joined Cursor ~6 months earlier (profile says March 2026) to fix perf in the new agents window; manually captured Chrome DevTools traces/heap snapshots; wanted agent to launch app, trace, find hotspots itself; "I'm the bottleneck" — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/); [MaiYang article](https://api.fxtwitter.com/MaiYangAI/status/2111603532210299234)
- Outer loop: Grok Bot connects to Slack, Datadog, Sentry, PlanetScale (offhand examples); she dismissed the "company brain" idea as unnecessarily complex; "Routines" trigger work from a Slack thread or Sentry alert; on Cursor, automations + TypeScript SDK can build bots; livestream showed auto bug repro and PR opening (demo, not audited) — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- Grok Bot flow (third-party promo article): tell Grok Bot the job, it launches a Cursor Cloud Agent, you review the PR; "Heavy Lift Cloud Agents" rule: the Bot does not do heavy work itself, only scopes, launches, monitors, requests revisions; every agent runs /poteto-mode — [Matt Rice article](https://api.fxtwitter.com/bossriceshark/status/2094074367324168595) (self-reported, promotional; does not mention 2,500)
- Personal bot "Benny": built first, fixes bugs overnight, from laziness about bug reports; pstack ships a dormant, Cursor-only "benny" pack that triages Slack bug reports and fixes confirmed bugs — [MaiYang article](https://api.fxtwitter.com/MaiYangAI/status/2111603532210299234); [pstack README](https://raw.githubusercontent.com/cursor/plugins/main/pstack/README.md)
- Planning: pstack "does not plan to ship planning skills, since 'the best spec is code'" (it does ship /architect, /sharpen, /how, /interrogate for design thinking) — [pstack README](https://raw.githubusercontent.com/cursor/plugins/main/pstack/README.md); skill list at [pstack/skills](https://github.com/cursor/plugins/tree/main/pstack/skills)
- Orchestrator Noodle (Go, "Skill-based agent orchestration"; docs at noodle-run.github.io/noodle returned 404, README does not explain loop) — [Noodle README](https://raw.githubusercontent.com/poteto/noodle/main/README.md). Profile article says her side-project orchestrator was rewritten six times — [MaiYang article](https://api.fxtwitter.com/MaiYangAI/status/2111603532210299234)
- /poteto-mode: 23 playbooks (Investigation, Bug fix, Perf, Hillclimb, Feature, Refactoring, Prototype, Babysit, Shipping, Autonomous run, Orchestrate, Autopilot-full, Autopilot-stack, Multi-phase plan, Opening a PR ...). Subagents: every spawn in background with file pointers not inlined context, explicit model per role; agent reviews every subagent diff; follow-up goes to fresh subagent; "Never spawn a poteto-agent to run the playbook itself."; "Green is not safe." Nothing lands before an independent per-PR verdict — [poteto-mode SKILL.md](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/poteto-mode/SKILL.md)
- Default models: code delegation to Grok; hardest changes, prose, judgment to Opus — [pstack README](https://raw.githubusercontent.com/cursor/plugins/main/pstack/README.md)
- Autonomy rule: reversible work and external actions proceed without asking; irreversible (force-push to shared branches, deploys, data deletion, customer messages) pause. "Proceed, present the result, let the human course-correct." — [poteto-mode SKILL.md](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/poteto-mode/SKILL.md); [never-block-on-the-human](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/principle-never-block-on-the-human/SKILL.md)

### Inferences
- The "20+ parallel agents" figure in poteto_dune.md is not confirmed by any talk summary; the talk argues against numbers-first scaling.
- The pstack "Green is not safe / independent per-PR verdict" rule is the nearest public analogue of a pre-merge gate; whether Grok Bot repos use it identically is unknown.

### Gaps
- Merge and deploy rules, rollback, canary, feature flags: the talk summary says "no detailed merge or deploy pipeline" ([redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)). Not found anywhere.
- Noodle internals, Maven workshop, actual video unseen.

## 3. Verification: control glass and feature map

### Takeaway
Verification is a two-part project-local skill: a reproducible CLI that drives the real app via Chrome DevTools Protocol and emits evidence, plus a repo "feature map" that tells the agent how features are reached. Neither works alone. It proves behaviour, not performance or quality.

### Cited Findings
- Control Glass (internal, no public docs): CDP to launch app, capture traces and heap snapshots. Part 1 CLI lives in skill directory; agents writing fresh scripts each session drift and measure different things. Part 2 feature map: sitemap-like file covering how features work, how users reach them, shortcuts, DOM elements, maintained by automations. Needed to interpret vague Slack reports ("a small screenshot and three question marks") — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- Limits stated: a trace does not prove code quality or overall design correctness; performance/quality need their own metrics, telemetry and quality skills — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- Matt Pocock's takeaways: custom CLIs so agents drive the app and measure perf; make app deployable to environments where agents safely test; feature maps kept current by automations (he normally warns against such docs going stale) — [Pocock via fxtwitter](https://api.fxtwitter.com/mattpocockuk/status/2103431302527508886)
- Public analogue: pstack `/create-verification-skill` builds `.cursor/skills/verify-<app>/` with SKILL.md (launch, doctor, drive, evidence, cleanup) and a `features/` map, one file per feature (seed 3-5), entry points, harness steps, observable end state. Rules: "A generated skill that was never executed is a draft, not a deliverable."; cleanup removes instances not evidence; "Never kill by process name; kill what you started."; don't weaken journeys to pass; verify side effects (files, rows, messages); prefer ARIA/data attributes over coordinates. `/maintain-verification-skill` keeps map current — [create-verification-skill SKILL.md](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/create-verification-skill/SKILL.md)
- Public example repo poteto/verification-skill-example (see poteto_dune.md).

### Inferences
- The feature map is effectively compressed agent memory about the app (MaiYang's reading: "compressed memory for the agent").

### Gaps
- No metrics on how often verification catches defects.

## 4. Guardrails: five-layer hierarchy, Dune

### Takeaway
Strongest-first ladder: codebase/architecture, static analysis/CI, rules/Bugbot/skills, style guides/human review, with verification skills as a parallel proof layer. Recurring corrections must be moved UP the ladder. Dune is the locked-down client framework that embodies layer 1.

### Cited Findings
- Redreamality's version (1 codebase/architecture "make the bad pattern impossible as a category"; 2 static analysis lint/compiler/CI, "stop the bleeding first, then have agents clean up"; 3 rules, Bugbot, skills = guidance not enforcement, agents may skip; 4 style guides and human review, doesn't scale, use to find gaps then move fix up; 5 verification skills prove correctness not perf/quality). Formal methods (Lean, TLA+) not used by her — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- Different layer ordering in the profile article (codebase, static checks, text guidance incl. AGENTS.md/skills, human review) — [mvanhorn](https://api.fxtwitter.com/mvanhorn/status/2111481455906103390). Layer 5 verification placement varies between summaries; ordering of the top four is consistent.
- Principles: Aug: each time you correct an agent, work out how to eliminate that correction entirely. Oct: "your codebase is memory". Agents are "new hires with constant amnesia." "Before AI slop, we had human slop." Tech debt spreads "like a virus" because agents copy nearby patterns — [MaiYang article](https://api.fxtwitter.com/MaiYangAI/status/2111603532210299234); [mvanhorn](https://api.fxtwitter.com/mvanhorn/status/2111481455906103390); [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- Dune: "agents love shortcuts" so make the shortcut the correct path; comments banned (agents use them to justify unfixed bugs, become bad example for next agent); a "gardener" watches what creeps in; three priorities: delete existing tech debt, one paved road per pattern, write a lint rule whenever bad code appears; Electron main must not reach renderer, enforced via import dependency graph, renderer frame budget 16 ms @60fps / 8 ms @120fps; suits non-engineers (designers, PMs, CEOs) submitting changes — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- CI bans useEffect and comments; refactor took 600+ PRs — [mvanhorn](https://api.fxtwitter.com/mvanhorn/status/2111481455906103390)
- Pocock: "Lock down your agents": agents do better in tightly constrained environments with abstractions that prevent mistakes and lints that enforce them — [Pocock](https://api.fxtwitter.com/mattpocockuk/status/2103431302527508886)
- "Typed in PR comment 3 times becomes a lint rule": only in the HappyRock blog (poteto_dune.md); NOT found in any talk summary I read. pstack `/correct` has a related rule: "A class counts once it has happened twice."; fix at highest level (architecture > types/lints/CI > tests > docs/rules last, "only for judgment calls"); every new check must be proven to fail on a real past mistake; exceptions on the offending line with reason, expiry date and human approval; same command locally and in CI; drop a rule once the mistake can't happen — [correct SKILL.md](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/correct/SKILL.md)
- pstack `/no-comments` + `comment-sicko` reviewer; poteto-mode: "Keep a comment only for a non-obvious *why* the code can't show." Before commit/review run /deslop and /no-comments; Bugbot and security-review comments get a skeptical read: fix, dismiss with concrete reason, or raise as question — [poteto-mode](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/poteto-mode/SKILL.md)

### Inferences
- The threshold for promoting a correction to a structural fix is reported as 2 (pstack /correct) or 3 (HappyRock); treat as a heuristic, not a measured number.

### Gaps
- Dune remains unreleased. Exact CI tooling unnamed.

## 5. Memory and self-improvement

### Takeaway
The talk's memory story is "the codebase and feature map are memory" plus skills; the brainmaxxing / blind-eval / specialist-bot-memory claims are NOT in the talk summaries.

### Cited Findings
- Talk: codebase, feature map and skill directory act as persistent memory; no formal eval suite described; no "company brain" — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- brainmaxxing (separate repo): "Stupid simple persistent memory for Claude Code": markdown (Obsidian-compatible) vault read at session start; `/reflect` writes, `/ruminate` mines past conversations, `/meditate` audits skills vs brain, flags contradictions, prunes stale notes; starter vault has 16 engineering principles; no eval framework in README — [brainmaxxing README](https://raw.githubusercontent.com/poteto/brainmaxxing/main/README.md)
- pstack meta skills: /reflect, /correct, /automate-me (drafts a `-mode` skill from work logs), /create-verification-skill; "about 10,000 skill uses in a week" is her post per redreamality (self-reported, unverified) — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/); [MaiYang article](https://api.fxtwitter.com/MaiYangAI/status/2111603532210299234)
- pstack includes playbooks "Eval", "Hillclimb", "Authoring or modifying a skill" — [poteto-mode](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/poteto-mode/SKILL.md) (contents not read)
- Blind skill evals by a different model family and five scoped-memory specialist bots: only in HappyRock (secondhand, see poteto_dune.md).

### Inferences
- Memory strategy = push knowledge into enforcement and repo structure, with a light markdown vault for personal memory; no vector/"brain" infrastructure.

### Gaps
- Could not verify the blind-eval claim from any primary source; pstack Eval/Hillclimb skill files not read.

## 6. Humans' role, failures, cost, quality data, measured vs self-reported

### Takeaway
Humans move from supervising conversations to building and tending the layers (gardener), remaining accountable for what ships. There is essentially no independently measured quality data; cost data comes from third parties, not the talk.

### Cited Findings
- Human role: early supervise every conversation; later build/maintain codebase, lint, rules, skills; human review used to find gaps, not as scaling mechanism — [redreamality](https://redreamality.com/blog/lauren-tan-poteto-trust-before-parallel/)
- What did not work (per talk summary): scaling parallel agents before trust; chat-only corrections (lost next session); style guides/human review alone; comments as hack justifications; automating an unlocked repo (amplifies garbage PRs) — same source
- Viewer 7-point summary: trust first; standardise verification; use the repo's fixed tool not ad hoc scripts; feature map; repo is memory; fix structure for repeated errors; invest in repo and checks — [MaiYang](https://api.fxtwitter.com/MaiYangAI/status/2102188011991777738)
- Cost: talk gives no dollar figures (effort cost only). Third-party Grok Bot cost anecdotes: one user reported 1B tokens in 7 days; one audit cited $1,048 from habits like a 15-min cron; Bot-launched agents can silently switch to fast mode and bill higher — [Matt Rice article](https://api.fxtwitter.com/bossriceshark/status/2094074367324168595) (self-reported; unrelated to her PR count)

### Measured vs self-reported
- Self-reported, unverified: 2,000/2,500 PRs, ~1,000 July, ~2,000 August, ~10,000 skill uses/week, 600+ PR Dune refactor, perf claims.
- Measured/hard: frame budgets 16/8 ms (physics of 60/120 fps); video length 2,281.98 s; engagement stats.
- No defect rate, revert rate, review-time, incident or cost-per-PR data found.

### Inferences
- High PR count plausibly includes many small automated PRs (bug triage bots, mechanical refactors), so it should not be benchmarked as human-equivalent output.

### Gaps
- No quality or rollback data. No independent evaluation. YouTube reupload (ID Z-jNqqIYGm4 per PR #486) not opened; X pages return 402.

## Relevance to rig (brief)
Directly transferable and primary-sourced: pstack /correct ladder (architecture > types/lint/CI > tests > docs last, prove each check fails on a real past mistake, rule table pairing rule with enforcer), /create-verification-skill (run it once or it is a draft), "Green is not safe" independent per-PR verdict, reversible-proceed / irreversible-pause rule, subagents get file pointers not pasted context.
