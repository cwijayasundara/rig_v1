import { test, expect } from 'claude-code/testing'
import { kilo, meter, parseJourney, sdlcArgv } from './dashboard.tsx'

const journey = {
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
