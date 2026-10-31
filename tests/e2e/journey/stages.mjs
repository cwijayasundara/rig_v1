// The journey as data: each stage acts through the driver, then a deterministic gate, then the inspector's rubric.
import { gateInit, gateChart, gateApproved, gateBuilt } from './gates.mjs'

export const PRDS = { 1: 'docs/prd/sprint-1-library-desk.md', 2: 'docs/prd/sprint-2-library-desk-changes.md' }
export const intentPath = (sprint, slug) => `.rig/product/sprints/sprint-${sprint}/intents/${slug}.md`
// What a change may touch. The inspector judges scope beyond this.
export const ALLOWED = ['src/**', 'tests/**', 'pyproject.toml', '.rig/**', 'docs/**']

const chart = (id, sprint) => ({
  id, sprint, title: `chart sprint ${sprint}`, rubric: id,
  act: async ({ sb, driver, memo }) => { if (sprint === 2) memo.sprint1Ref = sb.git('rev-parse', 'HEAD'); await driver.chart(sprint, PRDS[sprint]) },
  gate: (c, { sb }) => gateChart(c, sb, sprint),
})
const approve = (id, sprint) => ({
  id, sprint, title: `approve sprint ${sprint}`, rubric: id, approve: true,
  artefacts: () => [`.rig/product/sprints/sprint-${sprint}/`, PRDS[sprint]],
  act: ({ driver }) => driver.approveChart(sprint),
  gate: (c, { sb }) => gateApproved(c, sb, sprint),
})
const build = (id, sprint) => ({
  id, sprint, title: `build sprint ${sprint}`, rubric: id, perIntent: true,
  context: ({ memo }) => (memo.sprint1Ref ? `Sprint 1 ended at commit ${memo.sprint1Ref}. Compare sprint 1 files with: git diff ${memo.sprint1Ref} -- <path>.` : ''),
  act: async ({ sb, driver, memo }, intent) => {
    memo.base = { ...memo.base, [intent.slug]: sb.git('rev-parse', 'HEAD') }
    const slug = await driver.startIntent(intentPath(sprint, intent.slug))
    memo.slugs = { ...memo.slugs, [intent.slug]: slug }
    await driver.buildIntent(slug)
  },
  gate: (c, { sb, memo }, intent) => gateBuilt(c, sb, { slug: memo.slugs[intent.slug], allowedPaths: ALLOWED, baseRef: memo.base[intent.slug] }),
})

export const STAGES = [
  { id: 'J0', title: 'init', rubric: 'J0', act: ({ driver }) => driver.init(), gate: (c, { sb }) => gateInit(c, sb) },
  chart('J1', 1), approve('J2', 1), build('J3', 1),
  chart('J4', 2), approve('J5', 2), build('J6', 2),
]
