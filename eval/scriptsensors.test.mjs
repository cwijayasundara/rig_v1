// The eval's stand-in onboarding registers the test scripts a correct /rig:init would, at cadence ci.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withScriptSensors } from './lib/scriptsensors.mjs'

test('withScriptSensors adds one ci command sensor per script and keeps the rest of sensors.json', () => {
  const out = JSON.parse(withScriptSensors(JSON.stringify({ knownRed: [], sensors: [{ id: 'unit', cmd: 'npm test' }] }), ['test:all']))
  assert.deepEqual(out.knownRed, [])
  assert.equal(out.sensors[0].id, 'unit')
  assert.deepEqual({ ...out.sensors[1], guide: undefined }, { id: 'script-test-all', cmd: 'npm run test:all', cadence: 'ci', blocks: true, count: 'exit', guide: undefined })
})
