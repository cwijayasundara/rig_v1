// shop_app sprint 0 asked 18 questions in /rig:start: the skill says "one AskUserQuestion batch" but did not allow the tool.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve(import.meta.dirname, '../skills')
const skills = fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'SKILL.md')))

test('a skill that names AskUserQuestion lists it in allowed-tools', () => {
  for (const name of skills) {
    const text = fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8')
    const allowed = /^allowed-tools:(.*)$/m.exec(text)?.[1]
    if (allowed === undefined) continue
    if (text.includes('AskUserQuestion')) assert.match(allowed, /AskUserQuestion/, `${name} names AskUserQuestion but does not allow it`)
  }
})

test('start: a bare slug of a charted intent is resolved to its intent file', () => {
  const text = fs.readFileSync(path.join(dir, 'start', 'SKILL.md'), 'utf8')
  assert.match(text, /bare `<slug>` that names a charted intent/)
})
