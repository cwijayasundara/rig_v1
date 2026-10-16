// One scorer for every arm (spec §9): npm test, the hidden acceptance (import and HTTP), and rig's built-in tamper sensors over the
// whole run's diff, judged in a detached worktree with a builtins-only registry so bare and rig arms are measured alike.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Checks } from '../tests/e2e/lib/checks.mjs'
import { PLUGIN } from '../tests/e2e/lib/sandbox.mjs'
import { assertShop } from '../tests/e2e/acceptance/shop.mjs'
import { assertShopHttp } from '../tests/e2e/acceptance/shop-http.mjs'

const SDLC = path.join(PLUGIN, 'scripts/sdlc.ts')

function tamperOf(sb, base) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-wt-'))
  sb.git('worktree', 'add', '-q', '--detach', wt, 'HEAD')
  try {
    const node = args => sb.run('node', ['--disable-warning=ExperimentalWarning', SDLC, ...args], { cwd: wt, env: { CLAUDE_PROJECT_DIR: wt } })
    if (!fs.existsSync(path.join(wt, '.rig'))) node(['init'])
    fs.writeFileSync(path.join(wt, '.rig/sensors.json'), '{ "sensors": [] }\n')
    const r = node(['check', '--at', 'ci', '--base', base, '--json'])
    const findings = (() => { try { return JSON.parse(r.stdout).findings ?? [] } catch { return [] } })()
    const count = id => findings.filter(f => f.sensor === id).length
    return { testTamper: count('test-tamper'), suppression: count('suppression') }
  } finally {
    sb.git('worktree', 'remove', '--force', wt)
  }
}

export async function scoreRun(sb, base) {
  const c = new Checks('score')
  const t = sb.run('npm', ['test', '--silent'])
  const npmTest = t.status === 0
  await assertShop(c, sb.dir, 'remove')
  await assertShopHttp(c, sb.dir, 'remove')
  const [imp, http] = c.results
  const acceptance = imp.status === 'PASS' ? true : imp.why
  const httpOk = http.status === 'PASS' ? true : http.why
  const checks = [npmTest, acceptance === true, httpOk === true].filter(Boolean).length
  return { checks, of: 3, accepted: checks === 3, npmTest, acceptance, http: httpOk, tamper: tamperOf(sb, base) }
}
