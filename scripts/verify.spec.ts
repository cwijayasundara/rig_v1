// verify (spec 2026-10-16 §8): writes verify.json for the tree it judged; contracts validate before they run.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, approvedChange } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })
const verifyJson = () => JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/verify.json'), 'utf8'))

test('a failing commit sensor fails verify and is recorded in verify.json', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [{ id: 'unit', cmd: 'node -e "process.exit(2)"', cadence: 'commit', blocks: true, count: 'exit', guide: 'Unit tests pass.' }] }))
  approvedChange(repo, 'demo')
  assert.equal(sdlc(repo, ['verify', 'demo']).code, 1)
  assert.equal(verifyJson().pass, false)
  assert.match(verifyJson().blocks.join('\n'), /unit/)
})

test('a ci-cadence sensor runs at verify; a nightly one does not', () => {
  const mark = path.join(repo, '..', `ran-${path.basename(repo)}.txt`)
  const cmd = (name: string) => `node -e "require('fs').appendFileSync('${mark.replaceAll('\\', '/')}', '${name}\\n')"`
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [
    { id: 'audit', cmd: cmd('ci'), cadence: 'ci', blocks: false, count: 'exit', guide: 'No vulnerable deps.' },
    { id: 'mutation', cmd: cmd('nightly'), cadence: 'nightly', blocks: false, count: 'exit', guide: 'Tests catch mutants.' },
  ] }))
  approvedChange(repo, 'demo')
  sdlc(repo, ['verify', 'demo'])
  assert.deepEqual(fs.readFileSync(mark, 'utf8').trim().split('\n'), ['ci'])
})

test('contracts validate before they run at verify; a failing validate skips run', () => {
  const mark = path.join(repo, '..', `c-${path.basename(repo)}.txt`)
  const cmd = (name: string, exit: number) => `node -e "require('fs').appendFileSync('${mark.replaceAll('\\', '/')}', '${name}\\n'); process.exit(${exit})"`
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], contracts: { files: ['api/**'], validate: cmd('validate', 1), run: cmd('run', 0) } }))
  approvedChange(repo, 'demo')
  assert.equal(sdlc(repo, ['verify', 'demo']).code, 1)
  assert.deepEqual(fs.readFileSync(mark, 'utf8').trim().split('\n'), ['validate'])
})

test('a behaviour with no test that names it fails traceability', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [] }))
  approvedChange(repo, 'demo')
  const r = sdlc(repo, ['verify', 'demo'])
  assert.match(r.stdout, /\[traceability\][\s\S]*B1/)
})

test('a tree that changes while verify runs is recorded as tree null', () => {
  const cmd = `node -e "require('fs').writeFileSync('moved.txt', String(Math.random()))"`
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [{ id: 'mover', cmd, cadence: 'commit', blocks: true, count: 'exit', guide: 'Moves the tree.' }] }))
  approvedChange(repo, 'demo')
  sdlc(repo, ['verify', 'demo'])
  assert.equal(verifyJson().tree, null)
})
