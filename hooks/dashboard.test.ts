import { test, expect, mock } from 'claude-code/testing'
import { kilo, meter, modelLabel, parseJourney, sdlcArgv } from './dashboard.tsx'

const journey = {
  agents: [{ agent: 'rig-architect', model: 'claude-sonnet-5-5', at: 'a' }, { agent: 'rig:evaluator', model: 'claude-opus-5-5', at: 'b' }],
  initialised: true, kind: 'greenfield', show: ['outer', 'inner'], sprint: 0,
  outer: [
    { id: 'init', label: 'Init', command: '/rig:init', state: 'done' },
    { id: 'prd', label: 'PRD', command: 'write prd/sprint-0.md', state: 'done' },
    { id: 'chart', label: 'Chart', command: '/rig:chart 0', state: 'current' },
    { id: 'testplan', label: 'Test plan', command: '/rig:testplan 0', state: 'todo' },
    { id: 'approve', label: 'Approve', command: '/rig:approve chart-0', state: 'todo' },
    { id: 'build', label: 'Build', command: '/rig:start <intent>', state: 'todo' },
  ],
  inner: { slug: 'add-cart', type: 'feature', steps: [
    { id: 'approve', label: 'Approve', command: '/rig:approve add-cart', state: 'done', by: 'person' },
    { id: 'build', label: 'Build', command: '/rig:build add-cart', state: 'current', by: 'model', auto: true },
    { id: 'test', label: 'Test', command: '/rig:test add-cart', state: 'todo', by: 'model', auto: true },
    { id: 'merge', label: 'Merge', command: 'review and merge the PR', state: 'todo', by: 'person' },
  ] }, next: { command: '/rig:chart 0', by: 'model', why: 'x' }, ready: [], sensors: { blocks: 0 },
}

test('helpers: kilo, meter and the script path in plugin and vendored mode', () => {
  expect(kilo(48200)).toBe('48k')
  expect(kilo(900)).toBe('900')
  expect(meter(60, 100)).toBe('▮▮▮▯▯')
  expect(meter(0, 0)).toBe('▯▯▯▯▯')
  expect(sdlcArgv('/p/rig', 'status')[2]).toBe('/p/rig/scripts/sdlc.ts')
  expect(sdlcArgv('/r/.rig/mod', 'status')[2]).toBe('/r/.rig/mod/../bin/sdlc.ts')
  expect(parseJourney('not json')).toBeNull()
})

test('the band shows every step as its full command and the next command, on each surface that draws it', async ($, on) => {
  on('process.run', async () => ({ value: { stdout: JSON.stringify(journey), stderr: '', exitCode: 0 } }))
  on('session.usage', async () => ({ value: { startedAt: 0, context: { tokens: 48000, window: 200000 }, rateLimits: [], cost: { usd: 1.92 } } }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('ui.status', async () => ({ value: undefined }))
  await $.prompt.submit({ text: "hi" })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'rig', surface, component: 'AbovePrompt', props: { hasSurvey: false } })
    for (const c of ['/rig:init', '/rig:chart 0', '/rig:testplan 0', '/rig:approve chart-0']) {
      expect(await ui.find({ type: 'Text', text: new RegExp(c.replace(/[/]/g, '\\/')) })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /⟳ auto/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\/rig:build add-cart/ })).toBeDefined()
    await ui.unmount()
  }
})

// The engine raises session.start once the session is ready; nothing beneath the plugins handles it, so each test answers it before its first call.
const answerStart = (on: any): void => { on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd })); on('session.end', async (_$: any, e: any) => ({})) }
const start = ($: any): Promise<unknown> => $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })

test('modelLabel drops the claude- prefix', () => {
  expect(modelLabel('claude-opus-5-5')).toBe('opus-5-5')
  expect(modelLabel('sonnet')).toBe('sonnet')
})

test('the band shows the model each agent ran on and hides the line when there are none', async ($, on) => {
  let j: object = journey
  on('process.run', async () => ({ value: { stdout: JSON.stringify(j), stderr: '', exitCode: 0 } }))
  on('session.usage', async () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000 }, rateLimits: [], cost: { usd: 1 } } }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('ui.status', async () => ({ value: undefined }))
  await $.prompt.submit({ text: 'hi' })
  const ui = await $.ui.mount({ plugin: 'rig', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } })
  expect(await ui.find({ type: 'Text', text: /architect sonnet-5-5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /evaluator opus-5-5/ })).toBeDefined()
  await ui.unmount()
  j = { ...journey, agents: [] }
  await $.prompt.submit({ text: 'again' })
  const bare = await $.ui.mount({ plugin: 'rig', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } })
  expect(await bare.find({ type: 'Text', text: /architect/ })).toBeUndefined()
  await bare.unmount()
})

// Design 2026-10-18 §7: the numbers moved only on prompt and turn events, so they froze for the length of a long chart run.
test('spend updates between two clock ticks with no turn event', async ($, on) => {
  answerStart(on)
  const clock = mock.clock(on)
  let usd = 1
  on('process.run', async () => ({ value: { stdout: JSON.stringify(journey), stderr: '', exitCode: 0 } }))
  on('session.usage', async () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000 }, rateLimits: [], cost: { usd } } }))
  on('ui.status', async () => ({ value: undefined }))
  await start($)
  const ui = await $.ui.mount({ plugin: 'rig', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } })
  expect(await ui.find({ type: 'Text', text: /\$1\.00/ })).toBeDefined()
  usd = 1.5
  await clock.advance(2000)
  expect(await ui.find({ type: 'Text', text: /\$1\.50/ })).toBeDefined()
  await ui.unmount()
})

test('a failing usage call keeps the last numbers and the timer', async ($, on) => {
  answerStart(on)
  const clock = mock.clock(on)
  let fail = false
  let usd = 2
  on('process.run', async () => ({ value: { stdout: JSON.stringify(journey), stderr: '', exitCode: 0 } }))
  on('session.usage', async () => { if (fail) throw new Error('boom'); return { value: { startedAt: 0, context: { tokens: 1000, window: 200000 }, rateLimits: [], cost: { usd } } } })
  on('ui.status', async () => ({ value: undefined }))
  await start($)
  fail = true
  await clock.advance(2000)
  const ui = await $.ui.mount({ plugin: 'rig', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } })
  expect(await ui.find({ type: 'Text', text: /\$2\.00/ })).toBeDefined()
  fail = false
  usd = 3
  await clock.advance(2000)
  expect(await ui.find({ type: 'Text', text: /\$3\.00/ })).toBeDefined()
  await ui.unmount()
})

test('a second session.start leaves one timer', async ($, on) => {
  answerStart(on)
  const clock = mock.clock(on)
  let calls = 0
  on('process.run', async () => ({ value: { stdout: JSON.stringify(journey), stderr: '', exitCode: 0 } }))
  on('session.usage', async () => { calls++; return { value: { startedAt: 0, context: { tokens: 1, window: 2 }, rateLimits: [], cost: { usd: 1 } } } })
  on('ui.status', async () => ({ value: undefined }))
  await start($)
  await start($)
  calls = 0
  await clock.advance(2000)
  expect(calls).toBe(1)
})
