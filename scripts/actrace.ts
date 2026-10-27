// AC -> test link (shop_app 2026-10-27): the table that mapped an acceptance criterion to its test was kept by hand in the target
// and drifted. A change started from an intent ships only when each AC-n.m its behaviours cite is named by a test file.
import { ROOT, read, git } from './core.ts'
import { isTest } from './model.ts'
import type { Paths } from './registry.ts'
import { intentOf } from './chart.ts'

const AC_RE = /\bAC-\d+\.\d+\b/g
const AC_ID = /^AC-(\d+)\.(\d+)$/

// Each "B<n> AC-x.y" cited by the intent's behaviours that no test file names (as AC-x.y or ac_x_y, any case).
export function untestedAcs(slug: string, paths: Paths): string[] {
  const intent = intentOf(slug)
  if (!intent || !paths.tests.length) return []
  const cited = intent.behaviours.flatMap(b => [...new Set(`${b.rules.join(' ')} ${b.text}`.match(AC_RE) ?? [])].map(ac => ({ b: b.id, ac })))
  if (!cited.length) return []
  const files = [...new Set([...(git(['ls-files']) ?? '').split('\n'), ...(git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n')])].filter(f => f && isTest(f, paths))
  const text = files.map(f => { try { return read(`${ROOT}/${f}`) } catch { return '' } }).join('\n').toLowerCase()
  return cited.filter(({ ac }) => { const m = AC_ID.exec(ac); return !text.includes(ac.toLowerCase()) && !text.includes(`ac_${m?.[1]}_${m?.[2]}`) }).map(({ b, ac }) => `${b} ${ac}`)
}
