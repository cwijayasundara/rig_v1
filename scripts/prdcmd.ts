// The `prd` subcommands that read the sprint folder and print: the proposed table, the coverage check and the client-gaps document.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, read, exists, out, fail, toPosix } from './core.ts'
import { prdPath, sourcePath, coveragePath, gapsPath, sprintRel } from './product.ts'
import { prdProposed, prdCriteria, prdOrigins, type ProposedMore } from './prdformat.ts'
import { coverageProblems, clientGaps } from './prdcoverage.ts'
import { conversionMapOf, intentsOf, designFile, adrFilesOf } from './chart.ts'

const MARK = /\((?:proposed|default|decided) at chart\)/i
// What rests on a value nobody at the client said: behaviours with the marker or citing a proposed line, and the design doc's and this sprint's
// ADRs' marked decisions.
function proposedMore(n: number, prd: string, map: string | null): ProposedMore {
  const origins = prdOrigins(prd, map)
  const proposed = new Set(prdCriteria(prd).filter(c => origins.get(c.id) === 'proposed' || origins.get(c.id) === 'unattributed').map(c => c.id))
  const behaviours = intentsOf(n).flatMap(i => i.behaviours.flatMap(b => {
    const via = [...new Set([...b.rules, ...b.reqs].filter(id => proposed.has(id)))]
    return b.proposed || via.length ? [{ where: `${i.slug}#${b.id}`, why: [b.proposed && 'marked', via.length && `cites ${via.join(', ')}`].filter(Boolean).join(', '), text: b.text }] : []
  }))
  const files = [...designFile(n), ...adrFilesOf(n)].filter(exists)
  const decisions = files.flatMap(f => read(f).split('\n').flatMap((l, k) => MARK.test(l) ? [{ where: `${toPosix(path.relative(ROOT, f))}:${k + 1}`, text: l.replace(MARK, '').replace(/\s+([.,;])/g, '$1').replace(/^[\s>*-]+/, '').trim() }] : []))
  return { behaviours, decisions }
}

export function cmdPrdMore(sub: string, n: number, json: boolean): void {
  if (sub === 'proposed') return out(prdProposed(n, read(prdPath(n)), conversionMapOf(n), proposedMore(n, read(prdPath(n)), conversionMapOf(n))))  // the lines nobody at the client said, for the one review
  if (!exists(sourcePath(n))) fail(`sprint ${n} has no source.md: the chart copies the person's PRD there first`)
  if (sub === 'gaps') {
    if (!exists(coveragePath(n))) fail(`sprint ${n} has no coverage.md: write it from source.md first (templates/prd-topics.md)`)
    fs.writeFileSync(gapsPath(n), clientGaps(read(coveragePath(n))))
    return out(`wrote ${sprintRel(n)}/client-gaps.md: the topics the PRD does not say anything about, to send back to the client`)
  }
  const found = coverageProblems({ source: read(sourcePath(n)), prd: read(prdPath(n)), coverage: exists(coveragePath(n)) ? read(coveragePath(n)) : null })
  if (json) return out(JSON.stringify(found))
  out([...found.map(f => `[${f.rule}] ${f.where}: ${f.message}`), `prd-${n}: ${found.length ? `${found.length} coverage finding(s)` : 'coverage complete'}`].join('\n'))
}
