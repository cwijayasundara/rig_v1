// `sdlc.ts brain-source`: where /rig:init --quick points the project's rig-brain entry, found without asking. Claude
// Code lists every registered marketplace in ~/.claude/plugins/known_marketplaces.json; the one whose own marketplace.json
// lists rig-brain is the source. Read-only: user settings are never written (rig-brain is enabled per project only).
// A shareable source (github, git) wins over a url, and both over a local directory or file, which would not resolve on a
// teammate's machine.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PLUGIN_ROOT, out } from './core.ts'

export type BrainSource =
  | { marketplace: string; source: Record<string, unknown>; brainDir: string | null }
  | { error: string }

const readJson = (file: string): unknown => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return undefined }
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// The brain/ the init skill seeds from: the running plugin's own copy (rig ships with source "./", so it includes brain/),
// else the directory source's.
const brainIn = (dir: unknown): string | null =>
  typeof dir === 'string' && fs.existsSync(path.join(dir, 'brain', 'code_wiki', 'wiki.ts')) ? path.join(dir, 'brain') : null

const RANK: Record<string, number> = { github: 0, git: 0, url: 1 }
const rank = (source: Record<string, unknown>): number => RANK[String(source.source)] ?? 2

// configDir is Claude Code's config directory: CLAUDE_CONFIG_DIR when set, else ~/.claude.
export function resolveBrainSource(configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), pluginRoot = PLUGIN_ROOT): BrainSource {
  const registry = path.join(configDir, 'plugins', 'known_marketplaces.json')
  const known = readJson(registry)
  if (!isObject(known)) return { error: `no readable ${registry}; register rig's marketplace first` }
  const found: { marketplace: string; source: Record<string, unknown> }[] = []
  for (const entry of Object.values(known)) {
    if (!isObject(entry) || !isObject(entry.source) || typeof entry.installLocation !== 'string') continue
    const manifest = readJson(path.join(entry.installLocation, '.claude-plugin', 'marketplace.json'))
    if (!isObject(manifest) || typeof manifest.name !== 'string' || !Array.isArray(manifest.plugins)) continue
    if (manifest.plugins.some(p => isObject(p) && p.name === 'rig-brain')) found.push({ marketplace: manifest.name, source: entry.source })
  }
  if (!found.length) return { error: 'no registered marketplace lists rig-brain' }
  const pick = [...found].sort((a, b) => rank(a.source) - rank(b.source))[0]!
  return { ...pick, brainDir: brainIn(pluginRoot) ?? (pick.source.source === 'directory' ? brainIn(pick.source.path) : null) }
}

export function cmdBrainSource(): void {
  out(JSON.stringify(resolveBrainSource()))
}
