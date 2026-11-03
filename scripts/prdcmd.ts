// The `prd` subcommands that read the sprint folder and print: the proposed table, the coverage check and the client-gaps document.
import fs from 'node:fs'
import { read, exists, out, fail } from './core.ts'
import { prdPath, sourcePath, coveragePath, gapsPath, sprintRel } from './product.ts'
import { prdProposed } from './prdformat.ts'
import { coverageProblems, clientGaps } from './prdcoverage.ts'
import { conversionMapOf } from './chart.ts'

export function cmdPrdMore(sub: string, n: number, json: boolean): void {
  if (sub === 'proposed') return out(prdProposed(n, read(prdPath(n)), conversionMapOf(n)))  // the lines nobody at the client said, for the one review
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
