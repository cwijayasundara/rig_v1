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
export const modelLabel = (model: string): string => model.replace(/^claude-/, '')
const agentName = (agent: string): string => agent.replace(/^rig[:-]/, '')
// One coloured run of text on the band.
export type Piece = { text: string; color?: string; dim?: boolean; bold?: boolean }
const cells = (s: string): number => [...s].length
// Pieces packed greedily into lines of at most `columns` cells, one cell between pieces, each line after the first
// starting `indent` cells in. A piece is never split; one wider than a line stands alone and its Text wraps.
// Flex rows did this before and, when the band was narrow, shrank every Text to a column or two (shop_app, 2026-10-23).
export function pack(pieces: Piece[], columns: number, indent = 0): Piece[][] {
  const lines: Piece[][] = []
  let used = 0
  for (const p of pieces) {
    const line = lines[lines.length - 1]
    if (line?.length && used + 1 + cells(p.text) <= columns) { line.push(p); used += 1 + cells(p.text) } else { lines.push([p]); used = (lines.length > 1 ? indent : 0) + cells(p.text) }
  }
  return lines
}
export const parseJourney = (stdout: string): Journey | null => { try { return JSON.parse(stdout) as Journey } catch { return null } }

// A failed refresh keeps the last band: a hook on prompt.submit must never block the person's prompt.
async function refresh($: EngineInterface): Promise<void> {
  try { await load($) } catch { /* keep the previous band */ }
}
// Tokens, context and dollars only: no process call, so it can run every 2 s. The atom is written only when a number moved, so an idle session redraws nothing.
let turnBase = 0
async function tick($: EngineInterface): Promise<void> {
  try {
    const u = await $.session.usage()
    const next: Spend = { contextTokens: u.context.tokens ?? 0, contextWindow: u.context.window, usd: u.cost?.usd ?? 0, turnUsd: Math.max(0, (u.cost?.usd ?? 0) - turnBase) }
    await update($, spend, cur => (cur.contextTokens === next.contextTokens && cur.usd === next.usd && cur.turnUsd === next.turnUsd ? cur : next))
  } catch { /* keep the last numbers; the timer keeps running */ }
}
async function load($: EngineInterface): Promise<void> {
  const j = parseJourney((await $.process.run(sdlcArgv($.plugin.root, 'status', '--journey', '--json'))).stdout)
  await update($, journey, () => j)
  await tick($)
  if (j?.initialised) $.ui.status(`rig · ${j.next.command} · $${((await $.session.usage()).cost?.usd ?? 0).toFixed(2)}`)
}

let timer: { cancel: () => void } | null = null
let lastRefresh = 0

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    timer?.cancel()
    timer = $.clock.every(2000, () => { void tick($) })
    await refresh($)
    return next(e)
  })
  on('session.end', async ($, e, next) => { timer?.cancel(); timer = null; return next(e) })
  on('prompt.submit', async ($, e, next) => {
    try { turnBase = (await $.session.usage()).cost?.usd ?? 0 } catch { /* keep the last turn base */ }
    await refresh($)
    return next(e)
  })
  // A finished step shows without waiting for the turn to end; at most one process call every 3 s.
  on('tool.call', async ($, e, next) => {
    const now = Date.now()
    if (now - lastRefresh > 3000) { lastRefresh = now; void refresh($) }
    return next(e)
  })
  on('turn.complete', async ($, e, next) => { await refresh($); return next(e) })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const j = await read($, journey)
    if (e.props.hasSurvey || !j || (await read($, isHidden))) return next(e)
    const s = await read($, spend)
    const { Box, Text, Button } = $.ui.resolve(e)
    const columns = e.props.bodyColumns || 80
    const lines = (pieces: Piece[], indent: number) => pack(pieces, columns, indent).map((line, n) => (
      <Box key={`l${n}`} columnGap={1}>
        {n > 0 && indent > 1 ?<Text>{' '.repeat(indent - 1)}</Text> : null}
        {line.map((p, i) => <Text key={`p${i}`} color={p.color} dimColor={p.dim} bold={p.bold}>{p.text}</Text>)}
      </Box>
    ))
    const step = (st: JourneyStep, last: boolean): Piece => ({
      text: `${GLYPH[st.state]} ${st.command}${st.id === 'build' && st.detail ? ` (${st.detail})` : ''}${last ? '' : ' ─'}`,
      color: COLOR[st.state], dim: st.state === 'todo', bold: st.state === 'current' || st.state === 'gate',
    })
    // Consecutive unattended steps (build, test, fix, PR, advisory review) are drawn as one run: nobody gates it until merge.
    const segments = (steps: JourneyStep[]): JourneyStep[][] =>
      steps.reduce<JourneyStep[][]>((acc, st) => { const tail = acc[acc.length - 1]; if (tail && !!tail[0]?.auto === !!st.auto) tail.push(st); else acc.push([st]); return acc }, [])
    const rail = (name: string, steps: JourneyStep[]) => {
      const segs = segments(steps)
      const pieces: Piece[] = [{ text: name.toUpperCase().padEnd(10), bold: true }, ...segs.flatMap((seg, g) => {
        const last = g === segs.length - 1
        const nodes = seg.map((st, i) => step(st, last && i === seg.length - 1))
        return seg[0]?.auto ? [{ text: '⟳ auto⟦', color: 'magenta', bold: true }, ...nodes, { text: `⟧${last ? '' : ' ─'}`, color: 'magenta', bold: true }] : nodes
      })]
      return <Box key={name} flexDirection="column">{lines(pieces, 11)}</Box>
    }
    if (!j.initialised) return <Box><Text bold>rig </Text><Text dimColor>not set up here · run </Text><Text bold color="cyan">/rig:init</Text></Box>
    const blocks = j.sensors?.blocks ?? 0
    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between" flexWrap="wrap">
          <Text bold>{`rig ▸ ${j.kind}`}</Text>
          <Box columnGap={1} flexShrink={0}>
            <Text dimColor>{`ctx ${kilo(s.contextTokens)} ${meter(s.contextTokens, s.contextWindow)} · $${s.usd.toFixed(2)}${s.turnUsd ? ` (+$${s.turnUsd.toFixed(2)} this turn)` : ''}`}</Text>
            <Text color={blocks ? 'red' : 'green'}>{blocks ? `✗ ${blocks} blocking` : '✓ sensors'}</Text>
            <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
          </Box>
        </Box>
        {j.show.includes('outer') ? rail(`sprint ${j.sprint ?? 0}`, j.outer) : null}
        {j.show.includes('inner') ? (j.inner ? rail(j.inner.slug, j.inner.steps) : <Text dimColor>{'CHANGE'.padEnd(10)} none in flight</Text>) : null}
        {j.agents?.length ? <Text dimColor>{`agents    ${j.agents.map(a => `${agentName(a.agent)} ${modelLabel(a.model)}`).join(' · ')}`}</Text> : null}
        {lines([
          { text: '▸ next', color: 'cyan', bold: true },
          { text: j.next.by === 'person' ? (j.next.command.startsWith('/') ? 'a person runs' : 'a person:') : 'run', dim: true },
          { text: j.next.command, bold: true },
          { text: '  ◆ you  ⟳ runs by itself  ● now', dim: true },
        ], 7)}
      </Box>
    )
  })
}
