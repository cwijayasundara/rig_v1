import test from 'node:test'
import assert from 'node:assert/strict'
import { keepAwake, resetAwake } from './awake.mjs'

test('on macOS it starts caffeinate tied to this process, once', () => {
  resetAwake()
  const calls = []
  const start = (cmd, args) => { calls.push([cmd, ...args]); return { on() {}, unref() {} } }
  assert.equal(keepAwake({ platform: 'darwin', start, pid: 42 }), true)
  assert.equal(keepAwake({ platform: 'darwin', start, pid: 42 }), false)
  assert.deepEqual(calls, [['caffeinate', '-ims', '-w', '42']])
  resetAwake()
})

test('elsewhere it does nothing, and a missing caffeinate does not stop the run', () => {
  resetAwake()
  assert.equal(keepAwake({ platform: 'linux', start: () => { throw new Error('no') } }), false)
  assert.equal(keepAwake({ platform: 'darwin', start: () => { throw new Error('ENOENT') } }), false)
  resetAwake()
})
