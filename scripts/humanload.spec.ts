// Human load (readiness doc §2 Step 2): counts-only rows per person turn, agent stop and question batch, summarised by `report`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, hook, approvedChange, write, gitIn } from './testkit.ts'
import { summarise, type HumanRow } from './humanload.ts'
import { buildReport, reportText } from './report.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const rowsOf = (repo: string, slug = 'loans'): Record<string, unknown>[] => {
  const f = path.join(repo, '.rig/changes', slug, 'evidence/human.jsonl')
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>) : []
}
const withChange = (): string => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'loans', '--type', 'feature'])
  return repo
}

test('a prompt, a question batch and a stop each append one row to the active change', () => {
  const repo = withChange()
  hook(repo, 'prompt-submit', { session_id: 's1', prompt: 'my secret request' })
  hook(repo, 'asked', { session_id: 's1', tool_input: { questions: [{}, {}] } })
  hook(repo, 'stop', { session_id: 's1' })
  const rows = rowsOf(repo)
  assert.deepEqual(rows.map(r => r.kind), ['prompt', 'question', 'stop'])
  assert.equal(rows[1]?.n, 2)
  assert.ok(rows.every(r => r.session === 's1' && typeof r.at === 'string'))
  assert.ok(!JSON.stringify(rows).includes('secret request'), 'no prompt text is recorded')
})

test('no active change records nothing', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  hook(repo, 'prompt-submit', { session_id: 's1', prompt: 'hi' })
  const changes = path.join(repo, '.rig/changes')
  const found = fs.existsSync(changes) ? (fs.readdirSync(changes, { recursive: true }) as string[]).filter(f => f.endsWith('human.jsonl')) : []
  assert.deepEqual(found, [])
})

test('a question payload without questions counts one', () => {
  const repo = withChange()
  hook(repo, 'asked', { session_id: 's1' })
  assert.equal(rowsOf(repo)[0]?.n, 1)
})

test('appending the row raises no Stop finding', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  approvedChange(repo, 'loans')
  hook(repo, 'prompt-submit', { session_id: 's1', prompt: 'go' })
  const stop = hook(repo, 'stop', { session_id: 's1' })
  assert.doesNotMatch(stop.stdout + stop.stderr, /human\.jsonl/)
  assert.ok(rowsOf(repo).length >= 2)
})

test('the hook is registered', () => {
  const hooks = (JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks/hooks.json'), 'utf8')) as { hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> }).hooks
  const asked = hooks.PostToolUse?.find(g => g.matcher === 'AskUserQuestion')
  assert.ok(asked?.hooks[0]?.command.endsWith('hook asked'))
})

const row = (kind: HumanRow['kind'], hhmm: string, session: string, n?: number): HumanRow => ({ at: `2026-11-12T${hhmm}:00Z`, session, kind, ...(n ? { n } : {}) })

test('summarise: gaps pair within a session, are capped, and ignore an unpaired prompt or stop', () => {
  const rows = [
    row('stop', '10:00', 's1'), row('prompt', '10:01', 's2'), row('stop', '10:02', 's2'), row('prompt', '10:03', 's1'),
    row('prompt', '10:04', 's2'), row('stop', '10:05', 's1'), row('question', '10:06', 's1', 2), row('prompt', '10:45', 's1'),
  ]
  assert.deepEqual(summarise(rows), { prompts: 4, questions: 2, attentionMin: 15 })
})

test('summarise skips malformed rows', () => {
  const bad = [{ kind: 'prompt' }, { at: '2026-11-12T10:00:00Z', session: 's', kind: 'nap' }] as unknown as HumanRow[]
  assert.deepEqual(summarise([...bad, row('stop', '10:00', 's'), row('prompt', '10:02', 's')]), { prompts: 1, questions: 0, attentionMin: 2 })
})

// A shipped change the way report.spec.ts builds one: spec, approval, pr.md on a branch, merged with a merge commit.
function ship(repo: string, slug: string, day: string, human: HumanRow[] | null): void {
  const stamp = (iso: string): void => { process.env.GIT_AUTHOR_DATE = iso; process.env.GIT_COMMITTER_DATE = iso }
  const commit = (msg: string): void => { gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', msg) }
  gitIn(repo, 'checkout', '-qb', slug)
  stamp(`${day}T08:00:00Z`)
  write(repo, `.rig/changes/${slug}/spec.md`, '# Spec\n')
  write(repo, `.rig/changes/${slug}/approval.json`, JSON.stringify({ by: 'p', at: `${day}T09:00:00Z` }))
  write(repo, `.rig/changes/${slug}/pr.md`, '# PR\n')
  write(repo, `src/${slug}.js`, 'export const x = 1\n')
  if (human) write(repo, `.rig/changes/${slug}/evidence/human.jsonl`, human.map(r => JSON.stringify(r)).join('\n') + '\n')
  commit(`ship ${slug}`)
  gitIn(repo, 'checkout', '-q', 'main')
  stamp(`${day}T18:00:00Z`)
  gitIn(repo, 'merge', '--no-ff', '-qm', `merge ${slug}`, slug)
}

test('report: human load over shipped changes, with the ceiling', () => {
  const repo = makeRepo()
  ship(repo, 'alpha', '2026-10-01', [row('prompt', '10:00', 's'), ...Array.from({ length: 5 }, () => row('question', '10:01', 's', 1)), row('stop', '10:02', 's'), row('prompt', '10:05', 's')])
  ship(repo, 'beta', '2026-10-02', null)
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'alpha', sensor: 'size', file: 'src/alpha.js', reason: 'r', by: 'p', at: '2026-10-02T00:00:00Z' }) + '\n')
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'waive')
  const r = buildReport(repo)
  assert.equal(r.humanLoad?.measured, 1)
  assert.equal(r.humanLoad?.of, 2)
  assert.equal(r.humanLoad?.overCeiling, 1)
  assert.equal(r.humanLoad?.approvals.median, 2)
  assert.equal(r.humanLoad?.attentionMin.median, 3)
  assert.match(reportText(r), /over the 3-question ceiling: 1/)
  const loose = JSON.parse(sdlc(repo, ['report', '--max-questions', '5', '--json']).stdout) as { humanLoad: { overCeiling: number } }
  assert.equal(loose.humanLoad.overCeiling, 0)
})

test('report without any human.jsonl lists it as unavailable', () => {
  const repo = makeRepo()
  ship(repo, 'beta', '2026-10-02', null)
  const r = buildReport(repo)
  assert.equal(r.humanLoad, null)
  assert.ok(r.unavailable.some(u => u.startsWith('human load')))
})

test('a recording failure never skips the Stop gate or the prompt-submit reset', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  approvedChange(repo, 'loans')
  fs.mkdirSync(path.join(repo, '.rig/changes/loans/evidence/human.jsonl'), { recursive: true }) // an agent's rm + mkdir from Bash
  const p = hook(repo, 'prompt-submit', { session_id: 's1', prompt: 'go' })
  assert.equal(p.code, 0)
  write(repo, 'src/leak.js', 'export const key = "AKIAABCDEFGHIJKLMNOP"\n')
  const stop = hook(repo, 'stop', { session_id: 's1' })
  assert.match(stop.stdout + stop.stderr, /secret/i, 'the gate still ran and saw the secret')
  assert.doesNotMatch(stop.stderr, /\n\s+at /)
})

test('the time spent answering a question batch counts as attention', () => {
  const rows = [row('stop', '10:00', 's'), row('prompt', '10:01', 's'), row('asking', '10:02', 's'), row('question', '10:06', 's', 2)]
  assert.deepEqual(summarise(rows), { prompts: 1, questions: 2, attentionMin: 5 })
  const repo = withChange()
  hook(repo, 'asking', { session_id: 's1', tool_input: { questions: [{}] } })
  assert.deepEqual(rowsOf(repo).map(r => r.kind), ['asking'])
  const hooks = (JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks/hooks.json'), 'utf8')) as { hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> }).hooks
  assert.ok(hooks.PreToolUse?.find(g => g.matcher === 'AskUserQuestion')?.hooks[0]?.command.endsWith('hook asking'))
})

test('the rows merge by union, and a tracked human.jsonl does not make pre-push drift', () => {
  const repo = withChange()
  hook(repo, 'prompt-submit', { session_id: 's1', prompt: 'go' })
  assert.match(fs.readFileSync(path.join(repo, '.rig/.gitattributes'), 'utf8'), /^changes\/\*\/evidence\/human\.jsonl merge=union$/m)
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'wip')
  hook(repo, 'stop', { session_id: 's1' })
  const push = sdlc(repo, ['check', '--at', 'push'])
  assert.doesNotMatch(push.stdout, /run against your working tree/)
})

test('a file with only question rows (an older vendored copy records no turns) is not measured', () => {
  const repo = makeRepo()
  ship(repo, 'alpha', '2026-10-01', [row('question', '10:01', 's', 2)])
  assert.equal(buildReport(repo).humanLoad, null)
})
