// The person's own corrections, read from this repo's Claude Code transcripts (proposal 2026-10-23 §3). Local only; zero tokens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { typedTurns, redact, repeated, projectDir, mineTranscripts } from './learntranscripts.ts'

const SID = '8294c2f0-aaaa-bbbb-cccc-000000000000'
const turn = (content: unknown, o: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'user', sessionId: SID, timestamp: '2026-10-23T08:13:58.941Z', origin: { kind: 'human' }, message: { role: 'user', content }, ...o })
const texts = (jsonl: string): string[] => typedTurns(jsonl).map(c => c.text)

test('only the person\'s typed turns are kept: no tool results, meta, sidechains, hook output or task notifications', () => {
  const jsonl = [
    turn('no, do not mock the DB'),
    turn([{ type: 'tool_result', tool_use_id: 't', content: 'ok' }], { toolUseResult: {} }),
    turn('<local-command-caveat>x</local-command-caveat>', { isMeta: true, origin: undefined }),
    turn('<command-name>/clear</command-name>', { origin: undefined }),
    turn('from a subagent', { isSidechain: true }),
    turn('<task-notification>done</task-notification>', { origin: { kind: 'task-notification' } }),
    JSON.stringify({ type: 'assistant', message: { content: 'hi' } }),
    'not json',
  ].join('\n')
  assert.deepEqual(typedTurns(jsonl), [{ text: 'no, do not mock the DB', session: '8294c2f0', date: '2026-10-23' }])
})

test('a pasted block and a system reminder are removed and the typed line kept; a turn over 400 chars is dropped', () => {
  assert.deepEqual(texts(turn('<pasted_content id="1">long log here</pasted_content>\nkeep the error shape')), ['keep the error shape'])
  assert.deepEqual(texts(turn([{ type: 'text', text: 'use pnpm' }, { type: 'text', text: '<system-reminder>hook</system-reminder>' }])), ['use pnpm'])
  assert.deepEqual(texts(turn('x'.repeat(401))), [])
  assert.deepEqual(texts(turn('/rig:build')), [])
  assert.deepEqual(texts(turn([{ type: 'text', text: 'see' }, { type: 'image', source: {} }])), [])
})

test('an old transcript without origin keeps string turns that do not start with <', () => {
  assert.deepEqual(texts(turn('stop adding comments', { origin: undefined })), ['stop adding comments'])
})

test('secret-shaped strings are redacted', () => {
  assert.equal(redact('use sk-ant-abcdefghijklmnop1234 here'), 'use [redacted] here')
  assert.equal(redact('key AKIAABCDEFGHIJKLMNOP and ghp_abcdefghijklmnopqrstuvwx'), 'key [redacted] and [redacted]')
  assert.equal(redact('token=abc123 please'), 'token=[redacted] please')
  assert.equal(redact('do not mock the db'), 'do not mock the db')
  assert.deepEqual(texts(turn('set password: hunter2 in env')), ['set password: [redacted] in env'])
})

test('the same correction in two sessions is one repeated item; twice in one session is not', () => {
  const cs = [
    { text: 'Do not mock the DB.', session: 'aaaaaaaa', date: '2026-10-20' },
    { text: 'do not  mock the db', session: 'bbbbbbbb', date: '2026-10-21' },
    { text: 'use pnpm', session: 'aaaaaaaa', date: '2026-10-20' },
    { text: 'use pnpm', session: 'aaaaaaaa', date: '2026-10-20' },
  ]
  assert.deepEqual(repeated(cs), [{ text: 'Do not mock the DB.', sessions: ['aaaaaaaa', 'bbbbbbbb'] }])
})

test('projectDir maps the repo path the way Claude Code names its project folder', () => {
  assert.equal(projectDir('/Users/x/learning_101/rig_v1', '/h'), path.join('/h', '.claude', 'projects', '-Users-x-learning-101-rig-v1'))
})

test('mineTranscripts reads the jsonl files of the folder, skips subdirectories, and a missing folder is empty', () => {
  assert.deepEqual(mineTranscripts(path.join(os.tmpdir(), 'rig-no-such-dir-xyz')), [])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-tx-'))
  fs.writeFileSync(path.join(dir, 'a.jsonl'), turn('no, do not mock the DB') + '\n')
  fs.mkdirSync(path.join(dir, 'a', 'subagents'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'a', 'subagents', 'b.jsonl'), turn('from a subagent folder') + '\n')
  fs.writeFileSync(path.join(dir, 'notes.txt'), turn('not a transcript') + '\n')
  assert.deepEqual(mineTranscripts(dir).map(c => c.text), ['no, do not mock the DB'])
  fs.rmSync(dir, { recursive: true, force: true })
})
