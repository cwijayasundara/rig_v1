// The lessons file (learning loop design 2026-10-17): one line per lesson, parsed and checked by script.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLessons, formatLesson, checkLessons, type Lesson } from './learnfile.ts'

const L7: Lesson = { id: 'L7', text: 'Handlers return the contract error shape, never a bare string', key: 'error-shape', seen: ['cart-add', 'cart-remove'], first: '2026-10-17', lastFired: '2026-10-24', status: 'active' }
const line = (over: Partial<Lesson> = {}): string => formatLesson({ ...L7, ...over })
const SLUGS = ['cart-add', 'cart-remove', 'cart-pay']

test('a lesson line round-trips through format and parse', () => {
  assert.equal(line(), '- L7 | Handlers return the contract error shape, never a bare string | key: error-shape | seen: cart-add, cart-remove | first 2026-10-17 | last-fired 2026-10-24 | active')
  assert.deepEqual(parseLessons(`# Lessons\n\n${line()}\n`), { lessons: [L7], errors: [] })
})

test('a promoted status keeps its rule id', () => {
  assert.equal(parseLessons(line({ status: 'promoted:no-bare-error' })).lessons[0]?.status, 'promoted:no-bare-error')
})

test('check passes an empty file and comment-only text', () => {
  assert.deepEqual(checkLessons('', SLUGS), [])
  assert.deepEqual(checkLessons('# Lessons\n\nnothing yet\n', SLUGS), [])
})

test('check passes a valid lesson', () => {
  assert.deepEqual(checkLessons(line(), SLUGS), [])
})

test('check rejects a 26-word lesson', () => {
  const errors = checkLessons(line({ text: Array.from({ length: 26 }, (_, i) => `w${i}`).join(' ') }), SLUGS)
  assert.match(errors.join('\n'), /L7.*26 words/)
})

test('check rejects a lesson citing one change', () => {
  assert.match(checkLessons(line({ seen: ['cart-add'] }), SLUGS).join('\n'), /L7.*at least 2/)
})

test('check rejects a slug that is not a change', () => {
  assert.match(checkLessons(line({ seen: ['cart-add', 'ghost'] }), SLUGS).join('\n'), /L7.*ghost/)
})

test('check rejects duplicate ids', () => {
  assert.match(checkLessons(`${line()}\n${line()}`, SLUGS).join('\n'), /duplicate id L7/)
})

test('check rejects 31 active lessons but not 30 active plus retired ones', () => {
  const many = (n: number, status: Lesson['status'] = 'active') => Array.from({ length: n }, (_, i) => line({ id: `A${i}${status === 'active' ? '' : 'r'}`, status })).join('\n')
  assert.match(checkLessons(many(31), SLUGS).join('\n'), /31 active/)
  assert.deepEqual(checkLessons(`${many(30)}\n${many(5, 'retired')}`, SLUGS), [])
})

test('check rejects a text containing a pipe', () => {
  assert.match(checkLessons('- L7 | use a | b | key: k | seen: cart-add, cart-remove | first 2026-10-17 | last-fired 2026-10-24 | active', SLUGS).join('\n'), /L7/)
})

test('check rejects a bad date and a bad status', () => {
  assert.match(checkLessons(line({ first: '17/10/2026' }), SLUGS).join('\n'), /L7.*date/)
  assert.match(checkLessons(line({ status: 'maybe' as Lesson['status'] }), SLUGS).join('\n'), /L7.*status/)
})
