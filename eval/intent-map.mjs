// Acceptance oracle for the intent map. scripts/intentmap.ts, when it is built, must return these verdicts.
// The login grid is finite, so this oracle enumerates it. A later property that is not finite uses the formal command
// in the sensor registry. This file does not change approve, verify, or the PR body.
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const LOGIN = path.join(import.meta.dirname, 'fixtures/intent-map/login')

const rowHead = /^- ([RSTN]\d+): (.+)$/
const saidHead = /^- (S\d+): (.+)$/
const decisionHead = /^- (D\d+): (.+)$/
const clauseHead = /^### (C\d+)(?: (only-when|always))?$/
const scenarioHead = /^### (E\d+)$/
const promisedHead = /^- (N\d+): (.+)$/

export function scenarioHash(scenario) {
  const body = `given: ${scenario.given}\nwhen: ${scenario.when}\nthen: ${scenario.then}\n`
  return crypto.createHash('sha256').update(body).digest('hex')
}

function fieldsOf(rest) {
  const out = {}
  for (const part of rest.replace(/\.$/, '').split('. ')) {
    const [key, ...value] = part.split(' ')
    out[key] = value.join(' ').replace(/\.$/, '')
  }
  return out
}

function list(value) {
  return value ? value.split(',').map(s => s.trim()).filter(Boolean) : []
}

export function parse(text) {
  const lines = text.split('\n')
  const said = []
  const decisions = []
  const rows = []
  const clauses = []
  const scenarios = []
  const notPromised = []
  let section = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ')) { section = line.slice(3).trim(); continue }
    if (section === 'Said') { const m = saidHead.exec(line); if (m) said.push({ id: m[1], text: m[2] }) }
    if (section === 'Decisions') { const m = decisionHead.exec(line); if (m) decisions.push({ id: m[1], text: m[2] }) }
    if (section === 'Map') {
      const m = rowHead.exec(line)
      if (!m) continue
      const f = fieldsOf(m[2])
      rows.push({ id: m[1], said: f.said ?? '', decision: f.decision ?? '', kind: f.kind ?? '', clauses: list(f.clauses), scenarios: list(f.scenarios) })
    }
    if (section === 'Formal') {
      const m = clauseHead.exec(line)
      if (m) clauses.push({ id: m[1], direction: m[2] ?? '', text: '' })
      else if (clauses.length && line.trim()) clauses[clauses.length - 1].text += (clauses.at(-1).text ? ' ' : '') + line.trim()
    }
    if (section === 'Empirical') {
      const m = scenarioHead.exec(line)
      if (!m) continue
      const scenario = { id: m[1] }
      for (i += 1; i < lines.length; i++) {
        if (lines[i].startsWith('#') || lines[i].startsWith('- ')) { i -= 1; break }
        const field = /^(\w+): (.*)$/.exec(lines[i])
        if (field) scenario[field[1]] = field[2]
      }
      scenarios.push(scenario)
    }
    if (section === 'Not promised') { const m = promisedHead.exec(line); if (m) notPromised.push({ id: m[1], text: m[2] }) }
  }
  return { said, decisions, rows, clauses, scenarios, notPromised }
}

function finding(rule, detail) {
  return { rule, detail }
}

export function structure(text, phase) {
  const map = parse(text)
  const out = []
  const clauseById = new Map(map.clauses.map(c => [c.id, c]))
  const scenarioById = new Map(map.scenarios.map(s => [s.id, s]))
  const promised = new Set(map.notPromised.map(n => n.id))
  const seenSaid = new Set(map.rows.map(r => r.said).filter(Boolean))
  for (const s of map.said) if (!seenSaid.has(s.id)) out.push(finding('unmapped-said', `${s.id} is in Said and on no row`))
  for (const row of map.rows) {
    if (!['formal', 'empirical', 'not-promised'].includes(row.kind)) out.push(finding('unknown-kind', `${row.id} has kind ${row.kind || '(none)'}`))
    if (row.kind === 'formal') {
      if (!row.clauses.length) out.push(finding('missing-clause', `${row.id} is formal and names no clause`))
      for (const id of row.clauses) if (!clauseById.has(id)) out.push(finding('missing-clause', `${row.id} names ${id}, which has no Formal section`))
      const decision = map.decisions.find(d => d.id === row.decision)
      if (decision?.text.startsWith('both-ways')) {
        const dirs = row.clauses.map(id => clauseById.get(id)?.direction)
        if (!dirs.includes('only-when') || !dirs.includes('always')) out.push(finding('both-ways', `${row.id} records ${row.decision} both-ways and needs an only-when clause and an always clause`))
      }
    }
    if (row.kind === 'empirical') {
      if (!row.scenarios.length) out.push(finding('missing-scenario', `${row.id} is empirical and names no scenario`))
      for (const id of row.scenarios) {
        const scenario = scenarioById.get(id)
        if (!scenario) { out.push(finding('missing-scenario', `${row.id} names ${id}, which has no Empirical section`)); continue }
        if (phase === 'plan' && scenario.status !== 'planned') out.push(finding('empirical-early', `${id} is ${scenario.status || 'unset'} at plan time; the scenario is written before the test runs`))
        if (phase === 'ship' && scenario.status !== 'pass') out.push(finding('empirical-open', `${id} is ${scenario.status || 'unset'} at ship time; only a recorded pass ships`))
        if (phase === 'ship' && scenario.status === 'pass' && (!scenario.command || !scenario.commit)) out.push(finding('empirical-unrecorded', `${id} says pass without a command and a commit`))
      }
    }
    if (row.kind === 'not-promised' && !promised.has(row.id)) out.push(finding('missing-not-promised', `${row.id} is not-promised and is absent from Not promised`))
  }
  const usedClauses = new Set(map.rows.flatMap(r => r.clauses))
  for (const clause of map.clauses) if (!usedClauses.has(clause.id)) out.push(finding('orphan-clause', `${clause.id} is in Formal and on no row`))
  return { map, findings: out }
}

export function freezeFindings(map, freeze) {
  if (!freeze) return []
  const out = []
  for (const scenario of map.scenarios) {
    const want = freeze[scenario.id]
    if (!want) continue
    const got = scenarioHash(scenario)
    if (got !== want) out.push(finding('stale-scenario', `${scenario.id} differs from the text hashed at approval`))
  }
  return out
}

export function formalFindings(map, clauseHolds, mutants) {
  const out = []
  const wanted = [...new Set(map.rows.filter(r => r.kind === 'formal').flatMap(r => r.clauses))]
  for (const id of wanted) if (clauseHolds && clauseHolds[id] === false) out.push(finding('formal-failed', `${id} has a counterexample on the implementation`))
  if (!mutants) return out
  const ids = new Set()
  for (const m of mutants) { if (ids.has(m.id)) out.push(finding('formal-failed', `duplicate mutant id ${m.id}`)); ids.add(m.id) }
  for (const id of wanted) {
    const planted = mutants.filter(m => m.clause === id)
    if (!planted.length) out.push(finding('unmutated', `${id} has no planted bug`))
    for (const m of planted) if (m.holds) out.push(finding('vacuous', `${id} still holds under ${m.id}, so the clause rules nothing out`))
  }
  return out
}

export function pruneFindings(testSources, mapClauses) {
  const out = []
  for (const source of testSources) {
    const clauses = [...source.matchAll(/\b(C\d+)\b/g)].map(m => m[1]).filter(id => !mapClauses || mapClauses.has(id))
    const scenarios = [...source.matchAll(/\b(E\d+)\b/g)].map(m => m[1])
    if (clauses.length && !scenarios.length) out.push(finding('prune', `a test names ${[...new Set(clauses)].join(', ')} and no empirical scenario; the formal check already covers it`))
  }
  return out
}

export function receipt(map, clauseHolds = {}) {
  return map.rows.map(row => {
    if (row.kind === 'formal') {
      const bits = row.clauses.map(id => `${id} ${clauseHolds[id] === false ? 'fails' : 'holds'}`)
      return `- ${row.id} formal: ${bits.join(', ')}`
    }
    if (row.kind === 'empirical') {
      const bits = row.scenarios.map(id => {
        const scenario = map.scenarios.find(s => s.id === id)
        return scenario?.status === 'pass' ? `${id} evidence @ ${scenario.commit}` : `${id} ${scenario?.status ?? 'missing'}`
      })
      return `- ${row.id} empirical: ${bits.join(', ')} (evidence, not proof)`
    }
    const note = map.notPromised.find(n => n.id === row.id)
    return `- ${row.id} not promised: ${note?.text ?? ''}`
  }).join('\n')
}

export function check(text, opts) {
  const { map, findings } = structure(text, opts.phase)
  const all = [
    ...findings,
    ...freezeFindings(map, opts.freeze),
    ...(opts.phase === 'ship' ? formalFindings(map, opts.clauses, opts.mutants) : []),
    ...pruneFindings(opts.tests ?? [], new Set(map.clauses.map(c => c.id))),
  ]
  return { map, findings: all, pass: all.length === 0, receipt: receipt(map, opts.clauses) }
}

function runImpl(lookup, decide) {
  const run = spawnSync('python3', ['run.py', lookup, decide], { cwd: LOGIN, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr || `run.py exited ${run.status}`)
  return JSON.parse(run.stdout)
}

export function checkLogin(phase) {
  const file = phase === 'plan' ? 'intent-plan.md' : 'intent.md'
  const text = fs.readFileSync(path.join(LOGIN, file), 'utf8')
  const tests = fs.readdirSync(path.join(LOGIN, 'tests')).filter(name => name.endsWith('.py')).map(name => fs.readFileSync(path.join(LOGIN, 'tests', name), 'utf8'))
  if (phase === 'plan') return check(text, { phase, tests })
  const freeze = JSON.parse(fs.readFileSync(path.join(LOGIN, 'freeze.json'), 'utf8'))
  const good = runImpl('lookup_target', 'decide')
  const mutants = JSON.parse(fs.readFileSync(path.join(LOGIN, 'mutants.json'), 'utf8')).map(m => ({ ...m, holds: runImpl(m.lookup, m.decide)[m.clause] }))
  return check(text, { phase: 'ship', freeze, tests, clauses: good, mutants })
}

export function freezeFor(text) {
  const { scenarios } = parse(text)
  return Object.fromEntries(scenarios.map(s => [s.id, scenarioHash(s)]))
}
