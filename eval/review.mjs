// The clean-context review eval (harness readiness 2.2): over finished changes with a seeded defect, does a reviewer that sees only the diff and
// the intent catch more, and raise fewer false findings, than one that also holds the builder's own notes (the same-context review)?
// Both arms get the same review brief, the same diff, intent, spec, plan and the files the change touches, and no tools; only the builder's
// notes differ. A finding counts as catching a defect when it names the defect's file and matches its pattern: never a model's judgement.
// node eval/review.mjs [--runs 3] [--model claude-sonnet-5-5] [--max-usd 8] [--results FILE] [--dry]
// A live run costs money and a person starts it. --dry replays a fake runner at $0 and writes nothing under eval/results.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { CASES } from './review/cases.mjs'
import { resultsAllowed, arg, readJsonl } from './lib/cli.mjs'
import { claudeRunner } from '../scripts/wikigen.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const FX = path.join(ROOT, 'tests/e2e/fixtures')
export const ARMS = ['clean', 'same']
const FINDING = /^\s*-\s*\[severity:\s*(critical|high|medium)\]/i

// The shop with its two changes merged, committed as main; the case is applied on top and diffed.
function repoFor(c) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-review-'))
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
  fs.cpSync(path.join(FX, 'shop'), dir, { recursive: true })
  fs.cpSync(path.join(FX, 'remove'), dir, { recursive: true })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'e@x'); git('config', 'user.name', 'eval')
  git('add', '-A'); git('commit', '-qm', 'base')
  for (const [file, apply] of Object.entries(c.edits ?? {})) fs.writeFileSync(path.join(dir, file), apply(fs.readFileSync(path.join(dir, file), 'utf8')))
  for (const [file, text] of Object.entries(c.newFiles ?? {})) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text) }
  git('add', '-N', '.')
  return { dir, diff: git('diff', 'main'), changed: git('diff', '--name-only', 'main').split('\n').filter(Boolean) }
}

export function buildPrompt(c, arm, { diff, dir, changed }) {
  const brief = fs.readFileSync(path.join(ROOT, 'templates/review-brief.md'), 'utf8')
    .replace(/Inputs\. Read them yourself[\s\S]*?(?=\nReview for)/, 'Everything you may use is below; you have no tools.\n')
    .replace(/You may read files[^\n]*\n/, '').replace(/<base>/g, 'main').replace(/<slug>/g, c.slug)
  const files = changed.map(f => `### ${f}\n\`\`\`\n${fs.readFileSync(path.join(dir, f), 'utf8')}\`\`\``)
  const tests = fs.readdirSync(path.join(dir, 'test')).filter(f => !changed.includes(`test/${f}`)).map(f => `### test/${f} (existing)\n\`\`\`\n${fs.readFileSync(path.join(dir, 'test', f), 'utf8')}\`\`\``)
  // The one difference between the arms besides the notes: who the reviewer is. The same-context reviewer is the builder, reviewing before shipping.
  const role = arm === 'same' ? brief.replace(/^You are a code reviewer who has never seen[^\n]*/, 'You are the engineer who built this change, reviewing it before it ships. You review it from the delta, the intent and your own build notes.') : brief
  return [role, `## intent.md\n${c.intent}`, `## spec.md\n${c.spec}`, `## plan.md\n${c.plan}`, `## The delta (git diff main)\n\`\`\`diff\n${diff}\`\`\``, '## Files the change touches, in full', ...files, '## Existing tests', ...tests,
    ...(arm === 'same' ? [`## Your build notes\nYou built this change. These are your own notes from the session:\n${c.notes}\nReview your change before it ships.`] : [])].join('\n\n')
}

export function scoreReview(text, defects) {
  // Only the ## Findings section: a tagged line under Deferred is not a finding. No such heading: the whole answer is read.
  const section = /^## Findings[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? text
  const found = section.split('\n').filter(l => FINDING.test(l))
  const caught = defects.filter(d => found.some(l => l.includes(d.file) && d.re.test(l)))
  const extra = found.filter(l => !defects.some(d => l.includes(d.file) && d.re.test(l)))
  return { findings: found.length, caught: caught.map(d => d.id), extra: extra.length }
}

export function summarize(rows) {
  const by = Object.fromEntries(ARMS.map(arm => {
    const rs = rows.filter(r => r.arm === arm && !r.failed)
    const defect = rs.filter(r => !r.control), control = rs.filter(r => r.control)
    const wanted = defect.reduce((n, r) => n + r.defects, 0)
    return [arm, {
      runs: rs.length, recall: wanted ? defect.reduce((n, r) => n + r.caught.length, 0) / wanted : null,
      extraPerDefectRun: defect.length ? defect.reduce((n, r) => n + r.extra, 0) / defect.length : null,
      falseFindingsOnClean: control.reduce((n, r) => n + r.findings, 0), cleanRuns: control.length, usd: rs.reduce((n, r) => n + (r.usd ?? 0), 0),
    }]
  }))
  return by
}

export function renderMarkdown(rows, { date, files }) {
  const s = summarize(rows), pct = v => (v === null ? '–' : `${Math.round(v * 100)}%`)
  const byCase = CASES.map(c => `| ${c.id}${c.control ? ' (clean)' : ''} | ${ARMS.map(a => { const rs = rows.filter(r => r.case === c.id && r.arm === a && !r.failed); return c.control ? `${rs.reduce((n, r) => n + r.findings, 0)} finding(s) in ${rs.length} runs` : `${rs.filter(r => r.caught.length).length}/${rs.length}` }).join(' | ')} |`)
  return [`# Eval results ${date}: clean-context review against same-context review`, '',
    `Question: does a reviewer given only the diff and the intent catch more seeded defects, and raise fewer false findings, than one that also holds the builder's notes? Source: ${files.join(', ')}. No tools; the prompt carries the change.`, '',
    '| arm | runs | defects caught | extra findings per defect run | findings on the clean change | USD |', '|---|---|---|---|---|---|',
    ...ARMS.map(a => `| ${a === 'clean' ? 'clean context' : 'same context (with builder notes)'} | ${s[a].runs} | ${pct(s[a].recall)} | ${s[a].extraPerDefectRun?.toFixed(2) ?? '–'} | ${s[a].falseFindingsOnClean} in ${s[a].cleanRuns} runs | $${s[a].usd.toFixed(2)} |`), '',
    '| case | clean: runs that caught it | same: runs that caught it |', '|---|---|---|', ...byCase, ''].join('\n')
}

if (process.argv[1] === import.meta.filename) {
  const dry = process.argv.includes('--dry')
  const runs = Number(arg('runs', 3)), maxUsd = Number(arg('max-usd', 8)), model = arg('model', 'claude-sonnet-5-5')
  const results = path.resolve(arg('results', dry ? path.join(os.tmpdir(), `rig-review-${Date.now()}.jsonl`) : path.join(ROOT, 'eval/results', `${new Date().toISOString().slice(0, 10)}-review.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  // The dry runner "reviews" like an ideal clean reviewer and misses what the builder's notes explain away: plumbing, not a measurement.
  const dryRunner = ({ prompt }) => {
    const c = CASES.find(x => prompt.includes(`## intent.md\n${x.intent}`))
    const blind = prompt.includes('## Your build notes')
    return { text: !c || c.control || blind ? 'verdict: pass\n## Findings\n' : `verdict: changes-needed\n## Findings\n- [severity: high] [category: correctness] ${c.defects[0].file}:1: ${c.id} ${c.defects[0].re.source.split('|')[0]}. Fails when: used. → fix\n`, usd: 0 }
  }
  const run = dry ? dryRunner : claudeRunner(model)
  fs.mkdirSync(path.dirname(results), { recursive: true })
  let spent = 0
  for (let n = 1; n <= runs; n++) for (const c of CASES) {
    const repo = repoFor(c)
    for (const arm of ARMS) {
      if (!dry && spent >= maxUsd) { console.log(`stopped at the cap: $${spent.toFixed(2)} of $${maxUsd}`); process.exit(0) }
      const row = { case: c.id, arm, run: n, control: Boolean(c.control), defects: c.defects.length, at: new Date().toISOString() }
      try { const r = run({ role: 'review', prompt: buildPrompt(c, arm, repo) }); spent += r.usd; Object.assign(row, scoreReview(r.text, c.defects), { usd: r.usd }) } catch (e) { Object.assign(row, { failed: true, error: String(e.message).split('\n')[0] }) }
      fs.appendFileSync(results, JSON.stringify(row) + '\n')
      console.log(`${c.id} ${arm} #${n}: ${row.failed ? `failed (${row.error})` : `caught ${row.caught.length}/${row.defects}, ${row.findings} finding(s), $${(row.usd ?? 0).toFixed(3)}`}`)
    }
    fs.rmSync(repo.dir, { recursive: true, force: true })
  }
  const rows = readJsonl(results)
  console.log(`\n${renderMarkdown(rows, { date: new Date().toISOString().slice(0, 10), files: [path.basename(results)] })}`)
  console.log(`${results}  spent $${spent.toFixed(2)}`)
}
