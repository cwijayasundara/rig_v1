# PRD fidelity: a requirements ledger, traced to the code review

Date: 2026-10-26. Source: `docs/feedback/feedback_1.html` (a colleague's sprint 0–1 run of rig).

## Why

Three bugs reached `src/store.js` in the colleague's repo: ids reused when `nextId` is not above every item id, duplicate
ids read from `cart.json`, and ids of 0 and below accepted. The PRD said "integer id starting at 1" and "ids are never
reused". ADR 0003 and the `store-hardening` intent said only "an integer id", so the build met its spec. The chart review
flagged bug 1 ("nothing stops nextId at or below the largest existing id") and the PR review flagged bug 3 ("accepts ids
of 0 and below", filed under Deferred). Both still shipped.

The PRD's words were lost at the chart, and nothing after the chart looked at the PRD again. Five gaps, from the code:

1. **Coverage is per FR, not per rule.** `traceReport` (`scripts/chartcheck.ts:112`) counts an FR covered when any intent
   lists it in `prd:`. An FR with five rules passes when four survive. Prose rules (a data-model paragraph, a sentence
   under an FR heading that is not an AC bullet) have no id and cannot be traced at all.
2. **Nothing checks a rule kept its meaning.** A behaviour that cites the right FR but drops "starting at 1" passes every
   check. None of the evaluator's seven categories (`agents/evaluator.md`) names this.
3. **Downstream of the chart only the intent is read.** `/rig:start` seeds `spec.md` from the intent; the PR review brief
   (`templates/review-brief.md`) and triage (`skills/pr/SKILL.md:15`) judge against `intent.md` and `spec.md`. A PR
   reviewer who sees code break the PRD has no PRD line to cite, so the finding becomes Deferred.
4. **"→ fixed" is self-certified.** After the one fix round in `/rig:chart` step 5 the coordinator appends `→ fixed` and
   sets `verdict: pass` itself ("Do not review twice").
5. **Approval ignores the chart review.** `approveChart` (`scripts/sdlc.ts:164`) blocks only on `chart check` findings;
   it never reads `chart-review.md`.

Success: on a PRD that states the id rules in prose, the chart's ledger quotes both rules, a behaviour cites each one and
keeps "starts at 1" and "never reused", the built spec carries both sentences word for word, and a PR whose code breaks
one gets a `correctness` finding that cannot be deferred.

## Goals

- Every sentence and bullet of a sprint PRD's requirement sections is accounted for in a ledger, checked by script.
- Every rule in the ledger is cited by at least one behaviour and one test case, or marked out of scope with a reason.
- A behaviour that cites a rule keeps that rule's constraints; the chart reviewer reports one that does not.
- The PRD's exact words reach `spec.md` and the PR reviewer.
- A chart with open review findings cannot be approved until each is fixed (and the fix confirmed) or waived by a person.

## Non-goals

- Helping the person write a better PRD. That is the next piece of work, picked up after this one.
- Changing the PRD copy. `.rig/product/sprints/sprint-<N>/prd.md` stays as it is produced today (owner, 2026-10-26).
- Re-charting already-approved sprints.

## Anti-goals

- A ledger the model can silently thin out. The verbatim check exists so a skipped sentence is a blocking finding, not a
  judgement call.
- Turning the chart into a second PRD the person must maintain. The ledger is generated from the PRD; the person edits
  the PRD, never the ledger, except to mark a row out of scope.

## Decided

**Separate ledger, PRD copy verbatim (owner).** The PRD copy is untouched beyond what step 1 of `/rig:chart` already
does. The rule-level ids live only in the ledger.

**Out of scope is a ledger row state, with a reason (owner).** A row may be marked out of scope with a reason and who
decided; the check then asks for no behaviour or case for it. The row stays, so the next sprint's chart sees it.

**Approval refuses while chart-review findings are open (owner).** `/rig:approve chart-<N>` fails while any finding under
`## Findings` of `chart-review.md` is neither confirmed fixed nor waived by a person.

## The ledger

`.rig/product/sprints/sprint-<N>/requirements.md`, written by the coordinator in `/rig:chart` step 1, right after the
gap pass (so answers given there are rows too). One line per row:

```
- FR-4.1 [rule] prd.md:71 "Each item has an integer id starting at 1."
- FR-4.2 [rule] prd.md:72 "Ids are never reused, even after an item is removed."
- FR-4.3 [context] prd.md:73 "This keeps scripts that store ids working." — motivation, not testable
- FR-6.1 [out-of-scope: sprint 2, decided by <person>] prd.md:90 "Export to CSV." — export is sprint 2
- FR-1.4 [answer] prd.md:47 "A boolean quantity is not an integer under AC-1.3 ..."
```

- **Id**: `<parent>.<n>`, the parent being the `FR-n`/`NFR-n` the sentence sits under; a sentence under no FR/NFR
  (a data model, a non-goal, a constraint section) gets the parent `G` (`G-1`, `G-2`). Where the PRD already has an
  AC id the row may add it as an alias after the id, e.g. `FR-4.1 (AC-4.1)`, so behaviours that cite the AC still trace.
- **Kind**: `rule` (a test could assert it), `context` (must carry a short reason), `out-of-scope: <when>, decided by
  <who>` (must carry a reason), `answer` (a chart-time answer already recorded in the PRD copy marked "(answered at
  chart)").
- **Quote**: the sentence or bullet exactly as in `prd.md`; the check compares after collapsing whitespace and stripping
  markdown emphasis and backticks.

An `answer` row quotes the answer's sentence without the ` (answered at chart)` marker; a multi-sentence answer is one row
per sentence, like any other text. `prd.md:<line>` is the line in the PRD copy as it stands when the ledger is written;
line numbers are never regenerated, and the tolerance in `ledger-misquote` absorbs small shifts.

Which text must be accounted for: every sentence, bullet and NFR table row of the PRD body except headings, HTML
comments, frontmatter, and the sections `Context and problem`, `Goals and success metrics`, `Risks and assumptions`,
`Changes since last sprint` and `Open questions`. Any section not on that list, including `Non-goals`, `Integrations and
constraints` and sections the person invented (`Data model`), is in. Unknown sections are in by default because that is
where the colleague's id rules most likely sat.

## Checks (`scripts/chartcheck.ts`, `chart check`)

New rules, all `block` unless stated:

- `ledger-missing`: the sprint has no `requirements.md`.
- `ledger-unquoted`: a sentence, bullet or NFR row in scope above is quoted by no ledger row. The message quotes it.
- `ledger-misquote`: a row's quote is not in `prd.md`, or its `prd.md:<line>` is wrong by more than a few lines.
- `ledger-reason`: a `context` or `out-of-scope` row with no reason, or an `out-of-scope` row with no `decided by`.
- `rule-uncovered`: a `rule` or `answer` row no behaviour cites (by id or alias).
- `rule-untested` (with `--cases`): a `rule` or `answer` row no test case cites.
- `unknown-id` extended: a behaviour, ADR or case citing a ledger id that does not exist.

Test cases cite ledger ids in the existing `Requirement` column of `cases.md` (today FR/NFR ids only); the
`templates/testplan-format.md` comment and the QA brief in `/rig:chart` step 4 say so. `parseCases` accepts both.

The existing FR-level rules stay. A behaviour still cites its FR (`- B2 (FR-4, FR-4.2): ...`); citing a ledger id whose
parent is the FR counts for both.

## The chart reviewer

`agents/evaluator.md` chart mode reads `requirements.md` too and gains two categories:

- **weakened**: a behaviour, ADR or case that cites a rule but drops or loosens one of its constraints (a number, a limit,
  a "never", "only", "every", "unique", a start value). The finding quotes the ledger row and the behaviour side by side.
- **ledger**: a row marked `context` that a test could assert, or an `out-of-scope` reason that does not hold.

The bug-1/bug-3 case is the reference example in the agent text.

## Closing the review loop

`/rig:chart` step 5 changes: after the one fix round, relaunch `rig:evaluator` once with the brief "confirm the fixes for
sprint <N>", the finding lines marked `→ fixed`, and nothing else. It rereads only the files those findings cite and
answers each `confirmed` or `reopened: <why>`. The coordinator rewrites each line's suffix to `→ fixed (confirmed)` or
removes the `→ fixed` and appends `→ reopened: <why>`. Line 1 is `verdict: pass` only when every finding is confirmed.
There is no second fix round; reopened findings go to the person.

## Approval

The finding grammar, so the parser is exact. Each item under `## Findings` is one `- ` bullet as the evaluator writes it
today; its number is its 1-based position under `## Findings`. The line may end with exactly one status suffix:

- `→ fixed (confirmed)`: fixed and confirmed by the confirm pass. Closed.
- `→ reopened: <why>`: the confirm pass rejected the fix. Open.
- `→ fixed` alone: claimed but never confirmed, which is how every review written before this change reads. Open.
- no suffix: open.

A waiver is not written into the line; it lives in `waivers.json` keyed by finding number and the line's text hash, so
a rewritten finding is not covered by a stale waiver.

`approveChart` refuses when any finding is open and not waived, listing each with its number. A missing
`chart-review.md` also refuses, naming `/rig:chart <N>` step 5 as the way to produce one. There is no other escape
hatch: an unapproved sprint charted before this change confirms its fixes or has a person waive them.

Waiving: a branch of the existing `waive` command keyed on a first argument `chart-<N>`:
`/rig:waive chart-<N> <finding number> <reason>`. Same human-only guard and `ownerOrFail` as today's waive; no active
change needed; no expiry (an approval decision, not a sensor suppression). Recorded in
`.rig/product/sprints/sprint-<N>/waivers.json` as `{ finding, text_sha, by, at, reason }`. No un-waive command: deleting
the entry by hand re-opens it.

What approval hashes: `requirements.md` and `waivers.json` join `ownFiles` (`scripts/chart.ts:54`), so editing the ledger
or a waiver after approval makes the chart stale. `chart-review.md` stays out of the digest, as today: it is evidence
read at approval time, not part of what was approved.

## After the chart

- **The change's requirements file.** No script writes `spec.md` today: `newChange` (`scripts/lifecycle.ts:38`) writes
  only `intent.md`, and the `/rig:start` model writes `spec.md` from the intent. So `S new <slug> --source <intent>` also
  writes `.rig/changes/<slug>/requirements.md`: every ledger row the intent cites (in `prd:` or in a behaviour, a bare FR
  id pulling in all its `rule` and `answer` rows), copied word for word with its id. The script writes it and the model
  never edits it, so nothing can paraphrase it. It joins `spec.md` and `plan.md` in the change's approved files
  (`APPROVED`, `scripts/lifecycle.ts:16`). `/rig:start`, `/rig:plan` and `/rig:build` read it next to `spec.md`.
- **PR review.** `templates/review-brief.md` tells the reviewer to read `.rig/changes/<slug>/requirements.md` and to report
  code that breaks a quoted sentence as `correctness`, citing the ledger id. `skills/pr/SKILL.md` triage: a finding that cites a
  ledger id is never moved to Deferred and never dismissed by the model; it is fixed in the wave or stays under Findings
  for the person.

## Already-approved sprints

The ledger rules apply to a sprint that is not yet approved. For an approved sprint, `chart check` reports
`ledger-missing` with severity `report`, and `/rig:start` writes no `## Requirements` section when the ledger is absent.

## Verification

- Specs that fail without the fix, in `scripts/chartcheck.spec.ts` and `scripts/chartskill.spec.ts`: a PRD with the
  colleague's id rules in a prose `## Data model` section and a ledger that omits one (blocks `ledger-unquoted`); a
  ledger that paraphrases (blocks `ledger-misquote`); a rule no behaviour cites (blocks `rule-uncovered`); an approval
  with an unconfirmed finding (refused) and with a waived one (accepted); `newChange` copying cited rows into `spec.md`.
- Eval: a second chart fixture (`eval/fixtures/chart/sprint-b.json` plus its PRD) stating the id rules in prose. The answer
  key lists the two rules and their must-keep phrases; `scoreChart` adds "rules quoted", "rules cited" and "constraints
  kept" (the citing behaviour contains the start value and a never-reused phrase). Live runs are started by a person.
- `npm test` and `npm run typecheck` green.

## Left to the builder

- The sentence splitter's details (abbreviations, list items that wrap, table rows) as long as the spec cases pass.
- The exact line-number tolerance for `ledger-misquote`.
- The wording added to the skill and agent texts, kept to the length limits those files already follow.
- Whether the confirm-fixes pass is a mode of `rig:evaluator` or a separate short brief, as long as it uses the evaluator.

## Calls made by Claude (check these)

- Ledger line format, the id scheme (`FR-4.2`, `G-n`, AC aliases) and the list of excluded context sections.
- Chart-time answers stay where step 1 puts them today (in the PRD copy, marked "(answered at chart)") and the ledger
  quotes them as `answer` rows. This keeps "verbatim" meaning "the person's text is not changed", as today.
- The coordinator writes the ledger, with no new agent; the script check keeps it honest.
- One confirm pass after the fix round, no second fix round.
- Waivers via `/rig:waive chart-<N> ...` and a `waivers.json` in the sprint folder, with no expiry and no un-waive command.
- Already-approved sprints are not forced to grow a ledger. Unapproved sprints charted before this change are: a plain
  `→ fixed` counts as open, so they need the confirm pass or a waiver.
- The PRD rows reach the build through a new script-written `.rig/changes/<slug>/requirements.md`, not through
  `spec.md`, because the model writes `spec.md`.
- `requirements.md` and `waivers.json` are hashed into the chart approval; `chart-review.md` is not.
