# Dune (poteto / Lauren Tan) and the Grok Bot agent stack

## What is Dune, and where does it live?

### Takeaway
Dune is NOT a public coding-agent harness. It is an internal, unreleased, working-title application framework ("Next.js for Electron apps, designed for agent-written code") that the Grok Bot client was rebuilt on. No public repo, site or docs found. The agent orchestration pieces that are public are pstack (plugin) and Noodle (Go orchestrator), which are separate from Dune.

### Cited Findings
- Dune is described as "Next.js for Electron apps, designed specifically for agent-written code"; the idea is to make the correct pattern the only easy pattern. Named an internal codename for the Grok Bot architecture. Secondary source, relays a talk/36Kr/Maven workshop which the author could not verify — [HappyRock blog](https://happyrock.cloud/blog/2026-09-02_b_en/)
- The pstack guide states Dune is an internal framework and not part of pstack; Tan mentioned it in a talk as banning comments outright; pstack's `no-comments` skill is its counterpart — [redreamality pstack guide](https://redreamality.com/garden/notes/pstack-skills-guide/)
- Search summaries (snippets of X posts, not fetched directly) say: Grok Bot beta launched Aug 11; first client was a prototype, then rebuilt on a framework designed for agents to write, codenamed Dune (working title) — [search results incl. X posts](https://x.com/poteto/status/2087227636590465030)
- A reply by Mark Villacampa says the name fits because the product is codenamed "Sand" (single user remark, unconfirmed) — [X](https://x.com/MarkVillacampa/status/2087458215386632229) (snippet only; fetch returned 402)
- github.com/poteto/dune returned 404. poteto's first repo page (30 of 85) lists no dune, pstack or poteto-mode repo — [GitHub poteto repos](https://github.com/poteto?tab=repositories&q=&sort=updated). pstack lives at cursor/plugins (pstack dir), MIT per one secondary source — [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack)
- The announcement post (x.com/poteto/status/2087244771849089270) could not be fetched (HTTP 402); its text and replies are unverified by me.

### Inferences
- Dune is likely closed source inside xAI/SpaceX; "reportedly the basis of Grok Bot" is accurate only for the Grok Bot client app, not the multi-agent orchestration.
- Its design ethos (architecture-enforced conventions) is a client-framework approach, i.e. conventions encoded in structure/CI rather than prompts.

### Gaps
- Original X post text/replies, repo, license, language, docs: not found/not accessible. Only 1 of 3 pages of poteto's repo list was seen. No HN/Reddit/YouTube coverage found in limited searching.

## How is it designed / how does it enforce conventions?

### Takeaway
Publicly known design is a layered guardrail model: structure first, then CI, then rules/skills/review bots. Nothing about an agent loop inside Dune itself.

### Cited Findings
- CI hard-fails on `useEffect` and on code comments (agents write comments with hallucinated historical context) — [HappyRock](https://happyrock.cloud/blog/2026-09-02_b_en/)
- Electron main and renderer code in separate directories; CI checks the import graph and fails cross-directory references (protects 16ms frame budget) — same source
- Three layers: (1) architecture (hardest to bypass), (2) CI/lint/compiler hard-fail, (3) rules/skills/review bots (agents tend to ignore). Refactor took 600+ PRs — same source
- Stated rule: anything typed in a PR comment more than 3 times becomes a lint rule or CI failure — same source
- Quote: "Agents guess, and they don't know they're guessing." — same source

### Inferences
- Directly relevant to rig: favour enforcement by structure/CI over skill text.

### Gaps
- No primary source for these claims (secondary blog citing a talk); code samples in that blog are illustrative, not real.

## How does the agent orchestration work (loop, verification, memory, review, HITL)?

### Takeaway
Orchestration is Grok Bot managing Cursor Cloud Agents, driven by pstack's `/poteto-mode` router; verification via driving the real app. Noodle is Tan's separate open-source orchestrator (Go).

### Cited Findings
- Reported 20+ parallel agents, 1,000+ PRs/month personally, goal 2,000+; five specialist bots (iOS, Desktop/CI/CD, Infra/User Issues, Android, Harness/Test) each with independent memory and scoped context; Cursor Cloud Agents scale 15 to 200+ concurrent; Grok Bot creates, prompts, monitors, verifies — [HappyRock](https://happyrock.cloud/blog/2026-09-02_b_en/) (secondhand; numbers unverified)
- Verification: "control glass" (driving app via Chrome DevTools Protocol), a feature map, blind skill evals judged by a different model family — same source. Public examples: poteto/verification-skill-example ("project-local verification skill + large-app feature map") — [GitHub](https://github.com/poteto?tab=repositories&q=&sort=updated)
- pstack: 51 skills (23 playbooks, ~24 principles). `poteto-mode` reads request, picks a playbook, builds a task list from its steps (skipped steps kept with reason); must name principle applied; labels claims measured/inferred/guess; code playbooks end with "open a PR"; reversible work proceeds without asking, irreversible (force-push, deploy) waits for the user; subagents start fresh with original brief; no default planning skill ("the best spec is code") — [redreamality](https://redreamality.com/garden/notes/pstack-skills-guide/)
- Models dispatched by role (precise code, fast mechanical, judgment, review panel) — [HappyRock](https://happyrock.cloud/blog/2026-09-02_b_en/)
- Noodle: github.com/poteto/noodle, "Orchestrate agents using skills", Go, MIT; dirs include brain, dispatcher, loop, monitor, worktree, skill, event; docs at noodle-run.github.io/noodle (not read) — [GitHub](https://github.com/poteto/noodle)
- Other poteto repos: brainmaxxing ("stupid simple persistent memory and skill improvement", Python), how ("skill for explaining architecture"), benny-avatars (mirror of avatars used by "orchestrate skill Slack bot") — [GitHub](https://github.com/poteto?tab=repositories&q=&sort=updated)
- Grok Bots can launch Cursor Cloud Agents as manager; every Cloud Agent runs /poteto-mode (search summary, secondary) — [search](https://x.com/bossriceshark/article/2094074367324168595)

### Inferences
- Noodle's directory names suggest a worktree-per-task dispatcher with a loop and monitor; unverified, docs not read.

### Gaps
- Noodle docs, pstack README (primary), Tan's talk video, 36Kr report, Maven workshop not read. Results data (defect rates, cost) not found. X and some pages returned 402.

## Relation to Grok Bot and results at scale

### Takeaway
Dune underlies the Grok Bot client (rewritten after the Aug 11 beta); scale claims (1,000+ PRs/month, 20+ agents) are secondhand.

### Cited Findings
- Tan announced Grok Bot launch ("Bots do work on their own computers..."; she uses it for calendar and shipping code) — [X post](https://x.com/poteto/status/2087227636590465030)
- Scale numbers as above — [HappyRock](https://happyrock.cloud/blog/2026-09-02_b_en/)
- Other secondary articles exist but were not read: [Grok Bot x Cursor: The Harness Era](https://x.com/bossriceshark/article/2094074367324168595), [Who is Lauren Tan](https://x.com/mvanhorn/status/2111481455906103390), [Grok Bot + Opus 5.5 in 10 steps](https://x.com/i/article/2108171726412464173)

### Inferences
- Treat PR counts as self-reported; no independent quality measures found.

### Gaps
- No official xAI documentation of Dune; no independent results.
