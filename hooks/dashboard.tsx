// The journey dashboard (spec 2026-10-18): a band above the prompt with the sprint rail, the change rail, the next command and
// the session's spend. Read-only: every step and command comes from `sdlc.ts status --journey --json`; no lifecycle logic here.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Journey, JourneyStep, Spend } from '../types'

const journey = atom({ plugin: 'rig', key: 'journey' } as const, null as Journey | null)
const spend = atom({ plugin: 'rig', key: 'spend' } as const, { contextTokens: 0, contextWindow: 0, usd: 0 } as Spend)
const isHidden = atom({ plugin: 'rig', key: 'isHidden' } as const, false)

const GLYPH = { done: '✓', current: '●', gate: '◆', todo: '○' } as const
const COLOR = { done: 'green', current: 'cyan', gate: 'yellow', todo: undefined } as const

export const sdlcArgv = (root: string, ...args: string[]): string[] =>
  ['node', '--disable-warning=ExperimentalWarning', root.endsWith('/.rig/mod') ? `${root}/../bin/sdlc.ts` : `${root}/scripts/sdlc.ts`, ...args]

export const kilo = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const meter = (used: number, total: number, cells = 5): string => {
  const on = total > 0 ? Math.min(cells, Math.round((used / total) * cells)) : 0
  return '▮'.repeat(on) + '▯'.repeat(cells - on)
}
export const parseJourney = (stdout: string): Journey | null => { try { return JSON.parse(stdout) as Journey } catch { return null } }

// A failed refresh keeps the last band: a hook on prompt.submit must never block the person's prompt.
async function refresh($: EngineInterface): Promise<void> {
  try { await load($) } catch { /* keep the previous band */ }
}
async function load($: EngineInterface): Promise<void> {
  const j = parseJourney((await $.process.run(sdlcArgv($.plugin.root, 'status', '--journey', '--json'))).stdout)
  const u = await $.session.usage()
  await update($, journey, () => j)
  await update($, spend, () => ({ contextTokens: u.context.tokens ?? 0, contextWindow: u.context.window, usd: u.cost?.usd ?? 0 }))
  if (j?.initialised) $.ui.status(`rig · ${j.next.command} · $${(u.cost?.usd ?? 0).toFixed(2)}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => { await refresh($); return next(e) })
  on('prompt.submit', async ($, e, next) => { await refresh($); return next(e) })
  on('turn.complete', async ($, e, next) => { await refresh($); return next(e) })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const j = await read($, journey)
    if (e.props.hasSurvey || !j || (await read($, isHidden))) return next(e)
    const s = await read($, spend)
    const { Box, Text, Button } = $.ui.resolve(e)
    const one = (st: JourneyStep, last: boolean) => (
      <Text key={st.id} color={COLOR[st.state]} dimColor={st.state === 'todo'} bold={st.state === 'current' || st.state === 'gate'}>
        {`${GLYPH[st.state]} ${st.command}${st.id === 'build' && st.detail ? ` (${st.detail})` : ''}${last ? '' : ' ─'}`}
      </Text>
    )
    // Consecutive unattended steps (build, test, fix, PR, advisory review) are drawn as one run: nobody gates it until merge.
    const segments = (steps: JourneyStep[]): JourneyStep[][] =>
      steps.reduce<JourneyStep[][]>((acc, st) => { const tail = acc[acc.length - 1]; if (tail && !!tail[0]?.auto === !!st.auto) tail.push(st); else acc.push([st]); return acc }, [])
    const rail = (name: string, steps: JourneyStep[]) => (
      <Box flexWrap="wrap" columnGap={1}>
        <Text bold>{name.toUpperCase().padEnd(10)}</Text>
        {segments(steps).map((seg, g) => {
          const last = g === segments(steps).length - 1
          const nodes = seg.map((st, i) => one(st, last && i === seg.length - 1))
          return seg[0]?.auto
            ? <Box key={`auto${g}`} columnGap={1}><Text color="magenta" bold>⟳ auto⟦</Text>{nodes}<Text color="magenta" bold>⟧{last ? '' : ' ─'}</Text></Box>
            : <Box key={`seg${g}`} columnGap={1}>{nodes}</Box>
        })}
      </Box>
    )
    if (!j.initialised) return <Box><Text bold>rig </Text><Text dimColor>not set up here · run </Text><Text bold color="cyan">/rig:init</Text></Box>
    const blocks = j.sensors?.blocks ?? 0
    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold>{`rig ▸ ${j.kind}`}</Text>
          <Box columnGap={1}>
            <Text dimColor>{`ctx ${kilo(s.contextTokens)} ${meter(s.contextTokens, s.contextWindow)} · $${s.usd.toFixed(2)}`}</Text>
            <Text color={blocks ? 'red' : 'green'}>{blocks ? `✗ ${blocks} blocking` : '✓ sensors'}</Text>
            <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
          </Box>
        </Box>
        {j.show.includes('outer') ? rail(`sprint ${j.sprint ?? 0}`, j.outer) : null}
        {j.show.includes('inner') ? (j.inner ? rail(j.inner.slug, j.inner.steps) : <Text dimColor>{'CHANGE'.padEnd(10)} none in flight</Text>) : null}
        <Box columnGap={1}>
          <Text color="cyan" bold>▸ next</Text>
          <Text dimColor>{j.next.by === 'person' ? (j.next.command.startsWith('/') ? 'a person runs' : 'a person:') : 'run'}</Text>
          <Text bold>{j.next.command}</Text>
          <Text dimColor>{'   ◆ you  ⟳ runs by itself  ● now'}</Text>
        </Box>
      </Box>
    )
  })
}
