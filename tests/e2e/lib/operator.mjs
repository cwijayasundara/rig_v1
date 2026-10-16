// The operator: plays the human at every gate, in code. Reads only `next --json` and `status --json`, never prose.
const GATES = ['spec', 'plan', 'design', 'impact']

function json(sb, args) {
  const r = sb.sdlc(args)
  if (r.status !== 0) throw new Error(`sdlc ${args.join(' ')} exited ${r.status}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
  return JSON.parse(r.stdout)
}

// Appends the resolution the approval asks for to every unresolved policy concern line; returns how many.
const MAX_CONCERNS = 10
const MAX_APPROVALS = 3

function resolveConcerns(sb, rel, operator) {
  let n = 0
  const lines = []
  const text = sb.read(rel).split('\n').map(line => {
    if (!/^- \[policy-[^\]]+\]/.test(line) || line.includes('→ resolved:')) return line
    n++
    lines.push(line)
    return `${line} → resolved: accepted for the acceptance run (${operator})`
  }).join('\n')
  if (n === 0) throw new Error(`${rel}: approval asked for concern resolutions but no policy concern line was found`)
  if (n > MAX_CONCERNS) throw new Error(`${rel}: more than ${MAX_CONCERNS} policy concerns (${n}); a person must read this design`)
  sb.write(rel, text)
  return lines
}

export async function runRoute({ sb, slug, driver, operator = 'operator', maxSteps = 10, repeats = 1, expectGates }) {
  const approved = []
  const concernLines = []
  const attempts = new Map()
  const waived = new Set()
  let steps = 0
  for (;;) {
    const s = json(sb, ['next', slug, '--json'])
    if (s.verdict === 'ready' || s.verdict === 'done') return { steps, approved, resolvedConcerns: concernLines.length, concernLines, waived: [...waived], end: s.verdict }
    if (s.verdict === 'blocked') throw new Error(`${slug}: blocked: ${s.reason}`)
    if (s.verdict === 'human') {
      const st = json(sb, ['status', '--json']).changes.find(c => c.slug === slug)
      const gate = st?.next?.kind === 'approve' ? st.next.gate : undefined
      const allowed = expectGates ? expectGates(slug) : GATES
      if (!gate || !GATES.includes(gate) || !allowed.includes(gate)) {
        throw new Error(`${slug}: unexpected gate ${gate ?? s.reason} at node ${s.node} (allowed: ${allowed.join(', ')})`)
      }
      let r = sb.sdlc(['approve', slug, gate, '--by', operator], { human: true })
      // Approval refuses until a person resolves each policy concern the design lists: that is the human's job, so the operator does it.
      const refusal = `${r.stderr}\n${r.stdout}`
      if (r.status !== 0 && /resolve the concern/.test(refusal)) {
        const file = /in (\S+\.md) with/.exec(refusal)?.[1]
        if (!file) throw new Error(`approve ${gate} refused on concerns in an unknown file: ${refusal.trim().split('\n')[0]}`)
        if (file.includes('..') || file.startsWith('/')) throw new Error(`approve ${gate}: refusal names a file outside the change folder: ${file}`)
        concernLines.push(...resolveConcerns(sb, `.rig/changes/${file}`, operator))
        r = sb.sdlc(['approve', slug, gate, '--by', operator], { human: true })
      }
      if (r.status !== 0) throw new Error(`approve ${gate} failed: ${(r.stderr || r.stdout).trim()}`)
      approved.push(gate)
      const times = approved.filter(g => g === gate).length
      if (times > MAX_APPROVALS) throw new Error(`${slug}: approved ${gate} ${times} times and next still asks for a human`)
      continue
    }
    // A ship gate that refused only on diff size names `/rig:waive size * <reason>`: the person reads the diff and accepts it, once.
    // No other sensor is waived here: a secret, tamper or scope block stays a failure of the run.
    if (/pending block:[\s\S]*\/rig:waive size \* <reason>/.test(s.reason) && !/\/rig:waive (?!size )/.test(s.reason) && !waived.has(s.node)) {
      const w = sb.sdlc(['waive', 'size', '*', `diff read by the ${operator}: one change by design`, '--slug', slug], { human: true })
      if (w.status !== 0) throw new Error(`waive size failed: ${(w.stderr || w.stdout).trim()}`)
      waived.add(s.node)
    }
    const key = `${s.node}:${s.round}`
    // `repeats` is how many sessions one node may take before it counts as no progress (a live node can need a second one).
    if ((attempts.get(key) ?? 0) >= repeats) throw new Error(`${slug}: no progress at ${s.node} (round ${s.round})`)
    if (++steps > maxSteps) throw new Error(`${slug}: more than ${maxSteps} steps`)
    await driver.step(s.node, { slug, round: s.round })
    attempts.set(key, (attempts.get(key) ?? 0) + 1)
  }
}

// The person at the sprint chart gate, in code: resolves each unresolved `## Concerns` bullet in the files the
// refusal names (at most 10; more means a person must read it), then approves chart-<n> and commits the row.
function resolveChartConcerns(sb, refusal) {
  const files = [...new Set([...refusal.matchAll(/^ {2}- (\.rig\/[^:]+\.md): /gm)].map(m => m[1]))]
  const lines = []
  for (const rel of files) {
    let inside = false
    sb.write(rel, sb.read(rel).split('\n').map(line => {
      if (/^#{2,3} /.test(line)) inside = /^#{2,3}\s+Concerns\b/.test(line)
      if (!inside || !/^\s*[-*] /.test(line) || line.includes('resolved:') || /^\s*[-*]\s+none\.?$/i.test(line)) return line
      lines.push(`${rel}: ${line.trim()}`)
      return `${line} → resolved: accepted for the acceptance run (operator)`
    }).join('\n'))
  }
  if (!lines.length) throw new Error(`chart approval refused on concerns but none was found to resolve: ${refusal.split('\n')[0]}`)
  if (lines.length > MAX_CONCERNS) throw new Error(`more than ${MAX_CONCERNS} chart concerns (${lines.length}); a person must read this chart`)
  return lines
}

export function approveChart(sb, n) {
  const run = () => sb.sdlc(['approve', `chart-${n}`, '--by', 'operator'], { human: true })
  let r = run()
  if (r.status !== 0 && /resolve the concern/.test(r.stderr)) {
    resolveChartConcerns(sb, r.stderr)
    r = run()
  }
  if (r.status !== 0) throw new Error(`approve chart-${n}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
  sb.commitAll(`chart: approve sprint ${n}`)
  return r.stdout
}
