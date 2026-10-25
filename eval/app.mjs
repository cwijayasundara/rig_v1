// The journeys eval (harness readiness 2.1): given a small app and a person's three journeys, does a live /rig-app session write a driver that
// (1) is valid and runs green on the working app, (2) is approved by a person's `app approve`, and (3) fails when the app is broken?
// Two seeded breaks: the server stops reading request bodies (every unit test stays green: the failure only the running app shows) and the
// checkout total is off by one cent (an end-state assertion). Scored by running the driver, never by a model.
// node eval/app.mjs [--runs 3] [--model claude-sonnet-5-5] [--cap-run 3] [--cap-total 8] [--results FILE] [--dry]
// A live run costs money and a person starts it. --dry plays the known-good driver at $0 and writes nothing under eval/results.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createSandbox, installedPlugins } from '../tests/e2e/lib/sandbox.mjs'
import { createSessions } from '../tests/e2e/driver/live.mjs'
import { totals } from '../tests/e2e/assert/process.mjs'
import { resultsAllowed, EVAL_ALLOW, arg, readJsonl } from './lib/cli.mjs'

const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures/journeys')
export const PROMPT = '/rig-app journeys-shop. The person confirms these three journeys, so do not ask: (1) a shopper sees the two products at GET /products; (2) a shopper adds 2 of TEA-001 with POST /cart; (3) POST /checkout then totals 900 cents. The app starts with `npm start` and prints `listening on <port>`. Write the app definition, the driver and the feature map, run the driver with `app run`, then stop for the person to approve it. In this unattended session run each command as its own Bash call (no cd, pipes, redirects, && or ;).'
export const BREAKS = {
  'body-ignored': { file: 'src/server.js', from: 'body: raw ? JSON.parse(raw) : {}', to: 'body: {}', unitStaysGreen: true },
  'total-off-by-one': { file: 'src/shop.js', from: 'n + qty * PRODUCTS.find(x => x.sku === sku).priceCents', to: 'n + qty * PRODUCTS.find(x => x.sku === sku).priceCents + 1', unitStaysGreen: false },
}

function setup(out, name) {
  const sb = createSandbox({ name, out })
  for (const f of ['package.json', 'src', 'test']) fs.cpSync(path.join(FX, f), path.join(sb.dir, f), { recursive: true })
  sb.isolate(installedPlugins())
  sb.write('CLAUDE.md', '# journeys-shop\n\nA tiny shop over HTTP.\n')
  sb.commitAll('chore: scaffold')
  for (const args of [['init'], ['init', '--full']]) if (sb.sdlc(args).status !== 0) throw new Error(`sdlc ${args.join(' ')} failed`)
  sb.commitAll('chore: onboard rig')
  return sb
}

// The sandbox env already has no NODE_TEST_CONTEXT; setting it to '' would still put a nested runner in child mode, where a failing run can exit 0.
const npmTest = sb => sb.run('npm', ['test', '--silent']).status === 0
const appName = sb => { try { return JSON.parse(sb.sdlc(['app', 'status', '--json']).stdout)[0]?.name ?? null } catch { return null } }

// What the session left behind, judged by running it: the good app, then each seeded break, each restored afterwards.
export function scoreApp(sb) {
  const name = appName(sb)
  const row = { wrote: Boolean(name), runsGreen: false, approved: false, caught: {}, unitGreenOnBreak: {} }
  if (!name) return row
  row.runsGreen = sb.sdlc(['app', 'run', name]).status === 0
  row.approved = row.runsGreen && sb.sdlc(['app', 'approve', name], { human: true }).status === 0
  for (const [id, b] of Object.entries(BREAKS)) {
    const original = sb.read(b.file)
    sb.write(b.file, original.replace(b.from, b.to))
    row.unitGreenOnBreak[id] = npmTest(sb)
    row.caught[id] = sb.sdlc(['app', 'run', name]).status !== 0
    sb.write(b.file, original)
  }
  return row
}

export function summarize(rows) {
  const ok = rows.filter(r => !r.failed)
  const n = ok.length, k = f => ok.filter(f).length
  return { runs: n, wrote: k(r => r.wrote), runsGreen: k(r => r.runsGreen), approved: k(r => r.approved), caughtBodyIgnored: k(r => r.caught?.['body-ignored']), caughtTotal: k(r => r.caught?.['total-off-by-one']), usd: ok.reduce((a, r) => a + (r.usd ?? 0), 0) }
}

export function renderMarkdown(rows, { date, files }) {
  const s = summarize(rows), x = v => `${v}/${s.runs}`
  return [`# Eval results ${date}: /rig-app on a fixture app`, '',
    `Question: given three confirmed journeys, does a live session write a driver that runs green, gets approved, and fails when the app breaks? Source: ${files.join(', ')}. Scored by running the driver on the good app and on two seeded breaks (one keeps every unit test green).`, '',
    '| runs | wrote a valid app | runs green | approved | fails on break 1 (unit-green) | fails on break 2 (total off by 1c) | USD |', '|---|---|---|---|---|---|---|',
    `| ${s.runs} | ${x(s.wrote)} | ${x(s.runsGreen)} | ${x(s.approved)} | ${x(s.caughtBodyIgnored)} | ${x(s.caughtTotal)} | $${s.usd.toFixed(2)} |`, ''].join('\n')
}

if (process.argv[1] === import.meta.filename) {
  const dry = process.argv.includes('--dry')
  const runs = Number(arg('runs', 3)), capRun = Number(arg('cap-run', 3)), capTotal = Number(arg('cap-total', 8)), model = arg('model', 'claude-sonnet-5-5')
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-app-eval-'))
  const results = path.resolve(arg('results', dry ? path.join(out, 'results.jsonl') : path.join(import.meta.dirname, 'results', `${new Date().toISOString().slice(0, 10)}-app.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  fs.mkdirSync(path.dirname(results), { recursive: true })
  let spent = 0
  for (let n = 1; n <= runs; n++) {
    if (!dry && spent + capRun > capTotal) { console.log(`stopped at the cap: $${spent.toFixed(2)} of $${capTotal}`); break }
    const row = { run: n, model, at: new Date().toISOString() }
    try {
      const sb = setup(out, `app-${n}`)
      let usd = 0
      if (dry) {
        sb.sdlc(['app', 'init']); fs.cpSync(path.join(FX, 'journey'), path.join(sb.dir, '.rig/verify/shop'), { recursive: true })
      } else {
        const sessions = createSessions({ sb, out: sb.root, capUsd: capRun, model, allow: EVAL_ALLOW, env: { CLAUDE_CODE_SUBAGENT_MODEL: model } })
        try { sessions.run('app', PROMPT) } catch (e) { row.sessionError = String(e.message).split('\n')[0] }
        usd = totals(sessions.sessions).costUsd
        row.denials = totals(sessions.sessions).denials.length
      }
      spent += usd
      Object.assign(row, scoreApp(sb), { usd: Number(usd.toFixed(4)) })
    } catch (e) { Object.assign(row, { failed: true, error: String(e.message).split('\n')[0] }) }
    fs.appendFileSync(results, JSON.stringify(row) + '\n')
    console.log(`#${n}: ${row.failed ? `failed (${row.error})` : `wrote ${row.wrote}, green ${row.runsGreen}, approved ${row.approved}, caught ${JSON.stringify(row.caught)}, $${row.usd}${row.sessionError ? ` (${row.sessionError})` : ''}`}`)
  }
  const rows = readJsonl(results)
  console.log(`\n${renderMarkdown(rows, { date: new Date().toISOString().slice(0, 10), files: [path.basename(results)] })}\n${results}  spent $${spent.toFixed(2)}`)
}
