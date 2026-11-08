import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { formalTargets } from './intenttargets.ts'

const tree = (files: Record<string, string>): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'targets-'))
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text) }
  return root
}

test('a python checker\'s local import of the shipped code is the target, not the checker', () => {
  const root = tree({ 'formal.py': 'from src.auth import decide\nimport os\n', 'src/auth.py': '' })
  assert.deepEqual(formalTargets('python3 formal.py', root), ['src/auth.py'])
})

test('a js checker\'s relative import is the target unless it is a sibling of the checker (a side copy)', () => {
  const root = tree({ 'tools/check.mjs': "import x from '../lib/model.mjs'\nimport y from './copy.mjs'\n", 'lib/model.mjs': '', 'tools/copy.mjs': '' })
  assert.deepEqual(formalTargets('node ./tools/check.mjs', root), ['lib/model.mjs'])
})

test('a command with no checker names its target directly, and non-files and bare imports give nothing', () => {
  const root = tree({ 'src/auth.py': '' })
  assert.deepEqual(formalTargets('crosshair check src/auth.py', root), ['src/auth.py'])
  assert.deepEqual(formalTargets('crosshair check nowhere.py --flag', root), [])
  const bare = tree({ 'formal.py': 'import os\nimport json\n' })
  assert.deepEqual(formalTargets('python3 formal.py', bare), [])
})
