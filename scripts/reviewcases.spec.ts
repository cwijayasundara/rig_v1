// Reverted changes become review eval cases (proposal 2026-10-27 C3): candidates from git, confirmed by a person, scored against the PR reviewer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeCandidates, readCases, type ReviewCase } from './reviewcases.ts'

function shop(): { dir: string; git: (...a: string[]) => string; ship: (slug: string) => string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-cases-'))
  const git = (...a: string[]): string => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim()
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
