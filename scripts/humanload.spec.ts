// Human load (readiness doc §2 Step 2): counts-only rows per person turn, agent stop and question batch, summarised by `report`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, hook, approvedChange } from './testkit.ts'

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
