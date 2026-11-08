// Integration journey for the intent map ship path (incorporations wave 1): the real sdlc CLI in a temp git repo, the real run ledger,
// intent-record and intent-adjudicate. Only the formal checker is a stub (formal.mjs prints verdict.json), so no Python or CrossHair is needed.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeRepo, sdlc, write } from './testkit.ts'

const FIX = path.resolve(import.meta.dirname, '../eval/fixtures/intent-map')
const MAP = fs.readFileSync(path.join(FIX, 'login/intent-plan.md'), 'utf8').replace('## Not promised', '## Formal command\nnode formal.mjs\n\n## Not promised')
const CLAUSES = ['C2', 'C3', 'C7', 'C8', 'C9']
type M = { id: string; clause: string; holds: boolean }
const killed = (clause: string, id = `m-${clause}`): M => ({ id, clause, holds: false })
let repo: string

const verdict = (mutants: M[]): void => write(repo, 'verdict.json', JSON.stringify({ clauses: Object.fromEntries(CLAUSES.map(c => [c, true])), mutants }))
const verify = (): { code: number | null; text: string } => { const r = sdlc(repo, ['verify', 'demo']); return { code: r.code, text: r.stdout + r.stderr } }
const record = (e: string): void => assert.equal(sdlc(repo, ['intent-record', 'demo', e, '--', 'node -e "process.exit(0)"']).code, 0)
const resultsPath = (): string => path.join(repo, '.rig/changes/demo/intent-results.json')

beforeEach(() => {
  repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--title', 'Demo'])
  write(repo, '.rig/changes/demo/intent-map.md', MAP)
  // The shipped code: committed on the base, then edited by this change, so it is in the verify diff; the checker imports it.
  write(repo, 'src/login.js', 'export const login = () => 1\n')
  execFileSync('git', ['add', '-A'], { cwd: repo }); execFileSync('git', ['commit', '-qm', 'base'], { cwd: repo })
  write(repo, 'src/login.js', 'export const login = () => 2\n')
  write(repo, 'formal.mjs', "import './src/login.js'\nimport fs from 'node:fs'\nif (!fs.existsSync('verdict.json')) process.exit(2)\nconsole.log('checking')\nconsole.log(fs.readFileSync('verdict.json', 'utf8').trim())\n")
})

test('green path: recorded scenarios, a rejected mutant for every clause and a verdict ship clean', () => {
  verdict(CLAUSES.map(c => killed(c)))
  record('E1'); record('E2')
  const v = verify()
  assert.doesNotMatch(v.text, /vacuous|unmutated|formal-failed|formal-targets-diff|result-unbacked|empirical-/)
})

test('an equivalent mutant blocks as vacuous until a person adjudicates it non-bug with a named approver', () => {
  verdict([...CLAUSES.filter(c => c !== 'C2').map(c => killed(c)), { id: 'm1', clause: 'C2', holds: true }])
  record('E1'); record('E2')
  assert.match(verify().text, /vacuous/)
  assert.equal(sdlc(repo, ['intent-adjudicate', 'demo', 'm1', 'clause-vacuous', '--clause', 'C2', '--by', 'Ana', '--', 'the clause is too loose']).code, 0)
  assert.match(verify().text, /vacuous/)
  assert.notEqual(sdlc(repo, ['intent-adjudicate', 'demo', 'm1', 'non-bug', '--', 'commutes']).code, 0)
  assert.match(verify().text, /vacuous/)
  assert.equal(sdlc(repo, ['intent-adjudicate', 'demo', 'm1', 'non-bug', '--clause', 'C2', '--by', 'Ana', '--', 'the reorder commutes']).code, 0)
  assert.doesNotMatch(verify().text, /vacuous/)
})

test('a second planted bug of a clause that survives is vacuous even when the first was rejected', () => {
  verdict([...CLAUSES.map(c => killed(c)), { id: 'm-C3-late', clause: 'C3', holds: true }])
  record('E1'); record('E2')
  const v = verify()
  assert.match(v.text, /vacuous/)
  assert.match(v.text, /m-C3-late/)
})

test('a hand-written pass is result-unbacked, and recording through intent-record clears it', () => {
  verdict(CLAUSES.map(c => killed(c)))
  const forged = Object.fromEntries(['E1', 'E2'].map(e => [e, { status: 'pass', command: 'node -e "process.exit(0)"', commit: 'abc1234' }]))
  write(repo, '.rig/changes/demo/intent-results.json', JSON.stringify(forged))
  const v = verify()
  assert.match(v.text, /result-unbacked/)
  assert.notEqual(v.code, 0)
  record('E1'); record('E2')
  assert.doesNotMatch(verify().text, /result-unbacked/)
})

test('editing a recorded result after the fact (another command) is result-unbacked', () => {
  verdict(CLAUSES.map(c => killed(c)))
  record('E1'); record('E2')
  const res = JSON.parse(fs.readFileSync(resultsPath(), 'utf8'))
  res.E1.command = 'node -e "console.log(1)"'
  fs.writeFileSync(resultsPath(), JSON.stringify(res))
  assert.match(verify().text, /result-unbacked/)
})

test('a formal command that does not run fails closed as formal-failed', () => {
  record('E1'); record('E2')
  const v = verify()
  assert.match(v.text, /formal-failed/)
  assert.notEqual(v.code, 0)
})

test('a failing scenario cannot ship by copying another scenario\'s passing result', () => {
  verdict(CLAUSES.map(c => killed(c)))
  record('E1')
  assert.equal(sdlc(repo, ['intent-record', 'demo', 'E2', '--', 'node -e "process.exit(1)"']).code, 1)
  const res = JSON.parse(fs.readFileSync(resultsPath(), 'utf8'))
  res.E2 = { ...res.E1 }
  fs.writeFileSync(resultsPath(), JSON.stringify(res))
  const v = verify()
  assert.match(v.text, /result-unbacked/)
  assert.notEqual(v.code, 0)
})

test('a checker that only imports a copy beside it is formal-targets-diff, even though the copy is new in the diff', () => {
  verdict(CLAUSES.map(c => killed(c)))
  record('E1'); record('E2')
  write(repo, 'model.mjs', 'export const login = () => 2\n')
  write(repo, 'formal.mjs', "import './model.mjs'\nimport fs from 'node:fs'\nconsole.log(fs.readFileSync('verdict.json', 'utf8').trim())\n")
  const v = verify()
  assert.match(v.text, /formal-targets-diff/)
  assert.notEqual(v.code, 0)
})

// Plan phase: `approve --check` is where a person's approval is refused for a gap in the map.
const planCheck = (map: string): string => {
  write(repo, '.rig/changes/demo/intent-map.md', map)
  write(repo, '.rig/changes/demo/spec.md', `# Spec\n\n## Behaviours\n${sdlc(repo, ['intent-project', 'demo']).stdout.trim()}\n\n## Open questions\nnone\n`)
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Files\n- src/login.js\n\n## Open questions\nnone\n')
  const r = sdlc(repo, ['approve', 'demo', '--check'])
  return r.stdout + r.stderr
}

test('plan phase: a silent one-way row and an unnamed clause symbol refuse approval; the fixed map is accepted', () => {
  const silent = MAP.replace('decision D2. ', '')
  assert.match(planCheck(silent), /one-way-unjustified/)
  const unnamed = MAP.replace(/## Trusted\n(?:- .*\n)+/, '')
  assert.match(planCheck(unnamed), /trusted-unpinned/)
  assert.doesNotMatch(planCheck(MAP), /one-way-unjustified|trusted-unpinned/)
})

test('a property command that fails blocks verify as property-failed; one that passes ships and is in the ledger', () => {
  verdict(CLAUSES.map(c => killed(c)))
  record('E1'); record('E2')
  const withProperty = (exit: number): void => {
    write(repo, '.rig/changes/demo/intent-map.md', MAP.replace('## Not promised', '## Property command\nnode prop.mjs\n\n## Not promised'))
    write(repo, 'prop.mjs', `console.log('sampled 200 inputs')\nprocess.exit(${exit})\n`)
  }
  withProperty(1)
  const bad = verify()
  assert.match(bad.text, /property-failed/)
  assert.notEqual(bad.code, 0)
  withProperty(0)
  assert.doesNotMatch(verify().text, /property-failed/)
  const ledger = fs.readFileSync(path.join(repo, '.rig/changes/demo/evidence/runs.jsonl'), 'utf8')
  assert.match(ledger, /node prop\.mjs/)
})

test('after a change ships, drift in the world is proposed once by intent-recheck and the record is untouched', () => {
  verdict(CLAUSES.map(c => killed(c)))
  record('E1'); record('E2')
  assert.doesNotMatch(verify().text, /vacuous|unmutated|formal-failed|formal-targets-diff|result-unbacked|property-failed|empirical-/)
  write(repo, '.rig/changes/demo/pr.md', '# PR\n')
  execFileSync('git', ['add', '-A'], { cwd: repo }); execFileSync('git', ['commit', '-qm', 'ship demo'], { cwd: repo })
  const recheck = (): { slug: string }[] => JSON.parse(sdlc(repo, ['intent-recheck', '--json']).stdout.trim()).proposed
  assert.deepEqual(recheck(), [])
  const before = fs.readFileSync(resultsPath(), 'utf8')
  verdict([...CLAUSES.map(c => killed(c)), { id: 'm-new', clause: 'C2', holds: true }])
  assert.equal(recheck().length, 1)
  assert.deepEqual(recheck(), [])
  assert.equal(fs.readFileSync(resultsPath(), 'utf8'), before)
})
