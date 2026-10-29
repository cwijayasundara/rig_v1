// Reverted changes become review eval cases (proposal 2026-10-27 C3): candidates from git, confirmed by a person, scored against the PR reviewer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gitIn } from './testkit.ts'
import { writeCandidates, readCases, scoreFindings, casePrompt, reviewEval, type ReviewCase } from './reviewcases.ts'
import { spawnSync } from 'node:child_process'

function shop(): { dir: string; git: (...a: string[]) => string; ship: (slug: string) => string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-cases-'))
  const git = (...a: string[]): string => gitIn(dir, ...a)
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'e@x'); git('config', 'user.name', 't')
  fs.mkdirSync(path.join(dir, 'src')); fs.writeFileSync(path.join(dir, 'src/cart.js'), 'export const total = xs => xs.reduce((a, b) => a + b, 0)\n')
  git('add', '-A'); git('commit', '-qm', 'init')
  const ship = (slug: string): string => {
    const d = path.join(dir, '.rig/changes', slug)
    fs.mkdirSync(d, { recursive: true })
    for (const [f, t] of Object.entries({ 'pr.md': 'pr\n', 'intent.md': `## Intent\n\n${slug} intent.\n`, 'spec.md': '## Behaviours\n- B1: totals add up\n', 'plan.md': '## Files\n- src/cart.js\n' })) fs.writeFileSync(path.join(d, f), t)
    fs.writeFileSync(path.join(dir, 'src/cart.js'), `export const total = xs => xs.reduce((a, b) => a - b, 0) // ${slug}\n`)
    git('add', '-A'); git('commit', '-qm', `ship ${slug}`)
    return git('rev-parse', 'HEAD')
  }
  return { dir, git, ship }
}
const caseDir = (dir: string): string => path.join(dir, '.rig/learn/review-cases')

test('each reverted merge becomes one candidate case, unconfirmed, with the files it changed outside .rig/', () => {
  const s = shop()
  const sha = s.ship('cart-total'); s.git('revert', '--no-edit', sha); s.ship('cart-tax')
  const r = writeCandidates(s.dir)
  assert.deepEqual([r.added, r.total, r.confirmed], [[`cart-total-${sha.slice(0, 7)}.json`], 1, 0])
  const c = JSON.parse(fs.readFileSync(path.join(caseDir(s.dir), r.added[0]!), 'utf8')) as ReviewCase
  assert.deepEqual([c.slug, c.sha, c.base, c.files, c.confirmed, c.defect], ['cart-total', sha, s.git('rev-parse', `${sha}^1`), ['src/cart.js'], false, { file: '', pattern: '' }])
  assert.match(c.note, /confirm/)
})

test('a second run adds nothing and never touches a person\'s confirmation; a malformed case is reported, not fatal', () => {
  const s = shop()
  const sha = s.ship('cart-total'); s.git('revert', '--no-edit', sha)
  const [name] = writeCandidates(s.dir).added
  const file = path.join(caseDir(s.dir), name!)
  const edited = JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), confirmed: true, defect: { file: 'src/cart.js', pattern: 'subtract|minus|sign' } })
  fs.writeFileSync(file, edited)
  assert.deepEqual(writeCandidates(s.dir), { added: [], total: 1, confirmed: 1 })
  assert.equal(fs.readFileSync(file, 'utf8'), edited)
  fs.writeFileSync(path.join(caseDir(s.dir), 'broken.json'), '{')
  assert.deepEqual(readCases(s.dir).bad, ['broken.json'])
  assert.equal(readCases(s.dir).cases.length, 1)
})

const defect = { file: 'src/cart.js', pattern: 'subtract|minus' }

test('a case is caught only by a Findings line naming the file and matching the pattern', () => {
  const line = '- [severity: high] [category: correctness] src/cart.js:1: total subtracts instead of adding. Fails when: [1, 2]. → add'
  assert.equal(scoreFindings(`verdict: changes-needed\n## Findings\n${line}\n`, defect), true)
  assert.equal(scoreFindings(`verdict: pass\n## Findings\n## Deferred\n${line}\n`, defect), false, 'a Deferred line is not a finding')
  assert.equal(scoreFindings(line, defect), false, 'no Findings heading: nothing is a finding')
  assert.equal(scoreFindings('## Findings\n- [severity: high] src/other.js:1: subtracts\n', defect), false)
})

function confirmedShop(): { dir: string; sha: string; c: ReviewCase } {
  const s = shop()
  const sha = s.ship('cart-total'); s.git('revert', '--no-edit', sha)
  const [name] = writeCandidates(s.dir).added
  const file = path.join(caseDir(s.dir), name!)
  const c = { ...(JSON.parse(fs.readFileSync(file, 'utf8')) as ReviewCase), confirmed: true, defect }
  fs.writeFileSync(file, JSON.stringify(c))
  return { dir: s.dir, sha, c }
}

test('the prompt carries the change as it merged and is tool-less', () => {
  const { dir, c } = confirmedShop()
  const p = casePrompt(dir, c, 'You are a code reviewer.\n\nInputs. Read them yourself; you are given nothing else.\n- x\n\nReview for, in this order: correctness.\n\nYou may read files and run read-only commands. Edit nothing.\n')
  assert.match(p, /reduce\(\(a, b\) => a - b, 0\)/)
  assert.match(p, /cart-total intent\./)
  assert.match(p, /- B1: totals add up/)
  assert.doesNotMatch(p, /Read them yourself|You may read files/)
})

test('review-eval scores confirmed cases only, stops at the cap, records a failed case, and appends one row', () => {
  const { dir } = confirmedShop()
  fs.writeFileSync(path.join(caseDir(dir), 'zz-unconfirmed.json'), JSON.stringify({ slug: 'zz', sha: 'x', base: 'y', files: [], confirmed: false, defect: { file: '', pattern: '' }, note: '' }))
  const hit = () => ({ text: '## Findings\n- [severity: high] [category: correctness] src/cart.js:1: subtracts. Fails when: [1,2]. → add\n', usd: 0.4 })
  assert.deepEqual(reviewEval(dir, { maxUsd: 5, runner: hit }), { scored: 1, caught: 1, failed: 0, usd: 0.4 })
  assert.deepEqual(reviewEval(dir, { maxUsd: 5, runner: () => { throw new Error('down') } }), { scored: 0, caught: 0, failed: 1, usd: 0 })
  assert.deepEqual(reviewEval(dir, { maxUsd: 0.000001, runner: hit }).scored, 1, 'the cap is checked before each case: the first always runs')
  const rows = fs.readFileSync(path.join(dir, '.rig/learn/review-eval.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)
  assert.equal(rows.length, 3)
  assert.deepEqual(Object.keys(rows[0]!).sort(), ['at', 'brief', 'cases', 'caught', 'failed', 'model', 'usd'])
})

test('learn review-eval refuses without a positive --max-usd, before spending anything', () => {
  const { dir } = confirmedShop()
  const sdlcTs = path.resolve(import.meta.dirname, 'sdlc.ts')
  for (const extra of [[], ['--max-usd', '0'], ['--max-usd', 'lots'], ['--max-usd'], ['--max-usd', 'Infinity']]) {
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', sdlcTs, 'learn', 'review-eval', ...extra], { cwd: dir, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir, RIG_CLAUDE: '/nonexistent' } })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /--max-usd/)
  }
})

test('with the real brief, the prompt asks for nothing a tool-less reviewer cannot do', () => {
  const { dir, c } = confirmedShop()
  const p = casePrompt(dir, c, fs.readFileSync(path.resolve(import.meta.dirname, '../templates/review-brief.md'), 'utf8'))
  assert.doesNotMatch(p, /Read them yourself|You may read files|git blame/)
  assert.match(p, /Everything you may use is below; you have no tools\./)
  assert.match(p, /verdict: pass \| changes-needed/)
})

test('a revert done by a PR labelled revert becomes a case when its number is passed', () => {
  const s = shop()
  s.ship('cart-total')
  fs.rmSync(path.join(s.dir, '.rig/changes/cart-total/pr.md')); s.git('add', '-A'); s.git('commit', '-qm', 'Undo the total (#9)')
  assert.deepEqual(writeCandidates(s.dir).added, [])
  assert.equal(writeCandidates(s.dir, [9]).added.length, 1)
})

test('a brief whose wording the eval cannot strip refuses the run before any spend, and logs nothing', () => {
  const { dir } = confirmedShop()
  fs.mkdirSync(path.join(dir, '.rig/templates'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.rig/templates/review-brief.md'), 'You review a change.\n\nInputs: look them up with your tools.\n\nYou may read files as you like.\n')
  let ran = 0
  assert.throws(() => reviewEval(dir, { maxUsd: 5, runner: () => { ran++; return { text: '', usd: 1 } } }), /review-brief\.md[\s\S]*tools/)
  assert.equal(ran, 0)
  assert.equal(fs.existsSync(path.join(dir, '.rig/learn/review-eval.jsonl')), false)
})

test('the prompt leaves binary files out and truncates a huge file, so one case cannot blow the budget', () => {
  const s = shop()
  fs.writeFileSync(path.join(s.dir, 'logo.png'), Buffer.from([0, 1, 2, 255, 0, 9]))
  fs.writeFileSync(path.join(s.dir, 'package-lock.json'), 'x'.repeat(200_000))
  const sha = s.ship('cart-total'); s.git('revert', '--no-edit', sha)
  const [name] = writeCandidates(s.dir).added
  const c = JSON.parse(fs.readFileSync(path.join(caseDir(s.dir), name!), 'utf8')) as ReviewCase
  const p = casePrompt(s.dir, c, 'Review for, in this order: correctness.\n')
  assert.match(p, /### logo\.png\n\(binary, left out\)/)
  assert.match(p, /\(truncated at 20000 characters\)/)
  assert.ok(p.length < 120_000, `prompt is ${p.length} characters`)
})
