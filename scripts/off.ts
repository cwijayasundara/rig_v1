// `sdlc.ts off --why` / `on` (readiness doc R5): switch rig off for a repo with one committed file, .rig/off.json. It counts only once it
// is on the trunk: CI judges from the base and the local checks read the trunk's copy through git, so an agent that writes it on its own
// branch switches nothing off. The file is protected (harness-tamper, CODEOWNERS, deny rules), so turning rig off takes a code owner.
import fs from 'node:fs'
import path from 'node:path'
import { SDLC, git, out, fail, optString, sanctionWrites, type Args } from './core.ts'
import { trunk } from './protect.ts'

export type Off = { by: string; why: string; at: string; parsed: boolean }
const MARKER = '.rig/off.json'

export const trunkRef = (): string => (git(['rev-parse', '--verify', '--quiet', `origin/${trunk()}`]) ? `origin/${trunk()}` : trunk())

// The marker as the ref has it; null when the ref or the file is missing. A marker that does not parse still means off, so a broken
// file never blocks the repo that is trying to switch rig off.
export function rigOff(ref: string = trunkRef()): Off | null {
  const text = git(['show', `${ref}:${MARKER}`])
  if (text === null) return null
  try {
    const v = JSON.parse(text) as Partial<Off>
    return { by: String(v.by ?? '?'), why: String(v.why ?? '?'), at: String(v.at ?? '?'), parsed: true }
  } catch { return { by: '?', why: '?', at: '?', parsed: false } }
}

export const offLine = (off: Off, ref: string): string =>
  `rig is off on ${ref} ${off.parsed ? `since ${off.at} (by ${off.by}: ${off.why})` : `(${MARKER} could not be parsed)`}; checks skipped. Switch it on with: node .rig/bin/sdlc.ts on`

const viaPr = (state: string): string => `commit it on a branch, open a PR and have a code owner approve; rig is ${state} once it is on ${trunkRef()}`

export function cmdOff(args: Args): void {
  const why = optString(args, 'why')?.trim()
  if (!why) fail('usage: off --why "<reason>" (the reason is recorded in .rig/off.json)')
  const file = path.join(SDLC, 'off.json')
  if (fs.existsSync(file)) return out(`${MARKER} already exists; ${viaPr('off')}`)
  const by = git(['config', 'user.name'])?.trim() || 'unknown'
  fs.writeFileSync(file, JSON.stringify({ by, why, at: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
  sanctionWrites([MARKER])
  out(`wrote ${MARKER}: ${viaPr('off')}`)
}

export function cmdOn(): void {
  const file = path.join(SDLC, 'off.json')
  if (!fs.existsSync(file)) return out(`rig is not off here (${MARKER} is absent)`)
  fs.rmSync(file)
  sanctionWrites([MARKER])
  out(`removed ${MARKER}: commit the deletion on a branch, open a PR and have a code owner approve; rig is on again once the deletion is on ${trunkRef()}`)
}
