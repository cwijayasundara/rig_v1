// An export is an interface: something outside its file must name it, or it is private (drop the `export`). Over-exporting hides which
// functions are really shared and lets dead code pass for API. A spec, a hook, an eval or an e2e file counts as a user.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')

function walk(dir: string, keep: RegExp, out: string[] = []): string[] {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    if (['out', 'node_modules', 'results', 'fixtures', 'variants'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, keep, out)
    else if (keep.test(e.name)) out.push(p)
  }
  return out
}

test('every export of a script is named by some other file', () => {
  const files = [...walk(path.join(ROOT, 'scripts'), /\.ts$/), ...walk(path.join(ROOT, 'hooks'), /\.tsx?$/), ...walk(path.join(ROOT, 'eval'), /\.mjs$/), ...walk(path.join(ROOT, 'tests'), /\.mjs$/)]
  const words = new Map(files.map(f => [f, new Set(fs.readFileSync(f, 'utf8').match(/[A-Za-z_$][\w$]*/g))]))
  const unused: string[] = []
  for (const f of files.filter(f => path.dirname(f) === path.join(ROOT, 'scripts') && !f.endsWith('.spec.ts'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|type|interface|class|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1]!
      if (![...words].some(([o, w]) => o !== f && w.has(name))) unused.push(`${path.relative(ROOT, f)}: ${name}`)
    }
  }
  assert.deepEqual(unused, [], 'exported but named by no other file: drop the export')
})
