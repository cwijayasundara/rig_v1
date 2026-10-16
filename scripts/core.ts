// sdlc core: paths, helpers and change state shared by every script. Zero dependencies.
// Only erasable TypeScript syntax is used (no enums, namespaces or parameter properties).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { globToRegex, SECRET_PATTERNS } from './model.ts'

export { globToRegex }

// ---------- types ----------

export type Fields = Record<string, string>

export type Args = { pos: string[]; opt: Record<string, string | true> }
export type HookInput = {
  session_id?: string
  cwd?: string
  agent_id?: string
  agent_type?: string
  source?: string
  prompt?: string; transcript_path?: string; model?: string; to_model?: string; from_model?: string; tool_use_id?: string; tool_response?: { resolvedModel?: string; model?: string }
  tool_input?: {
    command?: string
    file_path?: string
    notebook_path?: string
    content?: string
    old_string?: string
    new_string?: string
    replace_all?: boolean
    edits?: { old_string?: string; new_string?: string; replace_all?: boolean }[]
    skill?: string
    args?: string; subagent_type?: string; model?: string
  }
}

// ---------- constants ----------

export const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()
export const SDLC = path.join(ROOT, '.rig')
export const CHANGES = path.join(SDLC, 'changes')

export const SOFT_HOOK_FAILURE = 'sdlc hook error (ignored)'

// ---------- small helpers ----------

export const exists = (p: string): boolean => fs.existsSync(p)
// Line endings are normalised so CRLF checkouts on Windows parse and digest the same as on macOS.
export const read = (p: string): string => (exists(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : '')
export const lines = (text: string): number => (text ? text.split('\n').length : 0)
export const sha = (text: string): string => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
export const now = (): string => new Date().toISOString()
export const toPosix = (p: string): string => p.replace(/\\/g, '/')
export const out = (text: string): void => {
  process.stdout.write(text.endsWith('\n') ? text : text + '\n')
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/
// A slug names a directory under .rig/changes: it must be a plain name of an existing change, never a path.
export function checkSlug(slug: string): string {
  if (!SLUG_RE.test(slug)) fail(`invalid change name ${slug}`)
  if (!fs.existsSync(path.join(CHANGES, slug))) fail(`no change named ${slug}`)
  return slug
}

export function fail(message: string, code = 1): never {
  process.stderr.write(message + '\n')
  process.exit(code)
}

// A diff larger than the default 1 MB buffer must not turn into "no changes": allow 256 MB.
export function gitIn(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024, timeout: 120_000 }).trim()
  } catch {
    return null
  }
}
export const git = (args: string[]): string | null => gitIn(ROOT, args)

export function frontmatter(text: string): { data: Fields; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!m) return { data: {}, body: text }
  const data: Fields = {}
  for (const row of (m[1] ?? '').split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(row)
    if (kv?.[1]) data[kv[1]] = (kv[2] ?? '').replace(/^["']|["']$/g, '').trim()
  }
  return { data, body: text.slice(m[0].length) }
}

export function readJsonl<T>(p: string): T[] {
  return read(p)
    .split('\n')
    .filter(Boolean)
    .flatMap(row => {
      try {
        return [JSON.parse(row) as T]
      } catch {
        return []
      }
    })
}

export function parseArgs(argv: string[]): Args {
  const pos: string[] = []
  const opt: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? ''
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true
      else {
        opt[a.slice(2)] = next
        i++
      }
    } else pos.push(a)
  }
  return { pos, opt }
}

export const optString = (args: Args, key: string): string | undefined => {
  const v = args.opt[key]
  return typeof v === 'string' ? v : undefined
}
// ---------- changes ----------

export function listChanges(): string[] {
  if (!exists(CHANGES)) return []
  return fs
    .readdirSync(CHANGES, { withFileTypes: true })
    .filter(d => d.isDirectory() && SLUG_RE.test(d.name))
    .map(d => d.name)
}

// Paths are compared in POSIX form so plans written on macOS match edits made on Windows.
export function relPosix(file: string): string {
  return toPosix(path.isAbsolute(file) ? path.relative(ROOT, file) : file)
}

export function defaultBase(): string | null {
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  for (const ref of ['origin/main', 'main', 'origin/master', 'master']) {
    if (git(['rev-parse', '--verify', '--quiet', ref]) && head !== ref.replace('origin/', '')) return git(['merge-base', 'HEAD', ref])
  }
  return null
}

// ---------- secrets & plan quality ----------

export function scanSecrets(file: string): string[] {
  const text = read(file)
  if (!text || text.length > 2_000_000) return []
  const hits: string[] = []
  text.split('\n').forEach((row, i) => {
    for (const [name, re] of SECRET_PATTERNS) {
      if (re.test(row) && !/(?:rig|sdlc):allow-secret/.test(row)) hits.push(`${file}:${i + 1}: possible ${name}`)
    }
  })
  return hits
}

export const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..')
// A standalone repo runs its own copy from .rig/bin: its skills are named /rig:<name> as in the plugin, its agents rig-<name>.
export const IS_VENDORED = path.basename(import.meta.dirname) === 'bin'
export const skillRef = (name: string): string => `/rig:${name}`
// Managed settings (the platform team's, which no engineer can edit): the OS file plus managed-settings.d/ drop-ins in name order.
// Objects merge, arrays concatenate, later scalars win. RIG_MANAGED_DIR overrides the directory (tests). Server-managed settings are not visible here.
export const MANAGED_DIR = process.env.RIG_MANAGED_DIR || (process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode'
  : process.platform === 'win32' ? 'C:\\Program Files\\ClaudeCode' : '/etc/claude-code')
export function managedFiles(dir = MANAGED_DIR): string[] {
  const d = path.join(dir, 'managed-settings.d')
  let drops: string[] = []
  try { drops = fs.readdirSync(d).filter(f => f.endsWith('.json')).sort().map(f => path.join(d, f)) } catch { /* none, or unreadable */ }
  return [path.join(dir, 'managed-settings.json'), ...drops].filter(f => { try { JSON.parse(fs.readFileSync(f, 'utf8')); return true } catch { return false } })
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const deepMerge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => [k,
  isObj(a[k]) && isObj(b[k]) ? deepMerge(a[k], b[k]) : Array.isArray(a[k]) && Array.isArray(b[k]) ? [...a[k], ...b[k]] : k in b ? b[k] : a[k]]))
export const managedSettings = (dir = MANAGED_DIR): Record<string, unknown> =>
  managedFiles(dir).reduce<Record<string, unknown>>((acc, f) => { const v: unknown = JSON.parse(fs.readFileSync(f, 'utf8')); return isObj(v) ? deepMerge(acc, v) : acc }, {})

const GITIGNORED = [
  'state/', '.baseline', '.gate', 'unresolved.json', 'gates.jsonl', 'spend-cache.json', 'spend-fetched', 'budget-seen.json', '.onboarding', 'changes/*/prototype/',
]

// Parallel hooks (subagents) read-modify-write the same small state file: serialise them with a mkdir lock (stale after 10 s;
// after 5 s of waiting, proceed rather than wedge the hook) and write by rename so a reader never sees half a file.
export function withLock<T>(file: string, fn: () => T): T {
  const lock = `${file}.lock`
  const until = Date.now() + 5_000
  while (Date.now() < until) {
    try { fs.mkdirSync(lock); break } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) fs.rmSync(lock, { recursive: true, force: true }) } catch { /* raced */ }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  try { return fn() } finally { try { fs.rmdirSync(lock) } catch { /* not ours */ } }
}
export function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

export function ensureGitignore(): void {
  if (!exists(SDLC)) return
  const ignore = path.join(SDLC, '.gitignore')
  const have = new Set(read(ignore).split('\n').filter(Boolean))
  const missing = GITIGNORED.filter(f => !have.has(f))
  if (missing.length) fs.appendFileSync(ignore, missing.join('\n') + '\n')
}

export const WAIVERS = path.join(SDLC, 'waivers.jsonl')
export type Waiver = { slug: string; sensor: string; file: string; reason: string; by: string; at: string }

// Files sdlc itself wrote this turn count as sanctioned edits for the Stop gate's harness-tamper rule.
export function sanctionWrites(rels: string[]): void {
  const file = path.join(SDLC, '.gate')
  let gate: { tool?: string[] } = {}
  try {
    gate = JSON.parse(read(file)) as { tool?: string[] }
  } catch {
    gate = {}
  }
  gate.tool = [...new Set([...(gate.tool ?? []), ...rels.map(toPosix)])]
  fs.writeFileSync(file, JSON.stringify(gate))
}
