// The PR body (proposal 2026-10-25 A1): what a reviewer needs before reading the diff. Built from the change's own files, no model
// call; the pr skill adds the part that takes judgement (special things to note, the change outline) as pr-outline.md.
import { section, blastRadius, bullets, type FileDiff } from './model.ts'
import { defaultRegistry, type Paths } from './registry.ts'
import { clean, ROOT, SENSORS_JSON, read } from './core.ts'
import type { Risk } from './risk.ts'
import type { RunRow } from './runs.ts'
import { behaviourIds, missingBehaviours, NOT_RUN_HERE } from './sensors.ts'
import { sensorCites } from './sensorcite.ts'
import { parseRegistry, type RegistrySensor } from './registry.ts'
import path from 'node:path'
import { parseFindings, type ClaimRow } from './claims.ts'
import { parseLedger } from './chartcheck.ts'
import type { FreezeRow } from './testfreeze.ts'
import { checkQuestions, isSrc } from './prcheck.ts'
import { outsideRadius, type Dependents } from './dependents.ts'
import { isTest } from './model.ts'
import type { AgentRow } from './agents.ts'

type PrBodyInput = { interrogate?: { line: string; reproduced: string[] }; dependents?: Dependents; links?: string[]; differential?: { line: string; unapproved: string[] }; paths?: Paths; requirements?: string; claims?: ClaimRow[]; intent: string; spec: string; plan: string; verify: { pass: boolean; tree: string | null; blocks: string[]; from?: string; holdout?: { passed: number; total: number } } | null; outline: string; review: string; risk: Risk; amendments?: string; runs?: RunRow[]; tests?: string; intentMap?: string; freeze?: FreezeRow[]; changes?: FileDiff[]; agents?: AgentRow[]; draft?: string; planChanges?: string[]; chart?: string; waivers?: string[]; proof?: { ids: string[]; exempt: string | null }; sensors?: RegistrySensor[] }

const firstSentence = (text: string): string => /^[\s\S]*?[.!?](?=\s|$)/.exec(text.trim())?.[0].replace(/\s+/g, ' ') ?? text.trim().replace(/\s+/g, ' ')

// One-way when the plan edits a contract file (they freeze at approval), else two-way: reverting the merge undoes it.
const contracts = (plan: string): string[] => bullets(section(plan, 'Contracts')).map(l => l.replace(/^[-*]\s+/, '').replace(/`/g, ''))

function door(plan: string): string {
  const c = contracts(plan)
  return c.length ? `one-way (contracts: ${c.join(', ')})` : 'two-way'
}

function revert(plan: string): string {
  const c = contracts(plan)
  return c.length
    ? `Reverting the code does not undo the contract change to ${c.join(', ')}: ship the previous contract as a new change (expand–migrate–contract).`
    : 'Revert the change: `git revert <sha>` for a plain commit on the trunk, or `git revert -m 1 <merge sha>` for a merge commit.'
}

// Evidence, not claims (proposal 2026-10-29 item 2): what the latest verify's recorded runs show (evidence/runs.jsonl), never the model.
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/g, '').trim()
const FAIL_LINE = /\bFAIL(ED)?\b|\bError\b|error:|error\[|✖|not ok|assert|Interrupted|panicked/i
// A red that is only a missing import, a missing symbol or a collection error shows the tests need new code, not which
// behaviour fails without it. A file that fails to load prints ✖ / not ok too, so those never count as an assertion.
const COLLECTION = /error during collection|ModuleNotFoundError|ImportError|Cannot find module|ERR_MODULE_NOT_FOUND|does not provide an export named|Failed to load url|has no exported member|Test suite failed to run|cannot find symbol|cannot find (function|value|type|package)|undefined: \w|unresolved import|could not compile|\[build failed\]|error CS0103|error CS0246|does not exist in the current context/i
const ASSERTION = /AssertionError|\bassert(ion)?\b|expected:|Expected:|toBe|toEqual|but was|--- FAIL/
// A fence longer than any backtick run in the text, so a test's output never closes it.
const fenced = (lines: string[]): string => { const f = '`'.repeat(Math.max(3, ...lines.map(l => Math.max(0, ...(l.match(/`+/g) ?? []).map(m => m.length + 1))))); return `${f}\n${lines.join('\n')}\n${f}` }
const span = (t: string): string => `\`${t.replace(/`/g, "'")}\``

function baseProof(runs: RunRow[]): string {
  const red = runs.findLast(r => r.expectFail && r.source === 'ship')
  const green = runs.filter(r => r.sensor === 'red-proof' && r.cwd && !r.expectFail).at(-1)
  if (!red) return green ? `Green proof (refactor): the change's tests ran on the base code and ${green.exit === 0 ? 'passed' : `failed (exit ${green.exit})`}, ${span(green.cmd)}.` : 'Red proof: no run of the new tests on the base code is recorded.'
  const tail = red.tail.split('\n').map(plain).filter(Boolean)
  if (red.exit === 0) return `Red proof: none. The new tests passed on the base code (${span(red.cmd)}), and verify passed only because red-proof was waived.`
  const hits = tail.filter(l => FAIL_LINE.test(l)).slice(-6)
  const weak = COLLECTION.test(red.tail) && !ASSERTION.test(red.tail)
    ? '\n\nWeak red: the tests failed on a missing import, a missing symbol or a collection error, not an assertion. It shows they need the new code, not which behaviour fails without it.' : ''
  return `Red proof: the change's tests ran on the base code and failed (exit ${red.exit}, ${span(red.cmd)}):\n\n${fenced((hits.length ? hits : tail.slice(-3)).map(l => l.slice(0, 200)))}${weak}`
}

// The latest run of each check on the head tree (a base-tree run has a cwd), in the order they first ran.
function headChecks(runs: RunRow[]): string {
  const last = new Map<string, RunRow>()
  for (const r of runs) if (r.source === 'ship' && !r.cwd && !r.expectFail) last.set(r.sensor ?? r.cmd, r)
  if (!last.size) return ''
  const line = (name: string, r: RunRow): string => { const end = (r.tail.split('\n').map(plain).filter(Boolean).at(-1) ?? '').slice(0, 120); return `- ${name.length > 60 ? `${name.slice(0, 57)}...` : name}: ${r.exit === 0 ? (NOT_RUN_HERE.test(r.tail) ? 'not run here' : 'pass') : `fail (exit ${r.exit})`}${end ? `, ${span(end)}` : ''}` }
  return `Checks on the head tree (the latest verify's run of each):\n\n${[...last].map(([n, r]) => line(n, r)).join('\n')}`
}

// The score the latest mutation-diff run printed (mutscore's summary line), or that it found no mutants; nothing when it did not run.
const mutationNote = (runs: RunRow[]): string => { const t = runs.findLast(x => x.sensor === 'mutation-diff' && x.source === 'ship' && !x.cwd)?.tail ?? '', m = /mutation: (\d+)\/(\d+) killed on changed lines \(score ([\d.]+)/.exec(t); return m ? `Mutation: ${m[1]}/${m[2]} on changed lines (score ${m[3]})` : /mutation: no mutants on changed lines/.test(t) ? 'Mutation: no mutants on changed lines' : '' }

// The behaviours no test the change adds or edits names, by the traceability sensor's own rule.
// A behaviour cited [sensor: ...] (sensorcite.ts) is traced by those sensors; the registry is read from disk when the caller gives none.
function behaviourTests(spec: string, tests: string | undefined, sensors?: RegistrySensor[]): string {
  const ids = behaviourIds(spec, 'Behaviours')
  if (!ids.length || tests === undefined) return ''
  const traced = sensorCites(spec, sensors ?? parseRegistry(read(path.join(ROOT, SENSORS_JSON))).registry.sensors).traced
  const none = missingBehaviours(ids.filter(id => !traced.includes(id)), tests)
  return none.length ? `No test this change adds or edits names ${none.join(', ')}: check those behaviours by hand.` : `Every behaviour (${ids.join(', ')}) is named by a test this change adds or edits${traced.length ? ` or traced by a blocking sensor (${traced.join(', ')})` : ''}.`
}

// Suggestions only (claims.ts): how many findings carry a Repro, and each row that asks for a second look.
function claimsNote(review: string, claims: ClaimRow[] | undefined): string {
  if (!claims) return ''
  const found = parseFindings(review), suggest = claims.filter(c => c.status === 'suggest')
  if (!found.length && !suggest.length) return ''
  return [`Claims: ${found.length} finding(s), ${found.filter(f => f.repro).length} with a Repro.`, ...suggest.map(c => `- ${c.rule}: ${c.detail}`)].join('\n')
}

// Behaviours of the change that rest on a value nobody at the client said: the marker on the behaviour, or a cited proposed ledger row.
function proposedNote(spec: string, requirements: string | undefined): string {
  if (!requirements) return ''
  const proposed = parseLedger(requirements).filter(r => r.origin === 'proposed' || r.origin === 'unattributed')
  const rows = bullets(section(spec, 'Behaviours')).flatMap(l => {
    const id = /\bB\d+\b/.exec(l)?.[0]
    const via = proposed.filter(r => new RegExp(`\\b${r.id.replace(/[.]/g, '\\.')}\\b`).test(l) || (r.alias !== null && new RegExp(`\\b${r.alias.replace(/[.]/g, '\\.')}\\b`).test(l))).map(r => r.alias ?? r.id)
    return id && (/\((?:proposed|default|decided) at (?:chart|start)\)/i.test(l) || via.length) ? [`${id}${via.length ? ` (cites ${via.join(', ')})` : ' (marked)'}`] : []
  })
  return rows.length ? `Rests on values nobody at the client said: ${rows.join(', ')}. Ask the owner to confirm them before merging.` : ''
}

// The test writer's hand-off: when the tests were frozen and why each later freeze changed a frozen test.
const frozenNote = (rows: FreezeRow[] = []): string => rows.length ? [`Tests frozen at ${rows[0]?.commit.slice(0, 7)} by the test writer`, ...rows.slice(1).map(r => `re-frozen: ${clean(r.why)}${r.dropped?.length ? ` (dropped: ${r.dropped.map(clean).join(', ')})` : ''}`)].join('\n') : 'Tests not frozen (no test-writer hand-off)'

// N5/N6: what each agent reported and what it cost; an agent that ended without a status line is "no report", never BLOCKED.
const agentsNote = (rows: AgentRow[] = []): string => {
  if (!rows.length) return ''
  const sum = (k: 'tokens' | 'ms'): number => rows.reduce((t, r) => t + (r[k] ?? 0), 0), unknown = rows.some(r => r.tokens === null || r.ms === null)
  const line = (r: AgentRow): string => `- ${r.agent} on ${r.model ?? 'unknown model'}: ${r.status ?? 'no report'}, ${r.tokens ?? '?'} tokens, ${r.toolUses ?? '?'} tool uses, ${r.ms === null ? '?' : (r.ms / 60000).toFixed(1)} min`
  return `## Agents\n\n${rows.map(line).join('\n')}\n\nTotal: ${rows.length} launches, ${sum('tokens')} tokens, ${(sum('ms') / 60000).toFixed(1)} min${unknown ? ' (some unknown)' : ''}`
}

// Files in the order to read them: contracts, then source, tests, other; mechanical edits (lockfiles, snapshots, generated, renames, binaries) last. Larger first within a class.
const MECHANICAL = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum)$|\.snap$|(^|\/)(dist|build|generated|__snapshots__)\//
function readOrder(diffs: FileDiff[], plan: string, paths?: Paths): string[] {
  const c = contracts(plan)
  const rank = (d: FileDiff): number => d.binary || d.oversize || d.status === 'R' || MECHANICAL.test(d.file) ? 4 : c.includes(d.file) ? 0 : isSrc(d.file, paths) ? 1 : isTest(d.file, paths ?? defaultRegistry().paths) ? 2 : 3
  const size = (d: FileDiff): number => d.added.length + d.removed.length
  return [...diffs].sort((a, b) => rank(a) - rank(b) || size(b) - size(a) || (a.file < b.file ? -1 : 1)).map(d => `${d.file} (${['contract', 'source', 'test', 'other', 'mechanical'][rank(d)]}, ${size(d)} lines)`)
}

// Where the evidence lives, as links: the CI runs for the branch, the chart and holdout cases at the base (CI reads them there), the frozen-test commit.
// An origin that is not a GitHub URL gives no links. Paths are repo-relative with forward slashes.
export function evidenceLinks(origin: string | null, o: { base: string; branch: string; sprint: number | null; frozen?: string; slug?: string; trace?: boolean }): string[] {
  const m = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec((origin ?? '').trim())
  if (!m) return []
  const u = `https://github.com/${m[1]}`, sp = o.sprint === null ? '' : `.rig/product/sprints/sprint-${o.sprint}`
  return [`[CI runs for this branch](${u}/actions?query=branch%3A${encodeURIComponent(o.branch)})`,
    ...(sp ? [`[approved chart at ${o.base}](${u}/tree/${encodeURIComponent(o.base)}/${sp})`, `[hidden cases at ${o.base}](${u}/tree/${encodeURIComponent(o.base)}/${sp}/testplan)`] : []),
    ...(o.trace && o.slug ? [`[journey trace](${u}/tree/${encodeURIComponent(o.branch)}/.rig/changes/${o.slug}/evidence/journeys)`] : []),
    ...(o.frozen ? [`[tests frozen](${u}/commit/${o.frozen})`] : [])]
}

// The computed dependents (pilot §3): what imports the changed files, against what the spec said the change may touch.
// An existing test that imports the changed code guards it (the unit sensor runs it): it is listed as the regression set, never as a file the spec missed.
const strayDeps = (d: Dependents, radius: string[], paths: Paths): Dependents['all'] => outsideRadius(d.all.filter(x => !isTest(x.file, paths)), radius)
function dependentsNote(d: Dependents, radius: string[], paths: Paths): string {
  const out = strayDeps(d, radius, paths), tests = d.all.filter(x => isTest(x.file, paths))
  return `## Dependents (computed)\n\n${[
    `${d.all.length} file(s) outside the diff import the changed code, within two hops, by a static search of the import lines.`,
    tests.length ? `Existing tests that import the changed code, the regression set (${tests.length}):\n${tests.slice(0, 10).map(x => `- ${x.file} (via ${x.via})`).join('\n')}${tests.length > 10 ? `\n- and ${tests.length - 10} more` : ''}` : '',
    out.length ? `Not in the spec's blast radius (${out.length}):\n${out.slice(0, 10).map(x => `- ${x.file} (via ${x.via})`).join('\n')}${out.length > 10 ? `\n- and ${out.length - 10} more` : ''}` : '',
    d.unsupported.length ? `Not analysed (a language this search does not read): ${d.unsupported.join(', ')}` : '',
    d.limited ? 'The search read only the first 5000 source files.' : ''].filter(Boolean).join('\n\n')}`
}

// What a reviewer reads first (pilot §4): the approved revision, the worst consequence, the independent evidence, what is unproven, and what was weakened, waived or amended.
function reviewFirst(i: PrBodyInput, amended: string[], uncertain: string[]): string {
  const flags = [...(i.interrogate?.reproduced ?? []).map(f => `reproduced finding ${f}`), ...(i.risk.tier === 2 && !i.interrogate ? ['tier 2 change: no interrogation recorded'] : []), ...(i.dependents && strayDeps(i.dependents, blastRadius(i.spec) ?? [], i.paths ?? defaultRegistry().paths).length ? [`${strayDeps(i.dependents, blastRadius(i.spec) ?? [], i.paths ?? defaultRegistry().paths).length} dependent(s) outside the spec's blast radius (see Dependents)`] : []), ...(i.differential?.unapproved ?? []).map(d => `unapproved difference: ${d}`), ...(i.freeze ?? []).slice(1).map(r => (r.dropped?.length ? `weakened test: re-frozen, ${clean(r.why)} (dropped: ${r.dropped.map(clean).join(', ')})` : `re-frozen: ${clean(r.why)}`)), ...(i.waivers ?? []).map(w => `waiver: ${w}`), ...(i.planChanges ?? []).map(c => `plan amendment ${c.replace(/^- /, '')}`), ...amended.map(a => `behaviour amendment: ${a.replace(/^[-*]\s+/, '')}`)]
  const holdout = i.verify?.holdout ? `${i.verify.holdout.passed}/${i.verify.holdout.total} hidden acceptance cases pass` : 'no hidden acceptance case ran'
  return `## Review first\n\n${[
    `Approved intent: ${i.chart}`,
    `Highest consequence: ${i.risk.reasons.length ? `tier ${i.risk.tier}, ${i.risk.reasons[0]}` : 'tier 0, none of the signals'}; door: ${door(i.plan)}`,
    `Independent evidence: ${holdout}; verify ${i.verify ? (i.verify.pass ? 'pass' : 'fail') : 'none'}`,
    `Remaining uncertainty: ${uncertain.length ? `${uncertain.length} item(s), first: ${uncertain[0]!.replace(/^[-*]\s+/, '')}` : 'nothing the reviewer named'}`,
    `Differential: ${i.differential?.line ?? 'not applicable'}`,
    ...(i.interrogate || i.risk.tier === 2 ? [`Interrogation: ${i.interrogate?.line ?? 'not run'}`] : []),
    ...(i.links?.length ? [`Links: ${i.links.join(' · ')}`] : []),
    ...(i.changes?.length ? [`Read in this order: ${readOrder(i.changes, i.plan, i.paths).slice(0, 8).join('; ')}${i.changes.length > 8 ? `; and ${i.changes.length - 8} more` : ''}`] : []),
    `Flags: ${flags.length ? '' : 'none'}`,
  ].map(l => `- ${l}`).join('\n')}${flags.length ? '\n' + flags.map(f => `  - ${f}`).join('\n') : ''}`
}

export function prBody(i: PrBodyInput): string {
  const why = firstSentence(section(i.intent, 'Intent')) || 'none recorded'
  const behaviours = bullets(section(i.spec, 'Behaviours'))
  const radius = (blastRadius(i.spec) ?? []).map(p => `- ${p}`)
  const amended = bullets(section(i.amendments ?? '', 'Amendments')).filter(l => !/^[-*]\s+none\.?$/i.test(l))
  const evidence = i.verify ? `verify: ${i.verify.pass ? 'pass' : 'fail'} on tree ${i.verify.tree ?? 'unknown'} (${i.verify.blocks.join(', ') || 'no blocking sensors'})${i.verify.holdout ? `\nHoldout: ${i.verify.holdout.passed}/${i.verify.holdout.total} hidden acceptance cases pass` : ''}` : 'verify: none'
  const missed = bullets(section(i.review, 'Unverifiable'))
  // Only the latest verify's runs: an older run of a check it did not re-run is not evidence about this tree.
  const from = i.verify?.from, runs = (i.runs ?? []).filter(r => !from || r.at >= from)
  const blocked = (i.agents ?? []).filter(a => a.status === 'BLOCKED'), concerns = (i.agents ?? []).filter(a => a.status === 'DONE_WITH_CONCERNS')
  const would = [...(!i.review.trim() ? ['no review.md'] : /^reviewer:\s*none\b/.test(i.review) ? [`No agent reviewed this change (tier ${i.risk.tier}): the sensors and the tests are the evidence.`] : missed), ...concerns.map(a => `- ${a.agent} (${a.model ?? 'unknown model'}): ${a.note}`), ...(i.proof?.ids.length ? [`- ${i.proof.ids.join(', ')} ${i.proof.ids.length === 1 ? 'is' : 'are'} proved only by unit tests: no holdout case or approved journey names ${i.proof.ids.length === 1 ? 'it' : 'them'}`] : []), ...(i.proof?.exempt ? [`- proof: exempt, ${i.proof.exempt}`] : [])]
  const parts = [
    blocked.length || i.draft !== undefined ? `> Draft: blocked. ${blocked.map(a => a.note).filter(Boolean).join('; ') || i.draft || 'no reason given'}` : '',
    i.chart !== undefined ? reviewFirst(i, amended, would) : '',
    `## Why the change\n\n${why}`,
    behaviours.length ? `## Behaviours\n\n${behaviours.join('\n')}` : '',
    amended.length ? `## Amendments after approval\n\n${amended.join('\n')}` : '',
    i.planChanges ? `## Plan changes after build\n\n${i.planChanges.join('\n') || 'none'}` : '',
    `## Blast radius\n\n${radius.length ? radius.join('\n') : 'none recorded'}\n\nDoor: ${door(i.plan)}`,
    i.dependents ? dependentsNote(i.dependents, blastRadius(i.spec) ?? [], i.paths ?? defaultRegistry().paths) : '',
    `## Risk\n\n${i.risk.reasons.length ? `Tier ${i.risk.tier}\n\n${i.risk.reasons.map(r => `- ${r}`).join('\n')}` : 'Tier 0: none of the signals'}`,
    `## How to revert\n\n${revert(i.plan)}`,
    `## What the checks would miss\n\n${would.join('\n') || 'nothing the reviewer named'}`,
    `## Evidence\n\n${[evidence, baseProof(runs), headChecks(runs), mutationNote(runs), behaviourTests(i.spec, i.tests, i.sensors), frozenNote(i.freeze), claimsNote(i.review, i.claims), proposedNote(i.spec, i.requirements)].filter(Boolean).join('\n\n')}`,
    `## Check before approving\n\nAnswer these in your approving review, one line each (\`Q1: <answer>\`, 10+ characters; CI checks they are there; a sample of merged changes is audited):\n\n${checkQuestions(i.changes ?? [], i.spec, i.paths).join('\n')}`,
    agentsNote(i.agents),
    i.intentMap?.trim() ? `## Intent map\n\n${i.intentMap.trim()}` : '',
    i.outline.trim(),
  ]
  return parts.filter(Boolean).join('\n\n') + '\n'
}
