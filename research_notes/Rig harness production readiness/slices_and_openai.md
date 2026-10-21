# Vertical slices and OpenAI harness engineering: adoptable practices

Source access note: openai.com/index/harness-engineering returned HTTP 403 on every mirror tried, so the OpenAI primary text was NOT read directly. OpenAI claims below come from secondary summaries (yage.ai survey, Latent Space interview with the author, Martin Fowler memo, search snippets) and are marked as such. Quotes attributed to OpenAI are as relayed by those summaries and are unverified against the original. Fully read and verified: the bastidood.dev article (via WebFetch summary, not raw text).

## 1. Vertical slice article: what is a slice, scoping, context, conflicts, review, ownership, tradeoffs

### Takeaway
A slice is a self-contained feature module with logic and tests collocated, chosen so an agent can find and read only a narrow set of files in one context window. The article is opinion with no measurements; its main concrete rule is one feature per context window and the 40% context rule.

### Cited Findings
- Slice definition: "self-contained feature modules that cohesively implement all of its logic end-to-end", files "collocated within a narrow slice of the project structure"; contrasted with horizontal layers that scatter a feature across services/controllers/models directories. — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)
- Granularity: pushed possibly to one function per file with a matching test file (e.g. `dates.ts` / `dates.test.ts`); the author calls this "comically harsh" and says he is not advocating it. — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)
- Scoping: one feature per context window; "strongly discouraged to do too many unrelated things within a single context window". Agents and humans should work "in isolation without much merge conflicts". — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)
- Exploration is a narrowing tree: semantic query, then keyword search, then file reads; output is a codemap written to `PLAN.md`. Stated metric is signal-to-noise ratio of exploration. — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)
- Context: read-before-write tools (Claude Code) make reads accumulate; the "40% rule" (quality degrades past ~40% of the window) is reported by many developers, though the author says it matters less with newer frontier models. Claude 4+ context awareness may cause "more shortcuts, more sloppy work, and more incomplete features". Mitigations: /compact, /summarize, /handoff, /clear, sub-agents, "often good enough". — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)
- Conflicts: add features incrementally, "mostly new code and only a few edits/deletions"; self-contained modules enable "concurrent implementation (no merge conflicts!)". Asserted, no mechanism given for conflicts that do occur. — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)
- Review: collocated slices are easier for humans to review, less "directory jumping". — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)
- Ownership: only "you are still responsible for the code you generate and eventually merge into production". No team/ownership model. — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)
- Failure modes: monolithic Service/Repository classes add "more code noise than signal"; test files of "thousands of lines" force whole-file reads (roughly doubling reads when asked to add tests); a feature slice can itself become monolithic; over-splitting is impractical. Keep inter-feature logic out of shared files except orchestration. — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)

### Inferences
- The slice is a context-budget tool first, a conflict-avoidance tool second. Only two numbers in the article (40%, "thousands of lines"); treat as heuristics.
- OpenAI's layered domain architecture (below) and ~500 npm packages with strict boundaries serve the same goal (locality), so the two sources are compatible: slices for locality, enforced layers within/between them.
- For a harness: a per-task scope declaration (allowed paths = the slice) and a "feature touches mostly new files" check are cheap, adoptable gates.

### Gaps
- No evidence of measured token savings, conflict rates, or review time; no treatment of cross-slice changes, shared schemas, or refactors spanning slices. Fetched via summarising tool, so wording of quotes could be slightly off.
- Did not look for follow-up posts by the author (bastidood); none read.

## 2. OpenAI "Harness engineering" practices (secondary sources only)

### Takeaway
Ryan Lopopolo's post (11 Feb 2026) describes ~1M lines, ~1,500 PRs, zero hand-written code, 3 then 7 engineers over 5 months; the lever was environment design: short AGENTS.md as map, repo as the only knowledge store, mechanically enforced architecture, agent review, and recurring cleanup agents.

### Cited Findings
- Scale: roughly 1M lines (app logic, infra, tooling, docs, internal utilities); ~1,500 PRs opened and merged; started with 3 engineers, later 7; five months; "every line" written by Codex. — [search summary of OpenAI post](https://openai.com/index/harness-engineering/) (not fetched; 403), corroborated by [Latent Space](https://latent.space/p/harness-eng) and [yage.ai survey](https://yage.ai/share/harness-engineering-survey-en-20260312.html)
- Throughput: ~3.5 PRs per engineer per day late December; roughly 5-10 per engineer per day after GPT-5.2 (early January). First 1.5 months were ~10x slower than one engineer alone, but the tooling built made the team more productive. — [Latent Space](https://latent.space/p/harness-eng) (author interview, not the post)
- AGENTS.md as table of contents: one big rules file failed; replaced by a ~100-line navigation file pointing to a structured `docs/` knowledge base (design docs, execution plans, architecture decisions, quality scores). "AGENTS.md should be a directory, not an encyclopedia" is a third-party phrasing. Deeper docs include core beliefs, tech-debt tracker, quality score. — [yage.ai](https://yage.ai/share/harness-engineering-survey-en-20260312.html); [Latent Space](https://latent.space/p/harness-eng)
- Repo as system of record: "What Codex cannot see does not exist"; decisions in Slack/Google Docs had to be moved into versioned markdown. — [yage.ai](https://yage.ai/share/harness-engineering-survey-en-20260312.html)
- Architecture and linters: strict layering Types -> Config -> Repo -> Service -> Runtime -> UI enforced by custom linters generated by Codex; "parse, don't validate" at boundaries (Codex chose Zod). Fowler groups it as architectural constraints enforced by LLM agents plus deterministic custom linters and structural tests. — [yage.ai](https://yage.ai/share/harness-engineering-survey-en-20260312.html); [Fowler](https://www.martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html)
- "Not documented. Enforced." attributed to the team by a secondary blog; unverified. — search snippet via [codemyspec](https://codemyspec.com/blog/the-harness-layer)
- Golden principles / garbage collection: team spent 20% of each Friday cleaning "AI slop"; unsustainable, so encoded golden principles in repo and ran background Codex tasks scanning for deviations, updating quality scores, opening fix PRs; most reviewable and auto-mergeable "in under a minute"; debt as a high-interest loan. Fowler calls this the "garbage collection" category (doc inconsistencies, architectural violations). — [yage.ai](https://yage.ai/share/harness-engineering-survey-en-20260312.html); [Fowler](https://www.martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html)
- Agent legibility: Codex wired to Chrome DevTools Protocol (screenshots, DOM, UI flows); per-git-worktree logs/metrics/traces stack queried with LogQL/PromQL, enabling goals like critical-path spans under two seconds; single runs often exceed six hours, overnight. Later interview: local observability stack spun up via skills/scripts; Playwright via MCP replaced by a shim CLI since ~3 calls needed; CLI output terse and structured. — [yage.ai](https://yage.ai/share/harness-engineering-survey-en-20260312.html); [Latent Space](https://latent.space/p/harness-eng)
- Throughput vs merge: blocking merge gates dropped for minimal blocking, short PR lifetimes, flakes fixed in follow-up runs; team acknowledged this would be irresponsible at low throughput. Interview: reviewers biased toward merging, only surface issues above a priority threshold (P0 = do not merge); authoring agents may push back/defer feedback; a `$land` skill drives PR to merge (reviews, CI, flakes, conflicts, merge queue); release still needs a human-approved smoke test. — [yage.ai](https://yage.ai/share/harness-engineering-survey-en-20260312.html); [Latent Space](https://latent.space/p/harness-eng)
- Human review: Codex self-reviews, other agents review in a loop; most human review is post-merge on a sample to find where teams struggle. Agents attach demo videos to PRs. — [yage.ai](https://yage.ai/share/harness-engineering-survey-en-20260312.html); [Latent Space](https://latent.space/p/harness-eng)
- Role change: engineers design environments, specify intent, build feedback loops; taste encoded in repo. Author describes himself as group tech lead removed from code; humans' scarce resource is synchronous attention, not tokens; focus humans on novel product ideas and deep refactors. — [yage.ai](https://yage.ai/share/harness-engineering-survey-en-20260312.html); [Latent Space](https://latent.space/p/harness-eng)
- Tooling choices: inner build loop under one minute (decompose build graph if slower); ~500 npm packages with strict boundaries; only six skills, encode missing loop steps into skills first ("cheaper to change agent behavior than human behavior"); Symphony (Elixir) orchestrator spawns a daemon per task, "rework" state discards worktree and restarts. >1B tokens/day called borderline negligent not to use; swyx estimate $2-3k/day. — [Latent Space](https://latent.space/p/harness-eng)
- Iteration principle: "When the agent struggles, we treat it as a signal"; missing tools/docs/guardrails added back to repo, written by Codex. — [Fowler](https://www.martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html)
- Critique: Fowler notes the post lacks "verification of functionality and behaviour", OpenAI has vested interest, "harness" appears once in the text; legacy codebases may not be worth retrofitting. — [Fowler](https://www.martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html)

### Inferences
- Pattern worth copying: every agent failure becomes a repo change (doc, lint, skill, test), not a prompt tweak. That is the loop that produced the throughput.
- The "merge fast" philosophy depends on cheap correction (fast CI, rollback, post-merge sampling, agent GC). Without those it is unsafe; OpenAI itself said so.
- Mechanical enforcement (linters, structural tests) plus error messages that tell the agent how to fix are the main lever; docs alone are weaker.

### Gaps
- Primary post unread (403). Exact quotes, the "golden principles" text, the lint error-message-as-remediation detail, and the exact 100-line figure are from secondaries; the Vercel 8KB AGENTS.md 100% vs 79% eval in yage.ai is unverified and tangential.
- Codex weekly-user figures seen in a Chinese article not verified; omitted from findings.
- Seniority: neither the Latent Space page nor Fowler addresses junior vs senior directly.

## 3. Implications for a harness serving senior and junior engineers

### Takeaway
Both sources move judgement into repo-encoded constraints and scoped work units, which lets juniors work inside guardrails while seniors spend time authoring the guardrails; neither source tests this claim.

### Cited Findings
- Practices embedded in the repo mean new people need not absorb them over months when Codex is the entry point (podcast summary, Chinese-language, secondary). — [search summary of talk/podcast coverage](https://sspai.com/post/107599) (not fetched; snippet only)
- Humans should be directed to where input matters, not eliminated. — [Fowler](https://www.martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html)
- "You are still responsible for the code you generate and eventually merge." — [Bastidood](https://bastidood.dev/articles/vertically-sliced-coding-agents/)

### Inferences
- Seniors: own the architecture layers, linters, golden principles, quality scores, and post-merge sampling review; set P0/P1 thresholds.
- Juniors: take slice-scoped tasks (one feature, one context window, mostly-new-code diffs), with the harness enforcing boundaries so they cannot break other slices; review burden shifts to agent review plus small collocated diffs.
- Risk: a junior may not recognise a bad but lint-clean change; Fowler's missing-behaviour-verification gap means a behavioural test/eval layer is needed beyond structure.
- Risk: merge-fast philosophy should be gated by throughput and rollback maturity; a junior-heavy team with low throughput should keep stricter gates (OpenAI's own caveat).

### Gaps
- No source evidence on junior outcomes, onboarding speed, or review quality at scale. These implications are my inference only.
