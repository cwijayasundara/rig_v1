// The incident skill records restoration (the CI templates it once sat with were deleted in step 4a).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
test('the incident skill records when service was restored', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'skills/incident/SKILL.md'), 'utf8'), /`restored:`/)
})
