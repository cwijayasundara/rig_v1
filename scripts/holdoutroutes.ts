// A holdout test runs while its own intent is built, so it can only call routes its intent or that intent's depends provide.
// Pure over text: the holdout files, the OpenAPI contracts the intents name and the intents; no repo, no model.
import type { Intent, TestCase, ChartFinding } from './chartcheck.ts'

type Op = { method: string; path: string; prefix: boolean }
const HOLE = /\$?\{[^}]*\}/g
const segs = (p: string): string[] => p.replace(HOLE, '{}').split('/').filter(Boolean)
const METHOD = '(get|post|put|patch|delete)'

// The HTTP operations a test file calls: .get("/x"), .post('/x'), .delete(`/x`) and "DELETE /x" or "curl -X DELETE http://h/x".
// A literal ending in "/" followed by a concatenation is a prefix.
export function calledOps(text: string): Op[] {
  const out: Op[] = []
  const add = (method: string, raw: string, prefix: boolean): void => {
    const p = raw.split(/[?#]/)[0]!
    if (p.startsWith('/')) out.push({ method: method.toUpperCase(), path: p, prefix: prefix && p.endsWith('/') })
  }
  for (const m of text.matchAll(new RegExp(`\\.${METHOD}\\(\\s*[fbr]?(["'\`])(/[^"'\`]*)\\2(\\s*\\+)?`, 'gi'))) add(m[1]!, m[3]!, Boolean(m[4]))
  for (const m of text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(?:https?:\/\/[^/\s"'`]+|\$\{?\w+\}?)?(\/[^\s"'`]*)/g)) add(m[1]!, m[2]!, false)
  return out
}

// The operations an OpenAPI file declares: each key under "paths:" and the method keys under it (a small line reader, no YAML).
export function contractOps(yaml: string): Op[] {
  const out: Op[] = []
  let inPaths = false, cur: string | null = null
  for (const l of yaml.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\S/.test(l)) { inPaths = /^paths:/.test(l); cur = null; continue }
    if (!inPaths) continue
    const p = /^ {1,4}["']?(\/[^"':\s]*)["']?\s*:/.exec(l)
    if (p) { cur = p[1]!; continue }
    const m = cur && new RegExp(`^ {2,8}${METHOD}\\s*:`, 'i').exec(l)
    if (m && cur) out.push({ method: m[1]!.toUpperCase(), path: cur, prefix: false })
  }
  return out
}

// A templated segment matches anything; a prefix call matches every route that starts with its segments.
const matches = (call: Op, own: Op): boolean => {
  if (call.method !== own.method) return false
  const a = segs(call.path), b = segs(own.path)
  if (call.prefix ? a.length >= b.length : a.length !== b.length) return false
  return a.every((s, i) => s === '{}' || b[i] === '{}' || s === b[i])
}

export function holdoutRouteProblems(i: { intents: Intent[]; cases: TestCase[]; files: { name: string; id: string; text: string }[]; contracts: Record<string, string> }): ChartFinding[] {
  const ops = new Map(i.intents.map(t => [t.slug, t.contractFiles.flatMap(f => contractOps(i.contracts[f] ?? ''))]))
  const allowed = (slug: string): Set<string> => {
    const seen = new Set([slug])
    for (const s of seen) for (const d of i.intents.find(t => t.slug === s)?.depends ?? []) seen.add(d)
    return seen
  }
  const out: ChartFinding[] = []
  for (const f of i.files) {
    const c = i.cases.find(t => t.id === f.id)
    if (!c || !ops.has(c.intent)) continue
    const ok = allowed(c.intent)
    const seen = new Set<string>()
    for (const call of calledOps(f.text)) {
      const owners = [...ops].filter(([, list]) => list.some(o => matches(call, o)))
      if (!owners.length || owners.some(([s]) => ok.has(s))) continue
      const key = `${call.method} ${call.path}`
      if (seen.has(key)) continue
      seen.add(key)
      const owner = owners[0]![0]
      out.push({ rule: 'holdout-route', severity: 'block', where: c.id, message: `${c.id} (${c.intent}) calls ${call.method} ${call.path}, which ${owner} owns and ${c.intent} does not depend on: observe it through ${c.intent}'s own interface, or move the case to ${owner}` })
    }
  }
  return out
}
