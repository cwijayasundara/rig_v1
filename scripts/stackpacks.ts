// Stack packs (behavioural harness spec 2026-10-16 §4): per-language sensor defaults as data. Core never names a toolchain.
import fs from 'node:fs'
import path from 'node:path'
import { globToRegex, isObject, isStringList } from './model.ts'
import { parseRegistry, type Contracts, type Paths, type Registry } from './registry.ts'

// A fit rule (see stackadapt.ts): `unless` probes that suppress it, `when` probes of which one must hit, and what it does to `sensor`.
export type Probe = string | { in: string[]; match: string }
type FitRule = { sensor?: string; unless?: Probe[]; when?: Probe[]; drop?: boolean; cmd?: string; note: string }
export type StackPack = { stack: string; markers: string[]; paths: Partial<Paths>; contracts: Contracts; holdout: string; sensors: unknown[]; fit: FitRule[] }
export const PACKS_DIR = path.resolve(import.meta.dirname, '../templates/stacks')
const PACK_KEYS = ['stack', 'markers', 'paths', 'contracts', 'holdout', 'sensors', 'fit']
const isProbe = (p: unknown): boolean => typeof p === 'string' || (isObject(p) && isStringList(p.in) && typeof p.match === 'string')
const isProbes = (v: unknown): boolean => v === undefined || (Array.isArray(v) && v.every(isProbe))
const fitErrors = (fit: unknown, file: string): string[] => !Array.isArray(fit)
  ? [`${file}: fit must be a list of rules`]
  : fit.flatMap((r, i) => !isObject(r) || typeof r.note !== 'string' || !isProbes(r.unless) || !isProbes(r.when) || (r.drop === true && typeof r.sensor !== 'string') || (r.cmd !== undefined && (typeof r.cmd !== 'string' || typeof r.sensor !== 'string'))
    ? [`${file}: fit rule ${i} needs a note, valid unless/when probes, and a sensor when it drops or swaps one`] : [])

// The registry rig init writes for a pack: everything but the markers.
export const packFile = (p: StackPack): Record<string, unknown> => ({ stack: p.stack, paths: p.paths, contracts: p.contracts, ...(p.holdout ? { holdout: p.holdout } : {}), sensors: p.sensors })
const registryText = (p: StackPack): string => JSON.stringify(packFile(p))

export function parsePack(text: string, file: string): { pack: StackPack | null; errors: string[] } {
  let v: unknown
  try { v = JSON.parse(text) } catch (e) { return { pack: null, errors: [`${file} does not parse: ${(e as Error).message}`] } }
  if (!isObject(v)) return { pack: null, errors: [`${file} must be a JSON object`] }
  const errors: string[] = []
  const name = path.basename(file, '.json')
  if (v.stack !== name) errors.push(`${file}: stack "${String(v.stack)}" does not match file ${file}`)
  if (!isStringList(v.markers) || !v.markers.length) errors.push(`${file}: markers must be a non-empty list of file names or globs`)
  if ('holdout' in v && typeof v.holdout !== 'string') errors.push(`${file}: holdout must be a string`)
  if (!Array.isArray(v.sensors)) errors.push(`${file}: sensors must be a list`)
  else if (v.sensors.some(s => isObject(s) && s.builtin === true)) errors.push(`${file}: packs declare no built-in sensors`)
  if ('fit' in v) errors.push(...fitErrors(v.fit, file))
  for (const k of Object.keys(v)) if (!PACK_KEYS.includes(k)) errors.push(`${file}: unknown key "${k}"`)
  if (errors.length) return { pack: null, errors }
  const pack: StackPack = {
    stack: name,
    markers: v.markers as string[],
    paths: isObject(v.paths) ? (v.paths as Partial<Paths>) : {},
    contracts: isObject(v.contracts) ? { covers: [], ...(v.contracts as Partial<Contracts>) } as Contracts : { files: [], covers: [], validate: '', run: '' },
    holdout: typeof v.holdout === 'string' ? v.holdout : '',
    sensors: v.sensors as unknown[],
    fit: (v.fit ?? []) as FitRule[],
  }
  const parsed = parseRegistry(registryText(pack))
  if (parsed.errors.length) return { pack: null, errors: parsed.errors.map(e => `${file}: ${e}`) }
  return { pack, errors: [] }
}

export function loadPacks(dir: string): { packs: StackPack[]; errors: string[] } {
  const packs: StackPack[] = []
  const errors: string[] = []
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const r = parsePack(fs.readFileSync(path.join(dir, f), 'utf8'), f)
    if (r.pack) packs.push(r.pack)
    errors.push(...r.errors)
  }
  return { packs, errors }
}

export function detectStacks(root: string, packs: StackPack[]): string[] {
  const entries = fs.existsSync(root) ? fs.readdirSync(root) : []
  const has = (m: string): boolean => (m.includes('*') ? entries.some(e => globToRegex(m).test(e)) : entries.includes(m))
  return packs.filter(p => p.markers.some(has)).map(p => p.stack)
}

export const packRegistry = (p: StackPack): Registry => parseRegistry(registryText(p)).registry
