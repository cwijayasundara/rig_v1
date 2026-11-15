#!/usr/bin/env node
// `npm run test:changed`: the unit specs a change touches, not the whole suite. The change is every file that differs from the
// merge base with main: committed on the branch, staged, unstaged or untracked. e2e tests and evals are never run here: a person
// starts those by hand (`npm test`, `npm run e2e:scripted`, `npm run eval`).
//   - a changed spec runs itself;
//   - a changed source file runs every scripts/*.spec.ts whose text names it (`foo.ts` for scripts/foo.ts, the path for a skill
//     or template), so the specs of its direct importers and the specs that read it run;
//   - a changed eval/ or tests/e2e/ .mjs file runs its sibling unit test (eval/foo.mjs -> eval/foo.test.mjs), and a changed .test.mjs runs
//     itself: those are the fake-model unit tests behind `test:e2e:unit`, never the scripted journey or an eval;
//   - always: typecheck, size and neutrality. Docs only: nothing.
// --dry prints the plan without running it.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
const at = process.argv.indexOf('--base')
const base = git('merge-base', at > 0 ? process.argv[at + 1] : 'main', 'HEAD')[0]
const head = process.argv.includes('--head') ? process.argv[process.argv.indexOf('--head') + 1] : null
const changed = [...new Set(head ? git('diff', '--name-only', base, head) : [...git('diff', '--name-only', base), ...git('ls-files', '--others', '--exclude-standard')])]
  .filter(f => fs.existsSync(path.join(ROOT, f)))

const isTest = f => /^scripts\/.*\.spec\.ts$/.test(f)
const list = (dir, re) => fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map(f => path.join(dir, String(f))).filter(f => re.test(f)) : []
const allTests = list('scripts', /\.spec\.ts$/)
const code = changed.filter(f => !isTest(f) && /^(scripts|hooks|skills|templates|agents|guides|eval|tests)\//.test(f) && !/\.md$/.test(f) || /^(skills|templates|agents|guides)\/.*\.md$/.test(f))
const needles = code.map(f => f.startsWith('scripts/') ? path.basename(f) : f)
const text = new Map(allTests.map(t => [t, fs.readFileSync(path.join(ROOT, t), 'utf8')]))
const picked = new Set(changed.filter(isTest))
for (const [t, body] of text) if (needles.some(n => body.includes(n))) picked.add(t)

const specs = [...picked]
const isUnit = f => /^(eval|tests\/e2e)\/.*\.test\.mjs$/.test(f)
const units = new Set(changed.filter(isUnit))
for (const f of changed) if (/^(eval|tests\/e2e)\/.*\.mjs$/.test(f) && !isUnit(f)) { const u = f.replace(/\.mjs$/, '.test.mjs'); if (fs.existsSync(path.join(ROOT, u))) units.add(u) }
const plan = [
  ['npm', ['run', 'typecheck']],
  ['node', ['--disable-warning=ExperimentalWarning', '--test', ...new Set([...specs, 'scripts/size.spec.ts', 'scripts/neutrality.spec.ts'])]],
]
if (units.size) plan.push(['node', ['--test', ...units]])
const docsOnly = changed.every(f => /\.md$/.test(f) && !/^(skills|templates|agents|guides)\//.test(f))
console.log(`changed: ${changed.length} file(s) since ${base.slice(0, 7)}${docsOnly ? ' (docs only: nothing to run)' : ''}`)
if (docsOnly) process.exit(0)
for (const [cmd, args] of plan) console.log(`  ${cmd} ${args.join(' ')}`)
if (process.argv.includes('--dry')) process.exit(0)
for (const [cmd, args] of plan) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
