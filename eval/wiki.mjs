// The wiki accuracy eval (wiki design 2026-10-17, "Evals"): can an agent answer cross-module flow and impact questions better with the
// built wiki than with native Read/Grep/Glob alone? Scored by exact match on the files and keywords each question expects, never by a model.
// node eval/wiki.mjs [--runs 3] [--model claude-haiku-5-5] [--max-usd 2] [--results FILE] [--dry]
// Live runs build the wiki on the fixture (Sonnet) and cost money; a person starts them. --dry replays a fake and writes nothing.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resultsAllowed, claudeJson, arg, mean } from './lib/cli.mjs'
import { wikiCommand } from '../scripts/wiki.ts'
import { claudeRunner } from '../scripts/wikigen.ts'
import { stageFixture, commitAll } from './lib/fixture.mjs'
import { bodyLines } from '../scripts/wikivalidate.ts'

const FIX = path.join(import.meta.dirname, 'fixtures/wiki')
export const QUESTIONS = JSON.parse(fs.readFileSync(path.join(FIX, 'questions.json'), 'utf8'))
const WIN_BY = 2

export const scoreAnswer = (expect, answer) => expect.every(s => answer.includes(s))

const of = (rows, arm) => rows.filter(r => r.arm === arm)

// The cut-the-feature rule: two more right of eight, or the same number right for fewer tokens; anything else is no lift.
export function verdict(rows) {
  const native = of(rows, 'native')
  const wiki = of(rows, 'wiki')
  if (!native.length || !wiki.length) return 'unmeasured'
  const gain = mean(wiki.map(r => r.correct)) - mean(native.map(r => r.correct))
  if (gain >= WIN_BY) return 'wiki beats native'
  if (Math.abs(gain) < 1e-9 && mean(wiki.map(r => r.tokens)) < mean(native.map(r => r.tokens))) return 'tie-cheaper'
  return 'no lift'
}

export function renderWikiTable(rows) {
  const arms = [...new Set(rows.map(r => r.arm))]
  return ['| arm | runs | correct of 8 (mean) | tokens (mean) | USD (mean) |', '|---|---|---|---|---|',
    ...arms.map(a => `| ${a} | ${of(rows, a).length} | ${mean(of(rows, a).map(r => r.correct)).toFixed(2)} | ${Math.round(mean(of(rows, a).map(r => r.tokens)))} | $${mean(of(rows, a).map(r => r.usd)).toFixed(4)} |`)].join('\n')
}

// A throwaway git repo holding the fixture code, with the built wiki copied in for the wiki arm.
function stage(name, base, withWiki) {
  const dir = stageFixture(`rig-eval-wiki-${name}-`, [path.join(FIX, 'repo')])
  if (withWiki) fs.cpSync(path.join(base, '.rig'), path.join(dir, '.rig'), { recursive: true })
  return dir
}

// A result the model got wrong (or ran out of turns on) scores as a wrong answer; a CLI that is missing, hung or printed no JSON
// is a broken eval, never a "no lift" verdict.
export function ask(dir, prompt, model) {
  const { bin, c, j, usd, tokens } = claudeJson({ dir, prompt, model, tools: 'Read,Grep,Glob', sources: 'user' })
  if (c.error) throw new Error(`${bin} did not finish: ${c.error.message}`)
  if (!j) throw new Error(`${bin} exited ${c.status} with no JSON result: ${(c.stderr || c.stdout || '').trim().split('\n').slice(-2).join(' ')}`)
  return { answer: typeof j.result === 'string' ? j.result : '', usd, tokens }
}

// The dry replay: native answers three questions in full, the wiki five. It exercises the pipeline, not a model.
const fakeAnswer = (arm, i) => ({ answer: i < (arm === 'wiki' ? 5 : 3) ? QUESTIONS[i].expect.join(' ') : 'unsure', usd: 0, tokens: arm === 'wiki' ? 4000 : 6000 })

function buildWiki(model) {
  const dir = stage('build', null, false)
  fs.mkdirSync(path.join(dir, '.rig'), { recursive: true })
  fs.copyFileSync(path.join(FIX, 'wiki.json'), path.join(dir, '.rig/wiki.json'))
  commitAll(dir, 'fixture')
  const run = claudeRunner(model)
  const built = wikiCommand(dir, { pos: ['build'], opt: {} }, run)
  const verified = wikiCommand(dir, { pos: ['verify'], opt: {} }, run)
  const claims = Object.values(Object.fromEntries(fs.readdirSync(path.join(dir, '.rig/wiki')).filter(f => f.endsWith('.md') && f !== 'index.md').map(f => [f, bodyLines(fs.readFileSync(path.join(dir, '.rig/wiki', f), 'utf8')).length]))).reduce((a, b) => a + b, 0)
  const bad = verified.text.split('\n').filter(l => /:\d+ (unsupported|contradicted)/.test(l)).length
  const tax = path.join(dir, 'src/billing/tax.js')
  fs.writeFileSync(tax, fs.readFileSync(tax, 'utf8').replace('cents * 1.2)', 'cents * 1.25)'))
  const refreshed = wikiCommand(dir, { pos: ['refresh'], opt: {} }, run)
  const cost = t => Number(/cost: \$([\d.]+)/.exec(t)?.[1] ?? 0)
  return { dir, buildUsd: cost(built.text), refreshUsd: cost(refreshed.text), claimSupport: claims ? 1 - bad / claims : 0, built: built.code === 0 }
}

// maxUsd caps the whole live run, the wiki build included: no new run starts once it is spent.
export async function runWikiEval({ dry = false, runs = 3, model = 'claude-haiku-5-5', maxUsd = Infinity } = {}) {
  const wiki = dry ? null : buildWiki()
  const rows = []
  let spent = wiki ? wiki.buildUsd + wiki.refreshUsd : 0
  for (let n = 1; n <= runs && spent < maxUsd; n++) {
    for (const arm of ['native', 'wiki']) {
      const dir = dry ? null : stage(`${arm}-${n}`, wiki.dir, arm === 'wiki')
      const hint = arm === 'wiki' ? ' A wiki of this codebase is in .rig/wiki (start at index.md); its pages cite the source files.' : ''
      let correct = 0
      let usd = 0
      let tokens = 0
      QUESTIONS.forEach((q, i) => {
        const r = dry ? fakeAnswer(arm, i) : ask(dir, `${q.prompt}${hint} Answer with the file paths, functions and event names involved.`, model)
        if (scoreAnswer(q.expect, r.answer)) correct++
        usd += r.usd
        tokens += r.tokens
      })
      rows.push({ arm, run: n, model, correct, usd: Number(usd.toFixed(4)), tokens, at: new Date().toISOString() })
      spent += usd
    }
  }
  return { rows, verdict: verdict(rows), spent, wiki: wiki && { buildUsd: wiki.buildUsd, refreshUsd: wiki.refreshUsd, claimSupport: wiki.claimSupport } }
}

if (process.argv[1] === import.meta.filename) {
  const dry = process.argv.includes('--dry')
  const results = path.resolve(arg('results', dry ? path.join(os.tmpdir(), 'rig-eval-wiki-dry.jsonl') : path.join(import.meta.dirname, 'results', `${new Date().toISOString().slice(0, 10)}-wiki.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  const r = await runWikiEval({ dry, runs: Number(arg('runs', 3)), model: arg('model', 'claude-haiku-5-5'), maxUsd: Number(arg('max-usd', 2)) })
  if (!dry) {
    fs.mkdirSync(path.dirname(results), { recursive: true })
    for (const row of r.rows) fs.appendFileSync(results, JSON.stringify(row) + '\n')
    if (r.wiki) fs.appendFileSync(results, JSON.stringify({ arm: 'wiki-upkeep', ...r.wiki, at: new Date().toISOString() }) + '\n')
  }
  console.log(`${renderWikiTable(r.rows)}\n\n${r.wiki ? `wiki build $${r.wiki.buildUsd}, refresh after one change $${r.wiki.refreshUsd}, claim support ${(r.wiki.claimSupport * 100).toFixed(0)}%\n` : ''}spent $${r.spent.toFixed(4)}\nverdict: ${r.verdict}${dry ? '' : `\n${results}`}`)
}
