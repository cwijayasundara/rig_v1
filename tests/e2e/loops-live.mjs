// Both loops with the real model, on a real Python repo, greenfield and brownfield: node tests/e2e/loops-live.mjs
//   [--fields greenfield,brownfield] [--loops outer,inner] [--model claude-sonnet-5-5] [--cap-outer 8] [--cap-inner 12] [--minutes-outer 30]
//   [--max-launches 6] [--max-findings 8] [--out DIR]
// LIVE: it costs money (at most cap-outer + cap-inner dollars per field) and takes up to about an hour per field. Needs uv, network and claude.
// It drives rig the way a person does, from the two PRDs of the 2026-11-23 rig_v1_test run (fixtures/python-journey/scaffold/docs/prd):
//   greenfield: an initialised uv scaffold; the sprint 0 PRD is charted (outer), approved by a stand-in, and one intent is built (inner);
//   brownfield: the recorded app with sprint 0 built; the sprint 1 PRD is charted on it (outer), approved, and one intent is built (inner).
// The outer loop runs as a Claude Code /goal, with the line `sdlc.ts chart goal <N> --print` gives; the inner loop runs /rig:start to a PR
// through the same driver as `npm run e2e`. With --loops inner alone, the recorded chart stands in for the live one.
// What it asserts is what a person's run tripped on: the goal is met, nothing was asked, only /rig:<name> is named, the launch count and
// the review's finding count stay under a budget, a chart changes no source, and the built change verifies and passes its suite.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { Checks } from './lib/checks.mjs'
import { bindSandbox, PLUGIN } from './lib/sandbox.mjs'
import { createSessions, liveDriver } from './driver/live.mjs'
import { runChange } from './lib/flow.mjs'
import { readSession, totals } from './assert/process.mjs'
import { transcriptFacts, findingCount } from './lib/livecheck.mjs'
import { arg } from '../../eval/lib/cli.mjs'
import { cleanClaudeEnv } from '../../scripts/model.ts'

const HERE = import.meta.dirname
const list = (name, d) => arg(name, d).split(',').map(s => s.trim()).filter(Boolean)
const num = (name, d) => { const v = Number(arg(name, String(d))); if (!(v > 0)) { console.error(`--${name} must be a positive number`); process.exit(2) } return v }
const FIELDS = { greenfield: { sprint: 0, live: 'init', recorded: 'chart-0' }, brownfield: { sprint: 1, live: 'sprint-0', recorded: 'chart-1' } }
const fields = list('fields', 'greenfield,brownfield'), loops = list('loops', 'outer,inner')
if (fields.some(f => !FIELDS[f]) || loops.some(l => l !== 'outer' && l !== 'inner')) { console.error('usage: --fields greenfield,brownfield --loops outer,inner'); process.exit(2) }
const MODEL = arg('model', 'claude-sonnet-5-5'), CAP_OUTER = num('cap-outer', 8), CAP_INNER = num('cap-inner', 12), MINUTES = num('minutes-outer', 30)
const MAX_LAUNCHES = num('max-launches', 6), MAX_FINDINGS = num('max-findings', 8)
const OUT = path.resolve(arg('out', path.join(HERE, 'out', 'loops-live', new Date().toISOString().replace(/[:.]/g, '-'))))
const SKILLS = fs.readdirSync(path.join(PLUGIN, 'skills'))
const tail = (t, n = 3) => String(t ?? '').trim().split('\n').slice(-n).join(' | ').slice(0, 400)

for (const tool of ['uv', 'claude']) if (spawnSync(tool, ['--version'], { encoding: 'utf8' }).status !== 0) { console.error(`loops-live needs ${tool}`); process.exit(2) }
const { NODE_TEST_CONTEXT: _n, CLAUDE_PROJECT_DIR: _p, SDLC_HUMAN: _h, VIRTUAL_ENV: _v, CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: _c, ...RUNNER } = process.env
const env = { ...cleanClaudeEnv(RUNNER), GIT_AUTHOR_NAME: 'Live Person', GIT_AUTHOR_EMAIL: 'live@example.com', GIT_COMMITTER_NAME: 'Live Person', GIT_COMMITTER_EMAIL: 'live@example.com' }
// claude -p never trusts the workspace, so the template's allow rules and env go in on --settings (see driver/live.mjs), with the git
// commands the chart skill's own allowed-tools name: a goal's later turns run outside the skill's grant.
const GIT_ALLOW = ['checkout', 'add', 'commit', 'status', 'diff', 'rev-parse', 'branch', 'log'].map(c => `Bash(git ${c}*)`)
const settings = (() => { const t = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'templates/settings.json'), 'utf8')); return JSON.stringify({ permissions: { allow: [...t.permissions.allow, ...GIT_ALLOW] }, env: t.env }) })()

// The repo a person would have before typing anything: the recorded journey up to `until`, then the full copy of rig that /rig:init makes.
async function prepare(field, until, c) {
  const root = path.join(OUT, field), dir = path.join(root, 'repo'), logs = path.join(root, 'logs')
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(logs, { recursive: true })
  const j = spawnSync('node', [path.join(HERE, 'python-journey.mjs'), '--out', dir, '--keep', '--until', until], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, timeout: 30 * 60_000 })
  fs.writeFileSync(path.join(logs, 'prepare.txt'), `${j.stdout ?? ''}${j.stderr ?? ''}`)
  if (j.status !== 0) throw new Error(`the recorded journey failed before ${until}: ${tail(j.stdout, 4)}`)
  const sb = bindSandbox({ name: field, root, dir, origin: null, bin: null, logs, env })
  sb.git('config', 'user.name', 'Live Person'); sb.git('config', 'user.email', 'live@example.com')
  const full = sb.run('node', ['--disable-warning=ExperimentalWarning', path.join(PLUGIN, 'scripts/sdlc.ts'), 'init', '--full'], { env: { CLAUDE_PROJECT_DIR: dir } })
  if (full.status !== 0) throw new Error(`init --full failed: ${tail(full.stderr || full.stdout)}`)
  sb.git('add', '-A')
  const commit = sb.run('git', ['commit', '-m', 'chore: rig full copy'])
  await c.check(`${field}: the full copy of rig commits through the repo's own commit hook`, () => commit.status === 0 || tail(commit.stdout + commit.stderr))
  await c.check(`${field}: the repo's own commands are /rig:<name> files`, () => (sb.exists('.claude/commands/rig/chart.md') && !sb.exists('.claude/skills/rig-chart')) || 'no .claude/commands/rig/chart.md')
  return sb
}

// The outer loop as a person runs it unattended: the /goal line rig prints, in one headless session.
async function outer(field, sb, c) {
  const n = FIELDS[field].sprint, tag = `${field} outer:`, sprint = `.rig/product/sprints/sprint-${n}`
  const line = sb.sdlc(['chart', 'goal', String(n), '--print', '--prd', `docs/prd/sprint-${n}/prd.md`]).stdout.trim()
  await c.check(`${tag} rig prints the /goal line with the repo's own checker`, () => (line.startsWith('/goal ') && line.includes('.rig/bin/sdlc.ts chart goal')) || line.slice(0, 200))
  const file = path.join(sb.logs, 'sessions', `outer-chart-${n}.jsonl`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const started = Date.now()
  const r = sb.run('claude', ['-p', line, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--model', MODEL, '--settings', settings,
    '--max-budget-usd', CAP_OUTER.toFixed(2), '--setting-sources', 'project,local'], { timeout: MINUTES * 60_000 })
  fs.writeFileSync(file, r.stdout ?? '')
  const s = readSession(file), f = transcriptFacts(r.stdout ?? '', SKILLS), minutes = (Date.now() - started) / 60_000
  console.log(`  ${tag} $${s.costUsd.toFixed(2)}, ${s.turns} turns, ${minutes.toFixed(1)} min, ${f.launches} launch(es), ${s.denials.length} denial(s)`)
  const goal = sb.sdlc(['chart', 'goal', String(n)])
  fs.writeFileSync(path.join(sb.logs, `chart-goal-${n}.txt`), goal.stdout + goal.stderr)
  await c.check(`${tag} the session ran to its end without an error`, () => (s.ended && !s.isError) || `ended ${s.ended}, error ${s.isError}: ${tail(s.resultText || r.stderr, 2)}`)
  await c.check(`${tag} chart goal ${n} is MET (every output exists, is checked, reviewed and committed)`, () => goal.status === 0 || goal.stdout.split('\n').filter(l => /✗|NOT MET/.test(l)).join(' | ').slice(0, 600))
  await c.check(`${tag} the session showed the MET line itself, as the goal asks`, () => f.goal.includes(`chart-${n} goal: MET`) || `goal lines shown: ${f.goal.join(', ') || 'none'}`)
  await c.check(`${tag} the chart skill was invoked`, () => f.skills.some(k => /^rig[:-]chart$/.test(k)) || `skills invoked: ${f.skills.join(', ') || 'none'}`)
  await c.check(`${tag} the person was asked nothing`, () => f.questions === 0 || `${f.questions} question(s)`)
  await c.check(`${tag} only /rig:<name> is named, in the session and in what it wrote`, () => {
    const hits = sb.run('git', ['grep', '-n', '-E', `/rig-(${SKILLS.join('|')})\\b`, '--', '.rig/product', 'docs', 'CLAUDE.md', 'README.md']).stdout.trim()
    return (!f.hyphen.length && !hits) || [...new Set(f.hyphen)].join(', ') + ' ' + hits.split('\n').slice(0, 3).join(' | ')
  })
  await c.check(`${tag} at most ${MAX_LAUNCHES} subagent launches`, () => f.launches <= MAX_LAUNCHES || `${f.launches} launches`)
  await c.check(`${tag} the review raised at most ${MAX_FINDINGS} findings`, () => { const k = findingCount(sb.read(`${sprint}/chart-review.md`)); return k <= MAX_FINDINGS || `${k} findings` })
  await c.check(`${tag} at most 3 denied tool calls`, () => s.denials.length <= 3 || s.denials.slice(0, 4).map(d => JSON.stringify(d).slice(0, 120)).join(' | '))
  await c.check(`${tag} it stops for the person: on rig/chart-${n}, nothing approved`, () => (sb.git('branch', '--show-current') === `rig/chart-${n}` && !sb.exists(`${sprint}/approval.json`)) || `branch ${sb.git('branch', '--show-current')}, approval.json ${sb.exists(`${sprint}/approval.json`)}`)
  await c.check(`${tag} the chart changed no source or test file`, () => { const d = sb.run('git', ['diff', '--name-only', `main...rig/chart-${n}`, '--', 'src', 'tests']).stdout.trim(); return !d || d.split('\n').join(', ') })
  if (n > 0) await c.check(`${tag} the earlier sprint's chart is untouched`, () => { const d = sb.run('git', ['diff', '--name-only', `main...rig/chart-${n}`, '--', `.rig/product/sprints/sprint-${n - 1}`]).stdout.trim(); return !d || d.split('\n').join(', ') })
  return { met: goal.status === 0, costUsd: s.costUsd, minutes, launches: f.launches, turns: s.turns }
}

// The person's one decision on a chart, played the way python-journey.mjs plays it.
async function approve(field, sb, c) {
  const n = FIELDS[field].sprint
  const sha = /page sha ([0-9a-f]{64})/.exec(sb.sdlc(['approve', `chart-${n}`, '--ask'], { human: true }).stdout)?.[1]
  const q = `[page sha ${String(sha).slice(0, 12)}] Approve chart-${n}?`
  if (sha) sb.sdlc(['hook', 'asked'], { input: JSON.stringify({ tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: q }] }, tool_response: { answers: { [q]: `Approve chart-${n}` } } }) })
  const a = sha ? sb.sdlc(['approve', `chart-${n}`], { human: true }) : { status: 1, stdout: 'approve --ask printed no page sha', stderr: '' }
  await c.check(`${field}: the person approves the live chart and it merges into main`, () => (a.status === 0 && sb.git('branch', '--show-current') === 'main') || tail(a.stdout + a.stderr))
  return a.status === 0
}

// The inner loop: one ready intent of the approved chart, from /rig:start to a PR, the person's approvals played by the driver's stand-in.
async function inner(field, sb, c) {
  const n = FIELDS[field].sprint, tag = `${field} inner:`, dir = `.rig/product/sprints/sprint-${n}/intents`
  const slug = fs.readdirSync(sb.file(dir)).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).sort().find(s => /^depends:\s*\[\s*\]\s*$/m.test(sb.read(`${dir}/${s}.md`)))
  if (!slug) { await c.check(`${tag} the chart has an intent that depends on nothing`, () => 'none found'); return null }
  const phase = { id: `${field}-inner`, prompt: `/rig:start ${dir}/${slug}.md` }
  const sessions = createSessions({ sb, out: sb.logs, capUsd: CAP_INNER, model: MODEL, allow: GIT_ALLOW })
  let change = null, failure = ''
  try { change = (await runChange(sb, phase, liveDriver(sb, phase, { sessions }))).slug } catch (err) { failure = String(err?.message ?? err).split('\n')[0] }
  const t = totals(sessions.sessions)
  console.log(`  ${tag} ${slug}: $${t.costUsd.toFixed(2)}, ${t.turns} turns, ${sessions.sessions.length} session(s)`)
  await c.check(`${tag} ${slug} goes from /rig:start to a PR`, () => (!failure && Boolean(change)) || failure || 'no change')
  if (!change) return { slug, costUsd: t.costUsd }
  const status = (JSON.parse(sb.sdlc(['status', '--json']).stdout || '{}').changes ?? []).find(x => x.slug === change)?.status
  await c.check(`${tag} the change is in review`, () => status === 'review' || `status ${status}`)
  const v = sb.sdlc(['verify', change])
  await c.check(`${tag} verify passes (sensors, mutation score, hidden cases)`, () => /verify\.json: pass/.test(v.stdout + v.stderr) || tail(v.stdout + v.stderr))
  const suite = sb.run('uv', ['run', 'pytest', '-q'])
  await c.check(`${tag} the whole suite passes`, () => (suite.status === 0 && /\d+ passed/.test(suite.stdout)) || tail(suite.stdout + suite.stderr))
  const said = sessions.sessions.flatMap(s => transcriptFacts(fs.existsSync(s.file) ? fs.readFileSync(s.file, 'utf8') : '', SKILLS).hyphen)
  await c.check(`${tag} only /rig:<name> is named`, () => !said.length || [...new Set(said)].join(', '))
  await c.check(`${tag} the spend stayed under $${CAP_INNER}`, () => t.costUsd <= CAP_INNER || `$${t.costUsd.toFixed(2)}`)
  return { slug, change, costUsd: t.costUsd, turns: t.turns }
}

fs.mkdirSync(OUT, { recursive: true })
const c = new Checks('live loops'), summary = { model: MODEL, out: OUT, fields: {} }
for (const field of fields) {
  const wantOuter = loops.includes('outer'), wantInner = loops.includes('inner'), res = {}
  console.log(`\n== ${field} (sprint ${FIELDS[field].sprint}) ==`)
  let sb
  try { sb = await prepare(field, wantOuter ? FIELDS[field].live : FIELDS[field].recorded, c) } catch (err) { await c.check(`${field}: the repo is prepared`, () => String(err?.message ?? err)); continue }
  if (wantOuter) { try { res.outer = await outer(field, sb, c) } catch (err) { await c.check(`${field} outer: ran`, () => String(err?.message ?? err).split('\n')[0]) } }
  if (wantInner) {
    const ready = wantOuter ? Boolean(res.outer?.met) && await approve(field, sb, c) : true
    if (!ready) c.skip(`${field} inner: one intent from /rig:start to a PR`, 'needs the live chart to be met and approved')
    else { try { res.inner = await inner(field, sb, c) } catch (err) { await c.check(`${field} inner: ran`, () => String(err?.message ?? err).split('\n')[0]) } }
  }
  summary.fields[field] = { ...res, repo: sb.dir, logs: sb.logs }
}
console.log('')
c.print()
summary.failed = c.failed.map(r => r.name); summary.checks = c.results.length
summary.costUsd = Number(Object.values(summary.fields).reduce((n, f) => n + (f.outer?.costUsd ?? 0) + (f.inner?.costUsd ?? 0), 0).toFixed(2))
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(`\nspent $${summary.costUsd}; repos, session logs and summary.json are under ${OUT}`)
if (c.failed.length) process.exitCode = 1
