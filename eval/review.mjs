// The clean-context review eval (harness readiness 2.2): over finished changes with a seeded defect, does a reviewer that sees only the diff and
// the intent catch more, and raise fewer false findings, than one that also holds the builder's own notes (the same-context review)?
// Both arms get the same review brief, the same diff, intent, spec, plan and the files the change touches, and no tools; only the builder's
// notes differ. A finding counts as catching a defect when it names the defect's file and matches its pattern: never a model's judgement.
// Hard cases and baited clean controls (verification evidence 1) make it discriminate; --models scores several reviewers on the same cases.
// node eval/review.mjs [--runs 3] [--models claude-sonnet-5-5[,claude-opus-5-5]] [--arms clean,same] [--max-usd 8] [--results FILE] [--dry]
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
  // The rest of the source, as a reviewer with tools would read it: a cross-file defect sits in a file the change does not touch.
  const others = fs.readdirSync(path.join(dir, 'src'), { recursive: true }).map(f => `src/${f}`).filter(f => f.endsWith('.js') && !changed.includes(f)).sort()
    .map(f => `### ${f}\n\`\`\`\n${fs.readFileSync(path.join(dir, f), 'utf8')}\`\`\``)
  const tests = fs.readdirSync(path.join(dir, 'test')).filter(f => !changed.includes(`test/${f}`)).map(f => `### test/${f} (existing)\n\`\`\`\n${fs.readFileSync(path.join(dir, 'test', f), 'utf8')}\`\`\``)
  // The one difference between the arms besides the notes: who the reviewer is. The same-context reviewer is the builder, reviewing before shipping.
  const role = arm === 'same' ? brief.replace(/^You are a code reviewer who has never seen[^\n]*/, 'You are the engineer who built this change, reviewing it before it ships. You review it from the delta, the intent and your own build notes.') : brief
  return [role, `## intent.md\n${c.intent}`, `## spec.md\n${c.spec}`, `## plan.md\n${c.plan}`, `## The delta (git diff main)\n\`\`\`diff\n${diff}\`\`\``, '## Files the change touches, in full', ...files, '## Other source files (unchanged)', ...others, '## Existing tests', ...tests,
    ...(arm === 'same' ? [`## Your build notes\nYou built this change. These are your own notes from the session:\n${c.notes}\nReview your change before it ships.`] : [])].join('\n\n')
}

export function scoreReview(text, defects) {
  // Only the ## Findings section: a tagged line under Deferred is not a finding. No such heading: the whole answer is read.
  const section = /^## Findings[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? text
  const found = section.split('\n').filter(l => FINDING.test(l))
  const hits = (d, l) => [d.file].flat().some(f => l.includes(f)) && d.re.test(l)
  const caught = defects.filter(d => found.some(l => hits(d, l)))
  const extra = found.filter(l => !defects.some(d => hits(d, l)))
  return { findings: found.length, caught: caught.map(d => d.id), extra: extra.length }
}

// A group is an arm, or an arm and a model once the rows hold more than one model.
export const groups = rows => {
  const multi = new Set(rows.map(r => r.model).filter(Boolean)).size > 1
  const key = r => (multi ? `${r.arm} ${r.model}` : r.arm)
  return { key, names: [...new Set(rows.map(key))].sort((a, b) => ARMS.indexOf(a.split(' ')[0]) - ARMS.indexOf(b.split(' ')[0]) || a.localeCompare(b)) }
}

export function summarize(rows) {
  const { key, names } = groups(rows)
  const recallOf = rs => { const wanted = rs.reduce((n, r) => n + r.defects, 0); return wanted ? rs.reduce((n, r) => n + r.caught.length, 0) / wanted : null }
  const by = Object.fromEntries(names.map(g => {
    const rs = rows.filter(r => key(r) === g && !r.failed)
    const defect = rs.filter(r => !r.control), control = rs.filter(r => r.control)
    return [g, {
      runs: rs.length, recall: recallOf(defect), hardRecall: recallOf(defect.filter(r => r.hard)),
      extraPerDefectRun: defect.length ? defect.reduce((n, r) => n + r.extra, 0) / defect.length : null,
      falseFindingsOnClean: control.reduce((n, r) => n + r.findings, 0), cleanRuns: control.length, usd: rs.reduce((n, r) => n + (r.usd ?? 0), 0),
    }]
  }))
  return by
}

const LABEL = { clean: 'clean context', same: 'same context (with builder notes)' }
const label = g => { const [arm, model] = g.split(' '); return model ? `${LABEL[arm]}, ${model}` : LABEL[arm] }

export function renderMarkdown(rows, { date, files }) {
  const s = summarize(rows), { key, names } = groups(rows), pct = v => (v === null ? '–' : `${Math.round(v * 100)}%`)
  const cases = CASES.filter(c => rows.some(r => r.case === c.id))
  const byCase = cases.map(c => `| ${c.id}${c.control ? ' (clean)' : c.hard ? ' (hard)' : ''} | ${names.map(g => { const rs = rows.filter(r => r.case === c.id && key(r) === g && !r.failed); return c.control ? `${rs.reduce((n, r) => n + r.findings, 0)} finding(s) in ${rs.length} runs` : `${rs.filter(r => r.caught.length).length}/${rs.length}` }).join(' | ')} |`)
  return [`# Eval results ${date}: review eval`, '',
    `Question: which reviewer catches more seeded defects, hard ones included, and raises fewer findings on correct changes? Source: ${files.join(', ')}. No tools; the prompt carries the change and the whole source tree.`, '',
    '| reviewer | runs | defects caught | hard defects caught | extra findings per defect run | findings on the clean changes | USD |', '|---|---|---|---|---|---|---|',
    ...names.map(g => `| ${label(g)} | ${s[g].runs} | ${pct(s[g].recall)} | ${pct(s[g].hardRecall)} | ${s[g].extraPerDefectRun?.toFixed(2) ?? '–'} | ${s[g].falseFindingsOnClean} in ${s[g].cleanRuns} runs | $${s[g].usd.toFixed(2)} |`), '',
    `| case | ${names.map(g => `${label(g)}: runs that caught it`).join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`, ...byCase, ''].join('\n')
}

if (process.argv[1] === import.meta.filename) {
  const dry = process.argv.includes('--dry')
  const runs = Number(arg('runs', 3)), maxUsd = Number(arg('max-usd', 8))
  const models = arg('models', arg('model', 'claude-sonnet-5-5')).split(','), arms = arg('arms', ARMS.join(',')).split(',')
  if (arms.some(a => !ARMS.includes(a))) { console.error(`--arms takes ${ARMS.join(', ')}`); process.exit(2) }
  const results = path.resolve(arg('results', dry ? path.join(os.tmpdir(), `rig-review-${Date.now()}.jsonl`) : path.join(ROOT, 'eval/results', `${new Date().toISOString().slice(0, 10)}-review.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  // The dry runner "reviews" like a clean reviewer that misses every hard case and what the builder's notes explain away: plumbing, not a measurement.
  const dryRunner = ({ prompt }) => {
    const c = CASES.find(x => prompt.includes(`## intent.md\n${x.intent}`))
    const blind = prompt.includes('## Your build notes')
    return { text: !c || c.control || c.hard || blind ? 'verdict: pass\n## Findings\n' : `verdict: changes-needed\n## Findings\n- [severity: high] [category: correctness] ${[c.defects[0].file].flat()[0]}:1: ${c.id} ${c.defects[0].re.source.split('|')[0]}. Fails when: used. → fix\n`, usd: 0 }
  }
  const runners = Object.fromEntries(models.map(m => [m, dry ? dryRunner : claudeRunner(m)]))
  fs.mkdirSync(path.dirname(results), { recursive: true })
  let spent = 0
  for (let n = 1; n <= runs; n++) for (const c of CASES) {
    const repo = repoFor(c)
    for (const model of models) for (const arm of arms) {
      if (!dry && spent >= maxUsd) { console.log(`stopped at the cap: $${spent.toFixed(2)} of $${maxUsd}`); process.exit(0) }
      const row = { case: c.id, arm, model, run: n, control: Boolean(c.control), hard: Boolean(c.hard), defects: c.defects.length, at: new Date().toISOString() }
      try { const r = runners[model]({ role: 'review', prompt: buildPrompt(c, arm, repo) }); spent += r.usd; Object.assign(row, scoreReview(r.text, c.defects), { usd: r.usd, text: r.text }) } catch (e) { Object.assign(row, { failed: true, error: String(e.message).split('\n')[0] }) }
      fs.appendFileSync(results, JSON.stringify(row) + '\n')
      console.log(`${c.id} ${arm} ${model} #${n}: ${row.failed ? `failed (${row.error})` : `caught ${row.caught.length}/${row.defects}, ${row.findings} finding(s), $${(row.usd ?? 0).toFixed(3)}`}`)
    }
    fs.rmSync(repo.dir, { recursive: true, force: true })
  }
  const rows = readJsonl(results)
  console.log(`\n${renderMarkdown(rows, { date: new Date().toISOString().slice(0, 10), files: [path.basename(results)] })}`)
  console.log(`${results}  spent $${spent.toFixed(2)}`)
}
