// The whole harness on a real Python repo, on demand: node tests/e2e/python-journey.mjs [--out DIR] [--keep] [--wiki] [--until init|chart-0|sprint-0|chart-1]
// --until stops after that stage and keeps the sandbox: the live loop test (loops-live.mjs) starts its model sessions from there.
// Outside npm test (uv, network downloads, about 5 minutes, no model cost). It replays one recorded project through every deterministic
// step a person's run takes, with the real tools and the repo's own git hooks, and no remote (the solo-developer case):
//   greenfield: init on a uv scaffold, chart sprint 0, approve, then add-item, get-item and list-items from start to pr and merge;
//   brownfield: chart sprint 1 (remove-item) on the built app, approve, then remove-item from start to pr and merge.
// The artefacts a model would write (chart, specs, plans, tests, code) are fixtures under fixtures/python-journey, taken from a live run
// (2026-11-22/23 rig_v1_test). The person's approvals are played the way scripts/testkit.ts plays them. What this does not cover is
// the skill text itself: a live model following it is `npm run e2e`. `--wiki` lets `pr` build the code wiki with the real claude (the one
// model cost, at most $1 a change) and checks every change ships it; without the flag `pr` runs with --no-wiki and the run stays free.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { Checks } from './lib/checks.mjs'
import { arg } from '../../eval/lib/cli.mjs'

const HERE = import.meta.dirname
const PLUGIN = path.resolve(HERE, '../..')
const FIX = path.join(HERE, 'fixtures/python-journey')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const dir = path.resolve(arg('out', path.join(HERE, 'out', 'python-journey', stamp)))
const c = new Checks('python journey')
const WIKI = process.argv.includes('--wiki')
const UNTIL = arg('until', '')
const stage = name => { if (UNTIL !== name) return; c.print(); console.log(`\nsandbox: ${dir} (stopped after ${name})`); process.exit(c.failed.length ? 1 : 0) }

if (spawnSync('uv', ['--version'], { encoding: 'utf8' }).status !== 0) { console.log('SKIP  python journey: uv not found'); process.exit(process.argv.includes('--require') ? 1 : 0) }
fs.mkdirSync(dir, { recursive: true })
if (fs.readdirSync(dir).length) { console.error(`${dir} is not empty: pass an empty --out`); process.exit(2) }

// The sandbox's own environment: nothing of the runner's session, test context or virtualenv leaks in.
const { VIRTUAL_ENV: _v, NODE_TEST_CONTEXT: _n, CLAUDE_PROJECT_DIR: _p, SDLC_HUMAN: _h, GITHUB_EVENT_PATH: _e, ...BASE } = process.env
const env = { ...BASE, CLAUDE_PROJECT_DIR: dir, GIT_AUTHOR_NAME: 'Journey', GIT_AUTHOR_EMAIL: 'journey@example.com', GIT_COMMITTER_NAME: 'Journey', GIT_COMMITTER_EMAIL: 'journey@example.com' }
const run = (cmd, args, o = {}) => { const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900_000, ...o, env: { ...env, ...o.env } }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
const git = (...a) => run('git', a)
const S = (args, o = {}) => run('node', ['--disable-warning=ExperimentalWarning', path.join(PLUGIN, 'scripts/sdlc.ts'), ...args], { ...(o.human ? { env: { SDLC_HUMAN: '1' } } : {}), ...(o.input === undefined ? {} : { input: o.input }) })
const tail = (t, n = 3) => t.trim().split('\n').slice(-n).join(' | ').slice(0, 400)
const overlay = from => fs.cpSync(from, dir, { recursive: true })
// One step: PASS when the command's output matches; the failure text is the last lines of what it printed.
const step = async (name, r, want) => { await c.check(name, () => want.test(r.out) || tail(r.out)); return want.test(r.out) }
const branch = () => git('branch', '--show-current').out.trim()

// A chart is approved by one decision: the page sha is put to the person, the hook records the answer, then approve.
function approveChart(n) {
  const sha = /page sha ([0-9a-f]{64})/.exec(S(['approve', `chart-${n}`, '--ask'], { human: true }).out)?.[1]
  if (!sha) return { code: 1, out: 'approve --ask printed no page sha' }
  const q = `[page sha ${sha.slice(0, 12)}] Approve chart-${n}?`
  S(['hook', 'asked'], { input: JSON.stringify({ tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: q }] }, tool_response: { answers: { [q]: `Approve chart-${n}` } } }) })
  return S(['approve', `chart-${n}`], { human: true })
}

async function chart(n, { examples }) {
  git('checkout', '-q', '-b', `rig/chart-${n}`)
  overlay(path.join(FIX, `chart-${n}`))
  await step(`chart ${n}: the PRD is in rig's format`, S(['prd', 'check', String(n)]), /in format/)
  await step(`chart ${n}: precheck finds nothing`, S(['chart', 'precheck', String(n)]), /0 finding/)
  await step(`chart ${n}: the ledger is written from the PRD`, S(['prd', 'ledger', String(n)]), /row\(s\) from prd\.md/)
  const blocks = flags => { try { return JSON.parse(S(['chart', 'check', String(n), ...flags, '--json']).out).filter(f => f.severity === 'block') } catch (e) { return [{ rule: 'unparsed', message: String(e) }] } }
  await c.check(`chart ${n}: chart check has no block`, () => { const b = blocks([]); return !b.length || b.map(f => `${f.rule}: ${f.message}`).join(' | ') })
  await c.check(`chart ${n}: chart check --cases has no block`, () => { const b = blocks(['--cases']); return !b.length || b.map(f => `${f.rule}: ${f.message}`).join(' | ') })
  // A contract example of the wrong shape is caught here, not at the approval commit.
  const ex = path.join(dir, examples), good = fs.readFileSync(ex, 'utf8')
  fs.writeFileSync(ex, '{"detail": "wrong shape"}\n')
  await c.check(`chart ${n}: chart check blocks a contract example that does not match its contract`, () => blocks([]).some(f => f.rule === 'contract-example') || 'no contract-example block')
  fs.writeFileSync(ex, good)
  await step(`chart ${n}: the build order is written`, S(['chart', 'plan', String(n)]), /wrote .*plan\.md/)
  git('add', '.rig/product', 'docs')
  await step(`chart ${n}: the chart commit passes the commit hook`, git('commit', '-m', `docs: chart sprint ${n}`), /chart sprint/)
  await step(`chart ${n}: chart done passes before the summary is written`, S(['chart', 'done', String(n)]), /is done/)
  await step(`chart ${n}: the approval page is written`, S(['chart', 'summary', String(n)]), /approval\.md/)
  await step(`chart ${n}: approving it with no remote merges rig/chart-${n} into main`, approveChart(n), new RegExp(`merged rig/chart-${n} into main`))
  await c.check(`chart ${n}: the person is left on main with a clean tree`, () => (branch() === 'main' && !git('status', '--porcelain', '--untracked-files=no').out.trim()) || `branch ${branch()}: ${tail(git('status', '--short').out)}`)
}

async function intent(slug, sprint, { expectFail, message, extra }) {
  const from = path.join(FIX, 'intents', slug), change = path.join(dir, '.rig/changes', slug), tag = `${slug}:`
  git('checkout', '-q', 'main')
  await c.check(`${tag} ready lists it`, () => new RegExp(`^\\s*${slug}\\b`, 'm').test(S(['ready']).out) || tail(S(['ready']).out))
  if (!await step(`${tag} new starts the change from its charted intent`, S(['new', slug, '--source', `.rig/product/sprints/sprint-${sprint}/intents/${slug}.md`]), /is the active change/)) return
  fs.copyFileSync(path.join(from, 'spec.md'), path.join(change, 'spec.md'))
  fs.copyFileSync(path.join(from, 'plan.md'), path.join(change, 'plan.md'))
  await step(`${tag} approve --check accepts the spec and plan`, S(['approve', slug, '--check']), /can be approved/)
  if (!await step(`${tag} the person approves it`, S(['approve', slug], { human: true }), /^approved /m)) return
  git('checkout', '-q', '-b', `sdlc/${slug}`)
  overlay(path.join(from, 'tests-tree'))
  await step(`${tag} the new tests fail before the code exists`, S(['run', '--expect-fail', '--', `uv run pytest -q ${expectFail}`]), /exit [1-9]/)
  if (!await step(`${tag} tests-freeze commits the red tests through the commit hook`, S(['tests-freeze', slug]), /froze \d+ file/)) return
  if (extra) await extra()
  overlay(path.join(from, 'code-tree'))
  await step(`${tag} the suite passes with the code`, S(['run', '--', 'uv run pytest -q']), /exit 0/)
  git('add', '-A', 'src')
  await step(`${tag} the code commit passes the commit hook`, git('commit', '-m', message), /file[s]? changed/)
  const v = S(['verify', slug])
  await step(`${tag} verify passes (sensors, mutation score, hidden cases)`, v, /verify\.json: pass/)
  await c.check(`${tag} every hidden case of the change ran and passed`, () => { const m = /holdout: (\d+)\/(\d+) passed/.exec(v.out); return (m && m[1] === m[2] && Number(m[2]) > 0) || tail(v.out) })
  await c.check(`${tag} mutation-diff ran with the real tool (a score, or no mutable changed line)`, () => { const rows = fs.readFileSync(path.join(change, 'evidence/runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.sensor === 'mutation-diff'); const last = rows.at(-1); return (last && last.exit === 0 && /mutation: (?:\d+\/\d+ killed|no mutants on changed lines)/.test(last.tail ?? '')) || `mutation-diff: ${last ? `exit ${last.exit}: ${tail(last.tail ?? '', 1)}` : 'never ran'}` })
  if (!await step(`${tag} pr ships it on its branch (local only)`, S(['pr', slug, ...(WIKI ? [] : ['--no-wiki']), '--message', message]), new RegExp(`committed on sdlc/${slug}`))) return
  if (WIKI) await c.check(`${tag} its commit carries the code wiki, and the wiki is fresh`, () => { const st = S(['wiki', 'status']).out; return (/^\.rig\/wiki\/index\.md$/m.test(git('ls-files', '.rig/wiki').out) && /wiki: fresh/.test(st)) || tail(st) })
  git('checkout', '-q', 'main')
  await step(`${tag} its branch merges into main`, git('merge', '--no-ff', '-m', `Merge sdlc/${slug}`, `sdlc/${slug}`), /Merge made|Already up to date/)
  await step(`${tag} main passes the whole suite`, run('uv', ['run', 'pytest', '-q']), /\d+ passed/)
}

// ---------- the journey ----------
// The sandbox is its own git repository before anything else runs: inside another repo's work tree (the default --out is under this
// checkout) every git command would otherwise act on that repo. Refuse to go on unless git agrees the sandbox is the top level.
run('git', ['init', '-q', '-b', 'main'])
if (fs.realpathSync(git('rev-parse', '--show-toplevel').out.trim() || '/') !== fs.realpathSync(dir)) { console.error(`${dir} is not its own git repository: not running`); process.exit(2) }
overlay(path.join(FIX, 'scaffold'))
await step('init: rig initialises the repo', S(['init']), /initialised \.rig/)
await step('init: the project environment installs', run('uv', ['sync', '-q']), /^\s*$|warning/)
const stack = S(['init', '--stack'])
await step('init: --stack detects the python pack', stack, /from the python pack/)
const sensors = JSON.parse(fs.readFileSync(path.join(dir, '.rig/sensors.json'), 'utf8')).sensors
await c.check('init: a uv project gets lint, types, unit and mutation through uv run', () => ['lint', 'types', 'unit', 'mutation'].every(id => (sensors.find(s => s.id === id)?.cmd ?? '').startsWith('uv run ')) || sensors.filter(s => s.cmd).map(s => `${s.id}: ${s.cmd.slice(0, 24)}`).join(' | '))
await step('init: sync writes the guides block', S(['sync']), /guides block|AGENTS\.md/)
await step('init: the baseline has no known-red sensor', S(['baseline']), /known red: none/)
await step('init: --plugin vendors the checker and wires the git hooks', S(['init', '--plugin']), /git hooks installed/)
git('add', '-A')
await step('init: the init commit passes the commit hook', git('commit', '-m', 'chore: rig init scaffold'), /rig init scaffold/)
stage('init')

// Greenfield: sprint 0, three intents built in dependency order.
await chart(0, { examples: 'docs/contracts/examples/add-item-400.json' })
stage('chart-0')
await intent('add-item', 0, { expectFail: 'tests/test_add_item.py tests/test_store.py', message: 'feat(add-item): POST /items with strict validation and 400 errors' })
await intent('get-item', 0, { expectFail: 'tests/test_get_item.py', message: 'feat(get-item): GET /items/{id}' })
await intent('list-items', 0, {
  expectFail: 'tests/test_list_items.py', message: 'feat(list-items): GET /items reads the store',
  // A frozen test the test writer has to correct is frozen again with a reason, through the same hook.
  extra: async () => {
    const f = path.join(dir, 'tests/test_list_items.py')
    fs.appendFileSync(f, '\n# re-frozen by the journey\n')
    await step('list-items: a re-freeze with --why passes the commit hook', S(['tests-freeze', 'list-items', '--why', 'the journey corrects a frozen test']), /froze \d+ file/)
  },
})
await c.check('greenfield: no sprint 0 intent is left to start', () => /no intents are ready/.test(S(['ready']).out) || tail(S(['ready']).out))
stage('sprint-0')

// Brownfield: sprint 1 charted on the built app, one intent.
await chart(1, { examples: 'docs/contracts/examples/remove-item-404.json' })
stage('chart-1')
await intent('remove-item', 1, { expectFail: 'tests/test_remove_item.py tests/test_store.py', message: 'feat(remove-item): DELETE /items/{id}' })
await c.check('brownfield: nothing is left to start and the tree is clean', () => (/no intents are ready/.test(S(['ready']).out) && !git('status', '--porcelain', '--untracked-files=no').out.trim()) || tail(git('status', '--short').out))

c.print()
console.log(`\nsandbox: ${dir}`)
if (c.failed.length) process.exitCode = 1
else if (!process.argv.includes('--keep')) fs.rmSync(dir, { recursive: true, force: true })
