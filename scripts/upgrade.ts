// rig:upgrade: decide, per harness file, what to do with the project's copy. Pure; the caller reads disk and writes.
import { sha } from './core.ts'
import { isObject } from './model.ts'
import { isRegistryShape } from './registry.ts'
import type { loadPacks } from './stackpacks.ts'

export type Verdict = 'noop' | 'replace' | 'keep' | 'add' | 'delete' | 'conflict'

// base: hashes recorded at install (null: no manifest). disk: current text, null when absent. next: this plugin's files.
export function classify(base: Record<string, string> | null, disk: Map<string, string | null>, next: Map<string, string>): Map<string, Verdict> {
  const out = new Map<string, Verdict>()
  const paths = new Set([...next.keys(), ...disk.keys(), ...Object.keys(base ?? {})])
  for (const rel of paths) {
    const now = disk.get(rel) ?? null
    const want = next.get(rel)
    const was = base?.[rel]
    if (want === undefined) {
      if (now === null) continue
      out.set(rel, was !== undefined && sha(now) === was ? 'delete' : 'conflict')
    } else if (now === null) out.set(rel, 'add')
    else if (now === want) out.set(rel, 'noop')
    else if (was === undefined) out.set(rel, 'conflict')
    else if (sha(now) === was) out.set(rel, 'replace')
    else out.set(rel, sha(want) === was ? 'keep' : 'conflict')
  }
  return out
}

const idOf = (s: unknown): string | null => (isObject(s) && typeof s.id === 'string' ? s.id : null)

// Pack sensors whose id the team's registry lacks. Ids only: the team's commands are never compared or edited. Data only, never writes.
export function proposeSensors(sensorsJson: string, packs: ReturnType<typeof loadPacks>['packs']): { stack: string; sensors: Record<string, unknown>[] } | null {
  if (!isRegistryShape(sensorsJson)) return null
  const reg = JSON.parse(sensorsJson) as { stack?: unknown; sensors: unknown[] }
  const pack = packs.find(p => p.stack === reg.stack)
  if (!pack) return null
  const have = new Set(reg.sensors.map(idOf))
  const sensors = pack.sensors.filter((s): s is Record<string, unknown> => isObject(s) && !have.has(idOf(s)))
  return sensors.length ? { stack: pack.stack, sensors } : null
}
