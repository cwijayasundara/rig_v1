# Code wiki: design

Date: 2026-10-17. Goal item 3 in `docs/GOAL.md` (the code wiki, built on `init` and kept fresh). The learning loop (memory, dreaming,
rule proposals) is goal item 4 and is a separate design.

## Intent

A wiki of the codebase for engineers, in the style of Devin's DeepWiki (<https://docs.devin.ai/work-with-devin/deepwiki>):
architecture and module pages with diagrams and links into the source, committed in the repo, steered by a small config file.
Its readers are people onboarding, reviewing a change, or planning one. Claude may also read it, but it is not judged on search.

Why this shape: an eval on 2026-10-17 (native Grep/Read versus an oracle file index, 6 questions, 37-file fixture, Haiku) gave 6/6
correct on both arms and saved about one search call per question. Native tools already find code cheaply, so a search index
shows no lift. The wiki's value is understanding: flows across modules, how the parts fit, what a change touches.

## What counts as failure

The engineer's two worst experiences, in their own words: **wrong claims** and **stale content**. A wiki with either is worse than
none, because it is trusted. Every design choice below serves those two.

## Goals

1. Pages an engineer can skim and trust: overview, a Mermaid diagram, key flows, links to source.
2. Every factual claim is cited and machine-checkable.
3. Staleness is detected deterministically, cheaply, and shown to the reader.
4. Built on `init` for an existing codebase; refreshed per change, not per commit.
5. Steerable by the team through one committed file.

## Non-goals

- Not a search index and not a prompt-injected map. No hook injects it into sessions.
- No "why" narrative from the model's imagination. A "why" statement is allowed only when it cites an ADR, a commit or a PR.
- No hosted site, no chat UI, no cross-repo wiki.
- Not a replacement for the human-written `CLAUDE.md` or `README.md`.

## Anti-goals (a failure even if it technically works)

- A page that reads well but contains a claim the code does not support.
- A refresh that silently rewrites pages whose sources did not change.
- A PR check that blocks a merge over wiki staleness.
- A wiki that costs more to keep fresh than it saves anyone.

## Design

### Files

- `.rig/wiki.json`: the steering file (committed). Repo-level `notes` plus `pages`: each has a unique `title`, a `purpose`, an
  optional `parent`, optional `notes`, and optional `paths` (repo-relative files or directory prefixes the page is built from; added at build time because a page needs a source scope, my call). When present, only the listed pages are generated. When absent, a first pass proposes
  one and stops for a person to edit it. Page cap: 30 (my call; Devin's is 30 for non-enterprise).
- `.rig/wiki/<page>.md`: the generated pages (committed). `.rig/wiki/index.md` lists them with their status.
- Each page starts with front matter recording, per citation, a hash of the cited symbol's code.

### Citations (these rules are my calls)

- **Every sentence in a page body ends with a citation.** No free prose: headings, the page's one-line purpose from `wiki.json`
  and diagram captions are exempt. This makes the check deterministic (a sentence without a trailing citation fails) and needs
  no model to decide what is "factual". Pages are therefore terse, closer to annotated bullets than essays.
- Form: `[path#symbol]`; `[path]` when a whole file is the subject; `[path#a..b]` is not allowed (line ranges rot).
- Diagram nodes cite a symbol or file. An edge cites the symbol whose code makes the call or import; if it has none, it cites the
  caller's file.
- A "why" sentence cites `[adr:NNNN]`, `[commit:<sha>]` or `[pr:<number>]`. The target must resolve locally (ADR file, commit in
  history, PR number recorded in a merge commit or `.rig` change record). A repo with none of these has no "why" sentences. A
  "why" citation is never stale, since commits and PRs do not change.
- **Hash:** the symbol's declaration text (signature and body, comments stripped, whitespace normalised). A file citation hashes
  the normalised file, so those citations are more sensitive; pages should prefer symbols. The LSP path and the regex fallback
  must return the same span or the check reports "unresolved", never a different hash. A renamed or moved symbol is stale until
  the page is refreshed (no rename-following in v1).

### Against wrong claims

1. **Deterministic validation (free).** Every cited path exists, every cited symbol resolves, no uncited factual sentence, links
   and Mermaid parse.
2. **Claim review (one Sonnet pass, clean context).** For each claim, read it beside the cited code and mark `supported`,
   `unsupported` or `contradicted`. Unsupported and contradicted claims are removed, not softened. A page that loses more than
   a set share of its claims is regenerated once and then reported.

### Against stale content

- Each citation stores a hash of the symbol's code, not the file. An unrelated edit in the same file does not flag the page.
- `wiki status` (deterministic, free) lists pages with a changed or missing citation, naming the citation.
- The PR check runs `wiki status` and **warns only, never blocks**: a comment names the stale pages and citations. `wiki status`
  is read-only. It writes nothing, so a status run never produces a diff. The banner lives in the PR comment and the
  `wiki status` output, not in committed pages. (My call, from the reviewer's point that a committed banner would dirty the
  tree on every run.)
- Page status and the commit each page was last built at live in `.rig/wiki/state.json` (committed, written only by `build`
  and `refresh`).
- `wiki refresh` regenerates only stale pages, given the diff since the recorded commit, then runs the same two validation steps.
  Triggers: on request and at sprint close. It never runs per commit and has no CI job in v1.

### Models

Sonnet writes pages and does the claim review. The first-pass page planner for a repo without `wiki.json` is Sonnet too. No Opus.
(This follows the pinned roles in `CLAUDE.md`; it is my call, not the person's.)

### Commands (my call on names)

`wiki init` (plan only), `wiki build`, `wiki status`, `wiki refresh`, `wiki verify`.

Flow (my call): `/rig:init` on an existing codebase runs `wiki init`, which proposes `.rig/wiki.json` and stops. A person edits
it. `wiki build` generates the pages (all, or `--page <title>`), validates them and records state. `wiki verify` runs validation
and claim review on demand. `/rig:init` does not wait; it tells the person the next command.

**Budget (my call):** `build` and `refresh` print a pre-flight estimate. With `--max-usd N` they abort before spending if the
estimate exceeds N. Without the flag they only report the cost afterwards.

**Sensors (my call):** `.rig/wiki/` and `.rig/wiki.json` are excluded from rig's sensors and test-tamper checks. Wiki commits go
through the normal change flow; they are not a bypass.

## Evals

The old `evals/wiki-search.json` is retired: it measured search, and the 2026-10-17 run shows no room for lift. Replace it with
engineer-facing checks, each needing an arm in `eval/`:

1. **Accuracy:** 5-8 questions about cross-module flows and change impact on a larger fixture (30+ files, real indirection). Score
   the wiki page's answer against a key. Baseline: native Claude with no wiki.
2. **Claim support:** on generated pages, the share of claims marked `supported` by an independent review, target set after the
   first run.
3. **Drift detection:** edit a cited symbol, assert exactly the pages citing it become stale and no others (deterministic test).
4. **Cost:** tokens and dollars to build, and to refresh after a typical change.

The fixture, its key and the scoring are new work to build (my call): a 30+ file repo, 8 questions, scored by an exact-match
key on the files and flow steps named, not by a model. "Beats native" means the wiki arm gets at least 2 more of the 8 right, or
the same number right at lower tokens, over 3 runs per arm (my call; adjust once the first numbers exist).

Rule: if the wiki does not beat native on check 1, or claim support is poor after two passes, cut it.

## Constraints

- Thin layer, native first (`feedback-no-pruning-without-evidence`). Do not rebuild what native covers.
- Hooks and scripts are deterministic; only page writing and claim review use a model.
- Cost per `init` and per refresh is reported, with a budget flag.
- Per `CLAUDE.md`: fix the harness, not generated pages. A wrong page means fixing the generator and regenerating.

## Left to the builder

Citation syntax details, symbol resolution per language (start with TypeScript and JavaScript; use LSP where available, fall back
to a regex of declarations), page template wording, the share of dropped claims that triggers a regeneration, the exact CI job
shape, and how `wiki.json` proposals are presented for editing.

## Open, for later

- CI-opened refresh PRs (needs an Anthropic API key and a Sonnet call outside a session). Decided 2026-10-17: out of scope for
  v1. Refresh runs on request and at sprint close; the PR check only runs the free `wiki status` and warns. Add CI later if wanted.
- How the wiki relates to the learning loop (memory may cite wiki pages). Decide in that design.
- Languages beyond TS/JS.
