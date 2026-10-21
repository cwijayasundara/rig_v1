import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify } from '../src/util/slug.js'

test('B8 slugify lowercases and hyphenates', () => {
  assert.equal(slugify('Green Tea!'), 'green-tea')
  assert.equal(slugify('  Mug  &  Saucer '), 'mug-saucer')
})
