// A live run of `/rig-chart sprint 0: docs/prd/shopping-cart-app-prd.md` stopped because the PRD was a free-form draft,
// not .rig/product/sprints/sprint-0/prd.md. init already tells the person to copy such a PRD; chart must do it, not stop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const skill = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/chart/SKILL.md'), 'utf8')

test('chart skill: a draft PRD path is converted to the sprint PRD, not a reason to stop', () => {
  assert.match(skill, /\*\*Take it as given\.\*\*[^\n]*\.rig\/product\/sprints\/sprint-<N>\/prd\.md/)
  assert.match(skill, /FR-n/)
  assert.match(skill, /never invent/i)
})

test('chart skill: the draft is converted only when a path is given, and a missing PRD with no path still stops', () => {
  assert.match(skill, /no path[^\n]*stop/i)
})

test('chart skill: argument-hint accepts any PRD path', () => {
  assert.match(skill, /argument-hint: '<sprint number \| [^']*PRD path/)
})

// A live run of `/rig-chart 1 docs/prd/shopping-cart-app-prd.md` stopped: the argument had no `sprint N:` prefix, so the
// PRD was judged to be in the wrong format. The person's PRD is accepted in any format, from any path; chart only asks
// for what it lacks (technology, NFRs).
test('chart skill: a number and a path in any order is accepted, with no format gate', () => {
  assert.match(skill, /any format/i)
  assert.match(skill, /`<N> <path>`|<N> <path>/)
  assert.doesNotMatch(skill, /written by the product owner and BA from/i)
})

test('chart skill: asks the person for the technology and the NFRs the PRD lacks, and records the answers', () => {
  assert.match(skill, /AskUserQuestion/)
  assert.match(skill, /technology/i)
  assert.match(skill, /NFR/)
  assert.match(skill, /never invent/i)
})

// The first live run of `/rig-chart 1` found four PRD gaps only after the architect ran, kept the answers out of the PRD, ended at
// "Next: /rig:testplan" and had no independent review (design 2026-10-18-chart-one-turn-and-reviewer).
test('chart skill: runs gap pass, architect, QA and review before one commit', () => {
  for (const w of ['answered at chart', 'chart-review.md', 'rig:evaluator', 'general-purpose', 'sonnet']) assert.ok(skill.includes(w), w)
  assert.ok(skill.indexOf('chart-review.md') < skill.lastIndexOf('git commit'), 'the commit comes after the review')
  assert.equal(skill.match(/git commit/g)?.length, 3, 'the allowed-tools grant, the base commit of init output and the one chart commit')
})

test('chart skill: the gap pass is one batched question set that skips when there are no gaps', () => {
  assert.match(skill, /one `AskUserQuestion`[^\n]*(?:batch|at most 4)/i)
  assert.match(skill, /no gaps[^\n]*skip|skip[^\n]*no gaps/i)
})

test('chart skill: ends at the approve gate and does not hand the person a second command', () => {
  assert.doesNotMatch(skill, /Next: `?\/rig:testplan/)
  assert.match(skill, /\/rig:approve chart-<N>/)
})

// A live run of `/rig:chart 1` in shop_app committed the chart on `rig/chart-1` in a repo with no commits: init's output was
// never committed, so there was no `main` for approve, the PR or CI to diff against.
test('chart skill: commits init output as the base after asking, instead of stopping, before any work', () => {
  assert.match(skill, /allowed-tools:[^\n]*Bash\(git rev-parse\*\)/)
  const step1 = skill.slice(skill.indexOf('1. **Which sprint'), skill.indexOf('2. **Architect'))
  assert.match(step1, /git rev-parse --verify HEAD[^\n]*fails/i)
  assert.match(step1, /git status --porcelain[^\n]*\.rig\/sensors\.json/)
  assert.match(step1, /AskUserQuestion[^\n]*Commit init/)
  assert.match(step1, /git commit -m "chore: rig init scaffold"/)
  assert.ok(skill.indexOf('git rev-parse --verify HEAD') < skill.indexOf('**Take it as given.**'), 'checked before the PRD is copied')
})

test('chart skill: names the QA agent model by alias and never launches the architect with a model override', () => {
  assert.match(skill, /model `?sonnet`?/)
  assert.doesNotMatch(skill, /claude-(?:opus|sonnet|haiku)-\d/)
})

test('chart step 2 invokes superpowers:brainstorming by name before the architect and fixes the design doc path and ## Intents shape', () => {
  const body = skill.slice(skill.indexOf('\n---\n', 4))
  assert.match(body, /superpowers:brainstorming/)
  assert.ok(body.indexOf('superpowers:brainstorming') < body.indexOf('rig:architect'))
  assert.match(body, /docs\/superpowers\/specs\/<date>-sprint-<N>-design\.md/)
  assert.match(body, /- <slug>: <one-line scope> \(<PRD ids>\)/)
  assert.doesNotMatch(body, /What's the moment you find yourself wishing/, 'the skill names the brainstorm, it does not restate it')
})

test('the architect brief names the design doc and the design: frontmatter line', () => {
  const architect = fs.readFileSync(path.resolve(import.meta.dirname, '../agents/architect.md'), 'utf8')
  assert.match(architect, /design: <repo-relative path>/)
  assert.match(architect, /one intent per line of the design doc's `## Intents`/)
  assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '../templates/architecture-format.md'), 'utf8'), /design: <path or none>/)
})

// The chart reviewer got the design doc as a source but the QA agent did not, so a case could be judged against reasoning its writer never saw.
test('the QA brief names the design doc, in the chart skill and in the testplan skill', () => {
  const between = (text: string, from: string, to: string): string => {
    const a = text.indexOf(from), b = text.indexOf(to)
    assert.ok(a >= 0 && b > a, `${from} comes before ${to}`)
    return text.slice(a, b)
  }
  const chartQa = between(skill, '4. **QA.**', '5. **Review.**')
  assert.match(chartQa, /the design doc at the path the architect brief names/)
  const testplan = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/testplan/SKILL.md'), 'utf8')
  const tpQa = between(testplan, '2. **QA.**', '3. **Check.**')
  assert.match(tpQa, /`<date>-sprint-<N>-design\.md` in the directory of the `design:` path/)
  assert.match(tpQa, /names only the newest sprint's doc/)
  assert.match(tpQa, /`none`, an unset line or a `<\.\.\.>` placeholder means there is none/)
})

test('the architect writes ## Access when the PRD has roles, and QA writes an allowed and a refused case per interface', () => {
  const text = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8')
  assert.match(skill, /fill `## Access` in `architecture.md`/)
  assert.match(skill, /one allowed and one refused case per interface[^\n]*`<action>: allowed <interface>`/)
  assert.match(text('skills/testplan/SKILL.md'), /one allowed and one refused case per interface[^\n]*`<action>: allowed <interface>`/)
  assert.match(text('templates/architecture-format.md'), /^## Access$/m)
  assert.match(text('templates/architecture-format.md'), /\| Action \| Allowed \| Interfaces \| Intent \|/)
  assert.match(text('templates/testplan-format.md'), /\| Expected \| Access \|/)
})

// A live sprint-1 chart fixed layering by replacing "checked by review" with an `ast` test in the architecture, intents and ADR,
// but the design doc the architect drew from still said "by review". The fix round must keep that doc in step.
test('chart skill: the fix round updates the design doc lines a fix contradicts', () => {
  assert.match(skill, /fix round[^\n]*design doc[^\n]*(contradict|out of date|in step)/i)
})

// A live sprint-1 chart wrote import-check cases as "imports only argparse, os, sys, pathlib" and "imports only cart.errors",
// which a builder's `typing`, `dataclasses` or `from __future__` import would fail; and its fix round put TC-68..71 before TC-51.
test('testplan format: import checks forbid modules instead of listing "only", and rows stay in ID order', () => {
  const t = fs.readFileSync(path.resolve(import.meta.dirname, '../templates/testplan-format.md'), 'utf8')
  assert.match(t, /never "imports only X"/)
  assert.match(t, /`typing`, `dataclasses`/)
  assert.match(t, /Rows stay in ID order[^\n]*next free ID/)
})

// 2026-10-25 shop_app chart: after a fix round that fixed all five findings, chart-review.md still said `changes-needed`, and a
// finding the reviewer gave to QA alone left the architect's intent line contradicting the fixed case.
test('chart skill: the fix round marks findings fixed and rewrites the verdict, and routes a finding by the files it cites', () => {
  assert.match(skill, /append ` → fixed` to each finding line/)
  assert.match(skill, /Set line 1 to `verdict: pass` only when every item under `## Findings` is confirmed; leave `changes-needed` otherwise/)
  assert.match(skill, /a finding citing files of both goes to both/)
})

const text = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8')

// 2026-10-26 owner: a sprint implementation plan to allocate intents to engineers, and ASCII twins of the architecture's mermaid diagrams.
test('chart has the architect write implementation-plan.md and ends by naming both sprint plan files', () => {
  const skill = text('skills/chart/SKILL.md'), architect = text('agents/architect.md')
  assert.match(skill, /implementation-plan-format\.md/)
  assert.match(skill, /the architect owns intents, `implementation-plan\.md`/)
  assert.match(skill, /`\.rig\/product\/sprints\/sprint-<N>\/plan\.md` \(build order\) and `\.rig\/product\/sprints\/sprint-<N>\/implementation-plan\.md` \(tasks and lanes\)/)
  assert.match(architect, /one lane per engineer the PRD's `engineers:` gives/)
  assert.match(architect, /Leave `owner:` in the intents empty/)
  assert.match(architect, /mermaid architecture diagram and its ASCII twin/)
  assert.match(text('templates/architecture-format.md'), /ASCII diagram in a ```text block/)
  assert.match(text('agents/evaluator.md'), /`implementation-plan\.md`/)
})

test('/rig:plan starts from the intent section of the sprint implementation plan', () => {
  assert.match(text('skills/plan/SKILL.md'), /`### <slug>` section of `implementation-plan\.md`[^.]*first/)
})

// 2026-10-26 PRD fidelity (docs/feedback/feedback_1.html): "starting at 1, never reused" became "an integer id" and three id bugs shipped.
const fidelity = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8')
test('chart step 1 keeps the original as source.md, converts a PRD not in format, and generates the ledger', () => {
  const step1 = skill.slice(skill.indexOf('1. **Which sprint'), skill.indexOf('2. **Design.**'))
  assert.match(step1, /source\.md[^\n]*never edit/i)
  assert.match(step1, /`S prd check <N>/)
  assert.match(step1, /templates\/prd-format\.md/)
  assert.match(step1, /\*\*Convert\.\*\*[^\n]*conversion\.md/)
  assert.match(step1, /word for word/)
  assert.match(step1, /cells joined by " \| "/)
  assert.match(step1, /\(out of scope: <when>, decided by <who> — <reason>\)/)
  assert.match(step1, /`S prd map <N>/)
  assert.match(step1, /check the conversion for sprint <N>[^\n]*conversion-review\.md/)
  assert.match(step1, /`S prd status <N>`[^\n]*\/rig:approve prd-<N>[^\n]*\/rig:chart <N>/)
  assert.match(step1, /re-run[^\n]*never rewrite `prd\.md` or `source\.md`/i)
  assert.match(step1, /\*\*Requirements ledger\.\*\*[^\n]*`S prd ledger <N>`[^\n]*never write or edit it yourself/)
})

test('the conversion reviewer: a conversion mode that reports weakened, invented and ledger, and reads the original', () => {
  const evaluator = fidelity('agents/evaluator.md')
  assert.match(evaluator, /## Conversion mode[\s\S]*\*\*weakened\*\*[\s\S]*\*\*invented\*\*[\s\S]*\*\*ledger\*\*/)
  assert.match(evaluator, /## Conversion mode[\s\S]*source\.<ext>/)
})

test('init points the person to the PRD template', () => {
  assert.match(fidelity('skills/init/SKILL.md'), /templates\/prd-format\.md/)
})

test('the architect cites ledger ids and keeps every constraint of the rows it cites', () => {
  const architect = fidelity('agents/architect.md')
  assert.match(architect, /requirements\.md/)
  assert.match(architect, /\(FR-4, AC-4\.1\)/)
  assert.match(architect, /\(FR-4, DR-2\)/)
  assert.match(architect, /never\b[^\n]*only\b[^\n]*unique/)
  assert.match(skill.slice(skill.indexOf('**Architect.**'), skill.indexOf('3. **Check.**')), /requirements\.md/)
  assert.match(fidelity('templates/intent-format.md'), /\(FR-4, AC-4\.1\)/)
})

test('QA cites ledger ids in the Requirement column and gives every rule and answer row a case', () => {
  assert.match(skill.slice(skill.indexOf('4. **QA.**'), skill.indexOf('5. **Review.**')), /every `rule` and `answer` row of `requirements\.md`/)
  assert.match(fidelity('templates/testplan-format.md'), /Requirement: one or more FR\/NFR ids and the requirements\.md ids/)
})

test('chart step 5 confirms the fixes once, and only a confirmed fix or a person\'s waiver closes a finding', () => {
  const step5 = skill.slice(skill.indexOf('5. **Review.**'), skill.indexOf('6. **Plan view.**'))
  assert.match(step5, /confirm the fixes for sprint <N>/)
  assert.match(step5, /→ fixed \(confirmed\)/)
  assert.match(step5, /→ reopened: <why>/)
  assert.match(step5, /waive chart-<N> <finding number> <reason>/)
  assert.match(skill.slice(skill.indexOf('8. ')), /waive chart-<N>/)
})

test('the chart reviewer reads the ledger, reports weakened rules and ledger misuse, and has a confirm mode', () => {
  const evaluator = fidelity('agents/evaluator.md')
  assert.match(evaluator, /requirements\.md/)
  assert.match(evaluator, /\*\*weakened:\*\*[^\n]*starting at 1/)
  assert.match(evaluator, /\*\*ledger:\*\*/)
  assert.match(evaluator, /## Confirm mode[\s\S]*confirmed[\s\S]*reopened: <why>/)
  assert.match(evaluator, /one of the nine above/)
})

test('start, plan and build read the change requirements.md and never edit it', () => {
  for (const f of ['skills/start/SKILL.md', 'skills/plan/SKILL.md', 'skills/build/SKILL.md']) assert.match(fidelity(f), /requirements\.md[^\n]*never edit/, f)
})

test('chart step 1 on a re-run of a converted sprint checks prd status first and never reviews the conversion twice', () => {
  const step1 = skill.slice(skill.indexOf('1. **Which sprint'), skill.indexOf('2. **Design.**'))
  assert.match(step1, /re-run[^\n]*`S prd status <N>` first[^\n]*`approved`[^\n]*ledger[^\n]*otherwise[^\n]*`S prd check <N>`[^\n]*`S prd map <N>`[^\n]*stop/i)
  assert.match(step1, /gap pass and the conversion review run on the first pass only/i)
})

// A tester asked for a suggested PRD directory, sprint by sprint (2026-10-26): chart finds docs/prd/sprint-<N>/prd.md first,
// then the older flat docs/prd/sprint-<N>.md, and keeps the files beside a folder PRD (mockups, samples) with source.md.
test('chart skill: looks for docs/prd/sprint-<N>/prd.md before docs/prd/sprint-<N>.md, and copies the folder\'s other files', () => {
  const step = skill.split('\n').find(l => l.startsWith('1. **Which sprint, which PRD.**')) ?? ''
  const folder = step.indexOf('docs/prd/sprint-<N>/prd.md'), flat = step.indexOf('docs/prd/sprint-<N>.md')
  assert.ok(folder > 0 && flat > folder, 'folder form first, flat form as the fallback')
  assert.match(skill, /other files in (that|the PRD's) folder[^\n]*attachments\//i)
})
