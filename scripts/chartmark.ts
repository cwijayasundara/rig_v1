// Bookkeeping the chart writes into its own files: `chart finding` marks review findings, `chart answer` moves an open question to ## Resolved.
import path from 'node:path'
import { read, out, fail, whoami, writeAtomic, exists } from './core.ts'
import { parseReview, SUFFIX } from './chartcheck.ts'
import { chartOpenFindings } from './chart.ts'
import { archPath, intentsDir, reviewPath } from './product.ts'

const USAGE_FINDING = 'usage: chart finding <sprint> <numbers: 3 | 1,3,5 | 1-8> <fixed|confirmed|reopened> ["why"]  (why is required for reopened)'
const USAGE_ANSWER = 'usage: chart answer <sprint> <intent-slug|architecture> <Qn> "<answer>" [--proposed]'
const NO_NAME = 'no identity; set git user.name (git config user.name "<name>")'

export function cmdWhoami(): void { out(whoami() ?? fail(`whoami: ${NO_NAME}`)) }

function numbersOf(spec: string, max: number): number[] {
  const picked = new Set<number>()
  for (const part of spec.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!m) fail(`not a finding number: "${part}". ${USAGE_FINDING}`)
    const a = Number(m[1]), b = Number(m[2] ?? m[1])
    if (a < 1 || b < a || b > max) fail(`chart-review.md has ${max} finding(s); ${part} is not among them`)
    for (let k = a; k <= b; k++) picked.add(k)
  }
  return [...picked].sort((x, y) => x - y)
}

// chart finding <N> <numbers> <fixed|confirmed|reopened> ["why"]: the finding's text before the suffix is left byte for byte (a waiver pins its sha).
function markFindings(n: number, pos: string[]): void {
  const [spec, status, ...why] = pos, reason = why.join(' ').replace(/\s+/g, ' ').trim()
  if (!spec || !['fixed', 'confirmed', 'reopened'].includes(status ?? '')) fail(USAGE_FINDING)
  if (status === 'reopened' && !reason) fail(`reopened needs a reason. ${USAGE_FINDING}`)
  if (!exists(reviewPath(n))) fail(`chart-${n} has no chart-review.md: nothing to mark`)
  const text = read(reviewPath(n)), before = parseReview(text), picked = new Set(numbersOf(spec, before.length))
  const suffix = status === 'fixed' ? ' → fixed' : status === 'confirmed' ? ' → fixed (confirmed)' : ` → reopened: ${reason}`
  let inside = false, k = 0
  const next = text.split('\n').map(line => {
    if (/^##\s/.test(line)) { inside = /^##\s+Findings\s*$/.test(line); return line }
    return !inside || !/^[-*]\s+\S|^\d+[.)]\s+\S/.test(line) || !picked.has(++k) ? line : line.replace(SUFFIX, '') + suffix
  }).join('\n')
  if (parseReview(next).some((f, i) => f.sha !== before[i]?.sha || f.n !== before[i]?.n)) fail('chart finding: a finding\'s text would change; nothing was written')
  writeAtomic(reviewPath(n), next)
  const verdict = (chartOpenFindings(n) ?? []).length ? 'changes-needed' : 'pass'
  const rest = next.split('\n')
  if (/^verdict:/i.test(rest[0] ?? '')) rest[0] = `verdict: ${verdict}`; else rest.unshift(`verdict: ${verdict}`)
  writeAtomic(reviewPath(n), rest.join('\n'))
  out([...[...picked].map(i => `finding ${i}: ${suffix.slice(3)}`), `verdict: ${verdict}`].join('\n'))
}

// chart answer <N> <intent-slug|architecture> <Qn> "<answer>" [--proposed]
function answerQuestion(n: number, pos: string[], proposed: boolean): void {
  const [target, q, ...words] = pos, answer = words.join(' ').replace(/\s+/g, ' ').trim()
  if (!target || !/^Q\d+$/.test(q ?? '') || !answer) fail(USAGE_ANSWER)
  const who = proposed ? null : whoami()
  if (!proposed && !who) fail(`chart answer: ${NO_NAME} or pass --proposed`)
  const file = target === 'architecture' ? archPath : path.join(intentsDir(n), `${target.replace(/\.md$/, '')}.md`)
  if (!exists(file)) fail(`chart answer: ${path.relative(process.cwd(), file)} does not exist`)
  const lines = read(file).split('\n')
  const head = lines.findIndex(l => /^##\s+Open questions\s*$/.test(l))
  const end = head < 0 ? -1 : lines.findIndex((l, i) => i > head && /^##\s/.test(l)), stop = head < 0 ? -1 : end < 0 ? lines.length : end
  const at = head < 0 ? -1 : lines.findIndex((l, i) => i > head && i < stop && new RegExp(`^\\s*[-*]\\s*\\**${q}\\b`).test(l))
  if (at < 0) fail(`chart answer: no "- ${q}" bullet under ## Open questions in ${target}`)
  let last = at + 1; while (last < stop && /^\s+\S/.test(lines[last] ?? '')) last++ // its indented continuation lines go with it
  lines.splice(at, last - at)
  if (!lines.slice(head + 1, stop - (last - at)).some(l => /^\s*[-*]\s+\S/.test(l))) lines.splice(at, 0, 'none')
  const row = `- ${q}: ${answer} ${proposed ? '(proposed at chart)' : `(confirmed at chart by ${who})`}`
  const r = lines.findIndex(l => /^##\s+Resolved\s*$/.test(l))
  let e = r < 0 ? lines.length : lines.findIndex((l, i) => i > r && /^##\s/.test(l)); if (e < 0) e = lines.length
  while (e > r + 1 && e > 0 && !lines[e - 1]!.trim()) e--
  if (r < 0) lines.length = e
  lines.splice(e, 0, ...(r < 0 ? ['', '## Resolved', '', row, ''] : [row]))
  writeAtomic(file, lines.join('\n'))
  out(`${target}: ${q} resolved${proposed ? ' (proposed)' : ` by ${who}`}`)
}

export function cmdChartMark(sub: string, pos: string[], opt: Record<string, string | true>): void {
  const [num, ...rest] = pos
  if (!/^\d{1,4}$/.test(num ?? '')) fail(sub === 'finding' ? USAGE_FINDING : USAGE_ANSWER)
  return sub === 'finding' ? markFindings(Number(num), rest) : answerQuestion(Number(num), rest, Boolean(opt.proposed))
}
