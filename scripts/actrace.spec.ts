// code-modernization JPetStore: skipped tests were counted as covering rules. "Named by a test" must mean a test that can run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { namingText } from './actrace.ts'

test('a skipped, disabled or focused-out test does not name an acceptance criterion', () => {
  for (const src of [
    "test.skip('AC-1.2 works', () => {})\n",
    "xit('AC-1.2 works', () => {})\n",
    "@pytest.mark.skip\ndef test_ac_1_2_works(): pass\n",
    "@pytest.mark.skip(reason='later')\n@pytest.mark.parametrize('x', [1])\ndef test_ac_1_2_works(x): pass\n",
    "@Disabled\n@Test\nvoid ac_1_2_works() {}\n",
    "@unittest.skip('later')\nclass T:\n    @unittest.expectedFailure\n    def test_ac_1_2(self): pass\n",
  ]) assert.doesNotMatch(namingText(src).toLowerCase(), /ac[-_]1[._]2/, src)
})

test('a skip on another test, even the line above, leaves the next test counted', () => {
  assert.match(namingText("it.skip('other', () => {})\nit('AC-1.2 works', () => {})\n"), /AC-1\.2/)
  assert.match(namingText("@pytest.mark.skip\ndef test_other(): pass\n\ndef test_ac_1_2_works(): pass\n"), /ac_1_2/)
})

test('a very long line is read in linear time', () => {
  const t = Date.now()
  namingText(`${'a'.repeat(100_000)}\n${'@'.repeat(100_000)}\n`)
  assert.ok(Date.now() - t < 1000)
})
