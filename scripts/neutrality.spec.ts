// Core neutrality (spec 2026-10-16 §10.1): tool and command names live in templates/stacks/, never in core scripts.
// The three pattern tables in sensors.ts match language idioms in a diff (data, not invocations) and are left out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIR = import.meta.dirname
const DENY = /\b(?:mvn|cargo|dotnet|npm|npx|pip|gradle|eslint|tsc|pytest|jest|vitest|go test)\b/
const PATTERN_TABLES = /export const (?:TAMPER_PATTERNS|SUPPRESSIONS)[\s\S]*?\n\]\n|const CONFIG_FILE = .*\n/g

test('no core script names a language tool or command', () => {
  const hits: string[] = []
  for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts')) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8').replace(PATTERN_TABLES, '')
    text.split('\n').forEach((line, i) => { if (DENY.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`) })
  }
  assert.deepEqual(hits, [])
})

test('the size cap counts non-spec scripts and holds', () => {
  const total = fs.readdirSync(DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts')
    .reduce((n, f) => n + fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\n$/, '').split('\n').length, 0)
  assert.ok(total <= SCRIPTS_CAP, `scripts are ${total} lines (cap ${SCRIPTS_CAP})`)
})
const SCRIPTS_CAP = 5160 // 5 010 plus journeys (app.ts and its wiring, about 130 lines, harness readiness 2.1, 2026-10-21); before that: 5 010 = 4 930 plus sdlc queue (queue.ts, about 75 lines, many instances, 2026-10-21); before that: 4 910 plus owner and age on waivers and approvals (about 12 lines, harness readiness 4.3, 2026-10-21); before that: 4 820 plus count ratchets (counts.ts and its wiring, about 80 lines, harness readiness 1.5, 2026-10-21); before that: 4 580 plus sdlc arch (arch.ts, about 215 lines, harness readiness 1.1, 2026-10-21); before that: 4 480 plus sdlc report (report.ts, about 75 lines, harness readiness Phase 0.3, 2026-10-21); before that: 4 480 plus not-configured sensors in status and check (inertSensors, about 14 lines, harness readiness Phase 0.1, 2026-10-21); before that: 4 470 plus the chart-reviewer change (parkedDecisions and latestAgents, about 14 lines, design 2026-10-18); before that: 4 350 plus the journey view and its vendoring (about 110 lines) (journey.ts and its status flag: about 90 lines, GOAL Scope 7, 2026-10-18); before that: 4 100 plus the learning loop (learn*.ts: about 250 lines, 2026-10-17); before that: 3 450 for the sprint outer loop; raised for the code wiki (wiki*.ts: about 650 lines), with the person's cap for the whole harness raised to 6 000 on 2026-10-17. Before that: 3 050 after step 4c; raised for the sprint outer loop (chart.ts, chartcheck.ts: 3 308 after task 4, about 3 380 at the end), with the person's cap for the whole harness at 5 000
