// Stack fixtures, outside npm test (toolchains, network downloads): node tests/e2e/stacks.mjs [--stack <name>] [--require all|a,b] [--out DIR]
// A required stack that cannot run fails instead of skipping.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createSandbox } from './lib/sandbox.mjs'
import { STACKS, probe, runStack, requiredStacks } from './lib/stacks.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const only = arg('stack')
const required = requiredStacks(arg('require'))
const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-stacks-'))))
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })
let ran = 0
for (const s of STACKS.filter(s => !only || s.stack === only)) {
  const p = probe(run, s.probe[0], s.probe.slice(1))
  if (!p.ok && required.includes(s.stack)) { console.log(`FAIL  stack ${s.stack} is required but cannot run: ${p.why}`); process.exitCode = 1; continue }
  if (!p.ok) { console.log(`SKIP  stack ${s.stack}: ${p.why}`); continue }
  const c = await runStack(createSandbox({ name: `stack-${s.stack}`, out }), s)
  c.print()
  ran++
  if (c.failed.length) process.exitCode = 1
}
console.log(`\n${ran} stack(s) ran; sandboxes: ${out}`)
