// Computed dependents (pilot §3): who imports the changed files, by a static search of import lines.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importsOf, dependentsOf, outsideRadius } from './dependents.ts'

const run = (changed: string[], tree: Record<string, string>) => dependentsOf(changed, Object.keys(tree), f => tree[f] ?? '')

test('importsOf reads import, export from, dynamic import and require in JS and TS, and import and from in Python', () => {
  assert.deepEqual(importsOf('a.ts', `import { x } from './x'\nexport * from "./y"\nconst z = await import('./z')\nconst w = require('./w')\nimport './side'`).sort(), ['./side', './w', './x', './y', './z'])
  assert.deepEqual(importsOf('a.py', 'import os, pkg.mod as m\nfrom .sib import f, g as h\nfrom pkg import (a,\n b)\n').sort(), ['.sib', '.sib.f', '.sib.g', 'os', 'pkg', 'pkg.a', 'pkg.mod'].sort())
  assert.deepEqual(importsOf('a.go', 'import "fmt"'), [])
})

test('a TS file that imports the changed one is a dependent; an index file, a .js specifier for a .ts file and a transitive importer are found, with the changed file as via', () => {
  const r = run(['src/price.ts'], { 'src/price.ts': '', 'src/cart.ts': "import { p } from './price.js'", 'src/pay/index.ts': "import { c } from '../cart'", 'src/app.ts': "import { pay } from './pay'", 'src/other.ts': "import x from 'left-pad'" })
  assert.deepEqual(r.all, [{ file: 'src/cart.ts', via: 'src/price.ts' }, { file: 'src/pay/index.ts', via: 'src/price.ts' }]) // app.ts is three hops away
})

test('the search stops at two hops, and a file already in the change is never a dependent', () => {
  const tree = { 'a.ts': '', 'b.ts': "import './a'", 'c.ts': "import './b'", 'd.ts': "import './c'" }
  assert.deepEqual(run(['a.ts'], tree).all.map(d => d.file), ['b.ts', 'c.ts'])
  assert.deepEqual(run(['a.ts', 'b.ts'], tree).all.map(d => d.file), ['c.ts', 'd.ts'], 'b.ts is changed, so it is not listed; its importers count from it')
})

test('Python: a relative import, an absolute dotted import by path suffix, and a package __init__ are resolved', () => {
  const r = run(['src/pkg/util.py'], { 'src/pkg/util.py': '', 'src/pkg/a.py': 'from .util import f', 'src/main.py': 'from pkg import util', 'src/pkg/__init__.py': 'from . import util', 'src/x.py': 'import os' })
  assert.deepEqual(r.all.map(d => d.file).sort(), ['src/main.py', 'src/pkg/__init__.py', 'src/pkg/a.py'])
})

test('a changed file in a language this search does not read is named as not analysed, never silently none', () => {
  const r = run(['svc/pay.go', 'src/a.ts'], { 'svc/pay.go': '', 'src/a.ts': '' })
  assert.deepEqual(r.unsupported, ['svc/pay.go']); assert.deepEqual(r.all, [])
})

test('outsideRadius keeps dependents the spec did not list: a path, a directory and a glob each cover theirs', () => {
  const deps = [{ file: 'src/a.ts', via: 'x' }, { file: 'lib/b.ts', via: 'x' }, { file: 'web/c.ts', via: 'x' }, { file: 'api/d.ts', via: 'x' }]
  assert.deepEqual(outsideRadius(deps, ['src/a.ts', 'lib/', 'web/**']).map(d => d.file), ['api/d.ts'])
})
