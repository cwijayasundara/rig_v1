// The shop's own contract tool, zero dependencies: `validate` checks every example against api/openapi.yaml, `run` replays
// the examples, in file-name order, against one `npm start` on a free port. CONTRACT_LOG, when set, records each mode first.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const SPEC = 'api/openapi.yaml'
const EXAMPLES = 'contracts/examples'

// api/openapi.yaml is written in JSON syntax, which is valid YAML, so no parser dependency is needed.
export function load(root) {
  const file = path.join(root, SPEC)
  if (!fs.existsSync(file)) return null
  const dir = path.join(root, EXAMPLES)
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : []
  return { spec: JSON.parse(fs.readFileSync(file, 'utf8')), examples: names.map(name => ({ name, ...JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) })) }
}

const route = template => new RegExp(`^${template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`)

export function validate(spec, examples) {
  const problems = []
  for (const ex of examples) {
    const { method = '', path: p = '' } = ex.request ?? {}
    const status = String(ex.response?.status ?? '')
    const op = Object.entries(spec.paths ?? {}).find(([t]) => route(t).test(p))?.[1]?.[method.toLowerCase()]
    if (!op) problems.push(`${ex.name}: ${method} ${p} is not in ${SPEC}`)
    else if (!op.responses?.[status]) problems.push(`${ex.name}: ${method} ${p} does not declare status ${status}`)
  }
  return problems
}

// Every key the example names must be in the actual value; each expected array element must match some actual element.
export function subset(expected, actual) {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.every(e => actual.some(a => subset(e, a)))
  if (expected && typeof expected === 'object') return !!actual && typeof actual === 'object' && Object.entries(expected).every(([k, v]) => subset(v, actual[k]))
  return expected === actual
}

// Its own process group, so stop() takes npm and the server it started down together.
export function start(root, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['start', '--silent'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let out = ''
    let settled = false
    const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v) } }
    const timer = setTimeout(() => { stop(child); done(reject, new Error(`npm start printed no "listening on <port>" within ${timeoutMs} ms`)) }, timeoutMs)
    child.stdout.on('data', d => { out += d; const m = /listening on (\d+)/.exec(out); if (m) done(resolve, { child, port: Number(m[1]) }) })
    child.on('exit', code => done(reject, new Error(`npm start exited ${code} before listening`)))
  })
}

export const stop = child => { try { process.kill(-child.pid, 'SIGTERM') } catch {} }

export async function run(root, examples, timeoutMs = 10_000) {
  const { child, port } = await start(root, timeoutMs)
  const failures = []
  try {
    for (const ex of examples) {
      const { method, path: p, body } = ex.request
      const init = body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      const res = await fetch(`http://127.0.0.1:${port}${p}`, init)
      const got = await res.json().catch(() => null)
      if (res.status !== ex.response.status) failures.push(`${ex.name}: ${method} ${p} gave ${res.status}, want ${ex.response.status}`)
      else if (ex.response.body !== undefined && !subset(ex.response.body, got)) failures.push(`${ex.name}: ${method} ${p} body ${JSON.stringify(got)} does not contain ${JSON.stringify(ex.response.body)}`)
    }
  } finally {
    stop(child)
  }
  return failures
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const mode = process.argv[2]
  if (process.env.CONTRACT_LOG) fs.appendFileSync(process.env.CONTRACT_LOG, `${mode}\n`)
  const c = load(process.cwd())
  if (!c) { console.log(`no ${SPEC} yet: nothing to check`); process.exit(0) }
  const problems = mode === 'validate' ? validate(c.spec, c.examples)
    : mode === 'run' ? await run(process.cwd(), c.examples).catch(e => [e.message])
    : ['usage: node scripts/contract.mjs validate|run']
  for (const p of problems) console.error(p)
  process.exit(problems.length ? 1 : 0)
}
