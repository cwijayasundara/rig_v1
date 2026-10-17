// Wiki citations (wiki design 2026-10-17): parse them, find the symbol they name, hash its declaration. Pure over text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCites, findSymbol, hashText, citeHash, normalise } from './wikicite.ts'

const SRC = `import x from './x.ts'

// adds two numbers
export function add(a: number, b: number): number {
  const s = '}' // a brace in a string
  return a + b + s.length
}

export const mul = (a: number, b: number): number => a * b

export interface Shape { w: number; h: number }

export class Box {
  area(s: Shape): number {
    return s.w * s.h
  }
}

function twice() { return 1 }
function twice() { return 2 }
`

test('parseCites reads code and why citations at the end of a line', () => {
  assert.deepEqual(parseCites('Adds. [src/a.ts#f]'), [{ kind: 'code', path: 'src/a.ts', symbol: 'f' }])
  assert.deepEqual(parseCites('The module. [src/a.ts]'), [{ kind: 'code', path: 'src/a.ts' }])
  assert.deepEqual(parseCites('Chosen for cents. [adr:0003]'), [{ kind: 'why', type: 'adr', ref: '0003' }])
  assert.deepEqual(parseCites('x [commit:ab12cd3]'), [{ kind: 'why', type: 'commit', ref: 'ab12cd3' }])
  assert.deepEqual(parseCites('x [pr:42]'), [{ kind: 'why', type: 'pr', ref: '42' }])
  assert.deepEqual(parseCites('x [src/a.ts#f] [src/b.ts]'), [{ kind: 'code', path: 'src/a.ts', symbol: 'f' }, { kind: 'code', path: 'src/b.ts' }])
})

test('parseCites rejects line ranges, escaping paths and lines that do not end with a citation', () => {
  assert.deepEqual(parseCites('x [src/a.ts#1..5]'), [])
  assert.deepEqual(parseCites('x [../x.ts]'), [])
  assert.deepEqual(parseCites('x [/etc/passwd]'), [])
  assert.deepEqual(parseCites('[src/a.ts#f] and then more text'), [])
})

test('findSymbol returns the declaration of a function, arrow const, interface, class and method', () => {
  assert.match(findSymbol(SRC, 'add') ?? '', /^export function add[\s\S]*return a \+ b \+ s\.length\n}$/)
  assert.equal(findSymbol(SRC, 'mul'), 'export const mul = (a: number, b: number): number => a * b')
  assert.equal(findSymbol(SRC, 'Shape'), 'export interface Shape { w: number; h: number }')
  assert.match(findSymbol(SRC, 'Box') ?? '', /^export class Box \{[\s\S]*\n}$/)
  assert.match(findSymbol(SRC, 'area') ?? '', /^area\(s: Shape\): number \{[\s\S]*s\.w \* s\.h[\s\S]*\}$/)
})

test('findSymbol is null for a missing name and for a name declared twice', () => {
  assert.equal(findSymbol(SRC, 'nope'), null)
  assert.equal(findSymbol(SRC, 'twice'), null)
})

test('hashText ignores whitespace and comments inside the declaration and changes with a token', () => {
  const a = 'function f(a) {\n  return a + 1 // one\n}'
  const b = 'function f(a) { /* x */ return   a + 1 }'
  const c = 'function f(a) { return a + 2 }'
  assert.equal(hashText(a), hashText(b))
  assert.notEqual(hashText(a), hashText(c))
  assert.match(hashText(a), /^[0-9a-f]{16}$/)
  assert.equal(normalise('a  b\n c // d'), 'a b c')
})

test('citeHash hashes the symbol, the whole file, and is null when missing or unresolved', () => {
  const read = (p: string): string | null => (p === 'src/a.ts' ? SRC : null)
  assert.equal(citeHash({ kind: 'code', path: 'src/a.ts', symbol: 'mul' }, read), hashText('export const mul = (a: number, b: number): number => a * b'))
  assert.equal(citeHash({ kind: 'code', path: 'src/a.ts' }, read), hashText(SRC))
  assert.equal(citeHash({ kind: 'code', path: 'src/gone.ts', symbol: 'mul' }, read), null)
  assert.equal(citeHash({ kind: 'code', path: 'src/a.ts', symbol: 'twice' }, read), null)
})

test('findSymbol spans an arrow body on the next line, an object return type, a generic extends clause, regex literals and nested templates', () => {
  const body = (src: string, name: string): string => findSymbol(src, name) ?? ''
  assert.match(body('const f = (a: number) =>\n  a + 1\nconst g = 1\n', 'f'), /a \+ 1$/)
  assert.match(body('function f(): { a: number } {\n  return { a: 1 }\n}\nconst g = 1\n', 'f'), /return \{ a: 1 \}\n\}$/)
  assert.match(body('class A extends B<{ x: 1 }> {\n  m() {}\n}\nconst g = 1\n', 'A'), /m\(\) \{\}\n\}$/)
  assert.equal(body("function f() { return /'/.test(x) }\nfunction h() { return 1 }\n", 'f'), "function f() { return /'/.test(x) }")
  assert.equal(body('const s = `a ${x ? `b}` : "c"} {`\nfunction g() { return 1 }\n', 's'), 'const s = `a ${x ? `b}` : "c"} {`')
  assert.equal(body('const r = a / b\nconst q = c / d\n', 'r'), 'const r = a / b')
})

test('an edit inside those shapes changes the hash', () => {
  const read = (t: string) => (p: string): string | null => (p === 'a.ts' ? t : null)
  const h = (t: string, symbol: string): string | null => citeHash({ kind: 'code', path: 'a.ts', symbol }, read(t))
  assert.notEqual(h('const f = (a: number) =>\n  a + 1\n', 'f'), h('const f = (a: number) =>\n  a + 2\n', 'f'))
  assert.notEqual(h('function f(): { a: number } {\n  return { a: 1 }\n}\n', 'f'), h('function f(): { a: number } {\n  return { a: 2 }\n}\n', 'f'))
})
