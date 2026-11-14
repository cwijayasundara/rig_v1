import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dollars } from '../src/format.js'

test('dollars formats cents', () => assert.equal(dollars(1999), '$19.99'))
