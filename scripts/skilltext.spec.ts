// Skill-text pickups (proposal 2026-10-25 A2-A4): the rules live in the skills, so a spec pins that they stay there.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const text = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8')

test('plan asks for end-to-end phases as a checkbox list, and points at the show-me views', () => {
  const plan = text('skills/plan/SKILL.md')
  assert.match(plan, /## Phases/)
  assert.match(plan, /- \[ \] Phase N/)
  assert.match(plan, /thin end-to-end step/)
  assert.match(plan, /templates\/show-me\.md/)
})

test('plan runs approve --check before handing the plan over', () => {
  assert.match(text('skills/plan/SKILL.md'), /approve <slug> --check/)
})

test('pr ends a local-only PR with the Next line and starts no further intent', () => {
  assert.match(text('skills/pr/SKILL.md'), /local-only.*Next: merge/s)
})

test('build ticks phases and resumes at the first unticked one', () => {
  assert.match(text('skills/build/SKILL.md'), /first unticked phase/)
})

test('the pr outline and the plan share one show-me template that has the diff, tree and call-tree views', () => {
  assert.match(text('skills/pr/SKILL.md'), /templates\/show-me\.md/)
  const t = text('templates/show-me.md')
  for (const w of ['`diff`', 'file tree', 'call tree']) assert.ok(t.includes(w), w)
})

test('start keeps open questions a person\'s, orders documents by recency and asks about the design system for UI', () => {
  const start = text('skills/start/SKILL.md')
  assert.match(start, /only a person closes an open question/)
  assert.match(start, /the latest wins/)
  assert.match(start, /design system/)
})

test('start reports the weight; plan writes light plans itself in 30 lines', () => {
  const start = text('skills/start/SKILL.md'), plan = text('skills/plan/SKILL.md')
  assert.match(start, /S weight <slug>/)
  assert.match(start, /--full/)
  assert.match(plan, /S weight <slug>/)
  assert.match(plan, /`light`: do not invoke `superpowers:writing-plans`[^]*at most 30 lines/)
  assert.match(plan, /`full`: invoke `superpowers:writing-plans`/)
})

test('start captures work with --from-diff and grills from the code; build skips the local red step and leaves it to red-proof', () => {
  const start = text('skills/start/SKILL.md'), build = text('skills/build/SKILL.md')
  assert.match(start, /S new <slug> --from-diff/)
  assert.match(start, /ask whether the person wants it, and record only confirmed behaviours/)
  assert.match(build, /`from-diff:` line[^]*no `--expect-fail` step[^]*red-proof[^]*must fail/)
  assert.match(build, /rewrite the test, never the base/)
})

test('start asks its foreseen questions in one batch and settles carried items', () => {
  const start = text('skills/start/SKILL.md')
  assert.doesNotMatch(start, /ask one question at a time/)
  assert.match(start, /one `AskUserQuestion` batch/)
  assert.match(start, /carried\/<slug>\.md/)
})

test('pr tells the builder to tag a review item for the intent that owns it, inside the blast radius it is fixed', () => {
  const t = text('skills/pr/SKILL.md')
  assert.match(t, /→ carry: <slug>/)
  assert.match(t, /cites a file `plan\.md` lists/)
})

test('build and the review brief look at raises after the commit point', () => {
  assert.match(text('skills/build/SKILL.md'), /after the commit point/)
  assert.match(text('templates/review-brief.md'), /after the commit point/)
})

test('chart reads the backlog at its gap pass', () => {
  assert.match(text('skills/chart/SKILL.md'), /\.rig\/product\/backlog\.md/)
})

// Person's rule 2026-10-28: every Sonnet output in rig is evaluated by Opus.
test('no skill evaluates with sonnet', () => {
  const files = [...fs.readdirSync(path.join(root, 'skills')).map(d => `skills/${d}/SKILL.md`), ...fs.readdirSync(path.join(root, 'templates')).filter(f => /brief|\.yml$/.test(f)).map(f => `templates/${f}`)].filter(f => fs.existsSync(path.join(root, f)))
  assert.ok(files.length > 10)
  for (const f of files) for (const sentence of text(f).split(/(?<=[.:;])\s+|\n/)) {
    if (/review|confirm|evaluat/i.test(sentence)) assert.doesNotMatch(sentence, /model: sonnet|model `sonnet`/, `${f}: ${sentence.slice(0, 120)}`)
  }
})

test('testplan and plan hand their output to the Opus evaluator once', () => {
  assert.match(text('skills/testplan/SKILL.md'), /rig:evaluator|rig-evaluator/)
  const plan = text('skills/plan/SKILL.md')
  assert.match(plan, /rig:evaluator|rig-evaluator/)
  assert.match(plan, /spec\.md and plan\.md/)
})

test('the evaluator has change plan and test plan modes, and the skills name the mode and the output file', () => {
  const ev = text('agents/evaluator.md')
  assert.match(ev, /## Change plan mode/)
  assert.match(ev, /plan-review\.md/)
  assert.match(ev, /## Test plan mode/)
  assert.match(ev, /testplan-review\.md/)
  assert.doesNotMatch(ev, /security-review/)
  assert.match(text('skills/plan/SKILL.md'), /change plan mode[^\n]*plan-review\.md/)
  assert.match(text('skills/testplan/SKILL.md'), /test plan mode[^\n]*testplan-review\.md/)
})

test('CI reviews run on opus, and a re-chart keeps the generated sections', () => {
  assert.doesNotMatch(text('templates/rig-check.yml'), /--model sonnet/)
  assert.match(text('skills/chart/SKILL.md'), /Added during the change[^\n]*carried\/[^\n]*verbatim/)
  assert.match(text('agents/architect.md'), /Added during the change[^\n]*carried\/[^\n]*verbatim/)
})

test('the pr skill fixes only Deferred items in the wave, never Unverifiable', () => {
  assert.match(text('skills/pr/SKILL.md'), /Each Deferred item \(never an Unverifiable one\) that cites a file `plan\.md` lists/)
})

test('Opus reviews are gated on risk: plan evaluates only a full or contract plan; pr reviews by tier (0 none, 1 code review, 2 both)', () => {
  const plan = text('skills/plan/SKILL.md'), pr = text('skills/pr/SKILL.md')
  assert.match(plan, /Launch `rig:evaluator` once[^\n]*only when[^\n]*`full`[^\n]*## Contracts/)
  assert.match(plan, /otherwise[^\n]*S approve <slug> --check/)
  assert.match(pr, /S risk <slug> --pre-review --json/)
  assert.match(pr, /tier 0: no agent review[^\n]*reviewer: none/i)
  assert.match(pr, /tier 1: the code review only/i)
  assert.match(pr, /tier 2: both reviews/i)
})
