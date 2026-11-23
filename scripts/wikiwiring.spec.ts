// How the wiki meets the rest of the harness (wiki design 2026-10-17): the init step, the warn-only CI step, and no sensor noise from wiki files.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

const at = (rel: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', rel), 'utf8')

test('the init skill runs `wiki init` for an existing codebase and names the next command without waiting', () => {
  const skill = at('skills/init/SKILL.md')
  assert.match(skill, /sdlc\.ts wiki init/)
  assert.match(skill, /wiki build/)
})

test('the wiki skill runs the wiki commands and forbids hand-editing generated pages', () => {
  const skill = at('skills/wiki/SKILL.md')
  assert.match(skill, /^name: wiki$/m)
  assert.match(skill, /`S` means `node [^`]*sdlc\.ts`/)
  for (const sub of ['init', 'build', 'status', 'verify', 'refresh']) assert.match(skill, new RegExp(`\\bS wiki ${sub}\\b`))
  assert.match(skill, /never (?:hand-)?edit/i)
})

test('the CI template checks wiki staleness as a warning that cannot fail the job', () => {
  const yml = at('templates/rig-check.yml')
  const step = /- name: Wiki staleness[\s\S]*?(?=\n      - name:|\s*$)/.exec(yml)?.[0] ?? ''
  assert.match(step, /continue-on-error: true/)
  assert.match(step, /wiki status/)
})

test('a change that only touches .rig/wiki files raises no finding in CI', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'rig')
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/wiki.json', '{"notes":[],"pages":[{"title":"A","purpose":"a"}]}\n')
  write(repo, '.rig/wiki/a.md', '# A\n\n> a\n\n- Claim. [src/a.ts#f]\n')
  write(repo, '.rig/wiki/state.json', '{"pages":{}}\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'wiki')
  const ci = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'])
  assert.equal(ci.code, 0, ci.stdout + ci.stderr)
})

// rig_v1_test 2026-11-23: the sync was a step of the pr skill only, so changes shipped by `S pr` alone left the repo with no wiki.
test('pr itself syncs the wiki before it gathers the files to commit, the skill has no sync step, and the commit carries the wiki files', () => {
  const pr = at('scripts/pr.ts')
  const sync = pr.search(/wikiSync\(ROOT/)
  assert.ok(sync > 0 && sync < pr.search(/const files = changeFiles\(slug, wrote\)/), 'the sync must come before the files are gathered')
  const skill = at('skills/pr/SKILL.md')
  assert.doesNotMatch(skill, /run `S wiki sync/)
  assert.match(skill, /`S pr` \(step 7\) syncs it/)
  const ships = at('scripts/risk.ts') // what a change's PR carries, shared by S pr and S risk
  assert.match(ships, /'\.rig\/wiki\/'/)
  assert.match(ships, /'\.rig\/wiki\.json'/)
})

test('a repo whose wiki.json came from `wiki sync` is still greenfield for the journey', () => {
  assert.match(at('scripts/journey.ts'), /origin === 'sync'/)
})
