// Policy stage (spec §3.3, §10.2): the same change, one turn under a continuous model and one under a final model.
// continuous: every turn sensor runs at Stop. final: only secrets and harness-tamper run at Stop; the rest waits for commit.
// Both turns run with no change open (the vibe path): the floor applies to unplanned work too.
import crypto from 'node:crypto'
import { Checks } from '../lib/checks.mjs'

const PROBE = 'policy-probe'
const fired = sb => {
  const u = sb.read('.rig/unresolved.json')
  return u ? [...new Set(JSON.parse(u).findings.map(f => f.sensor))].sort() : []
}

// One turn: the session's model recorded at SessionStart, a prompt, the change, Stop. Returns the SessionStart context and the sensors that blocked.
function turn(sb, session, model) {
  const hook = (name, payload) => sb.sdlc(['hook', name], { input: JSON.stringify({ session_id: session, ...payload }) })
  const ctx = hook('session-start', { model, source: 'startup' }).stdout
  hook('prompt-submit', { prompt: 'policy probe' })
  sb.write('src/orders/orders.js', sb.read('src/orders/orders.js').replace('SAVE10: 0.1', 'SAVE10: 0.5'))
  sb.write('src/policy-leak.js', `${['export const apiKey', '=', JSON.stringify(crypto.randomBytes(16).toString('hex'))].join(' ')}\n`)
  hook('stop', {})
  const sensors = fired(sb)
  sb.run('git', ['checkout', '--', 'src/orders/orders.js'])
  sb.run('rm', ['-f', sb.file('src/policy-leak.js'), sb.file('.rig/unresolved.json')])
  // A clean turn resets the gate, so the next session starts from nothing.
  hook('prompt-submit', { prompt: 'settle' })
  hook('stop', {})
  return { ctx, sensors }
}

export async function runPolicy(sb) {
  const c = new Checks('S5 policy')
  const start = sb.git('rev-parse', 'HEAD')
  sb.git('checkout', '-q', '-b', PROBE)
  try {
    const cont = turn(sb, 'pol-sonnet', 'claude-sonnet-5-5')
    const fin = turn(sb, 'pol-opus', 'claude-opus-5-5')
    await c.check('S5: the probe turns run with no change open (the vibe path)', () => /No active change/.test(cont.ctx) || cont.ctx.split('\n').find(l => /change|Queue/.test(l)))
    await c.check('S5: SessionStart names the continuous policy for Sonnet', () => /rig policy: continuous checks for claude-sonnet-5-5/.test(cont.ctx) || cont.ctx.split('\n')[0])
    await c.check('S5: SessionStart names the final policy for Opus', () => /rig policy: final checks for claude-opus-5-5/.test(fin.ctx) || fin.ctx.split('\n')[0])
    await c.check('S5: under continuous, Stop blocks on the unit suite and the secret', () => (cont.sensors.includes('unit') && cont.sensors.includes('secrets')) || `fired: ${cont.sensors.join(', ') || 'none'}`)
    await c.check('S5: under final, Stop blocks on the secret only (the unit suite waits for commit)', () => (fin.sensors.includes('secrets') && !fin.sensors.includes('unit')) || `fired: ${fin.sensors.join(', ') || 'none'}`)
    sb.write('src/orders/orders.js', sb.read('src/orders/orders.js').replace('SAVE10: 0.1', 'SAVE10: 0.5'))
    sb.git('add', 'src/orders/orders.js')
    const r = sb.run('git', ['commit', '-q', '-m', 'operator: the final-policy change at commit'])
    const said = r.stdout + r.stderr
    if (sb.git('rev-parse', 'HEAD') !== start) sb.git('reset', '-q', '--hard', start)
    sb.run('git', ['reset', '-q', '--hard', 'HEAD'])
    await c.check('S5: the commit hook catches what final skipped (unit)', () => (r.status !== 0 && /\[unit\]/.test(said)) || `exit ${r.status}: ${said.trim().split('\n').slice(0, 2).join(' | ')}`)
  } finally {
    sb.git('checkout', '-q', 'main')
    sb.run('git', ['branch', '-q', '-D', PROBE])
  }
  await c.check('S5: the tree is clean and main is where it was', () => (sb.git('status', '--porcelain') === '' && sb.git('rev-parse', 'HEAD') === start) || `status: ${sb.git('status', '--porcelain').split('\n').join('; ')}`)
  return c
}
