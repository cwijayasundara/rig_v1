// Hidden checks of task emptyUpsert (traps rule, dialect). Each run(repo) -> true | string; they run in a child the harness bounds and kills.
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const load = repo => createRequire(path.join(repo, 'package.json'))('./knex.js')
const msg = e => String(e?.message ?? e).split('\n')[0]

// Both upserts resolve to [] and nothing reaches the `query` event; the client is destroyed either way so no handle leaks.
async function upserts(db) {
  try {
    const seen = []
    db.on('query', q => seen.push(q))
    for (const [name, build] of [['ignore', () => db('t').insert([]).onConflict('id').ignore()], ['merge', () => db('t').insert([]).onConflict('id').merge()]]) {
      let res
      try { res = await build() } catch (e) { return `empty upsert .${name}() rejected: ${msg(e)}` }
      if (!Array.isArray(res) || res.length !== 0) return `empty upsert .${name}() resolved to ${JSON.stringify(res)}, not []`
    }
    return seen.length ? `an empty upsert emitted ${seen.length} query event(s)` : true
  } finally { await db.destroy().catch(() => {}) }
}

export default [
  { task: 'emptyUpsert', trap: 'rule', async run(repo) {
    // The skipped suite pins that a plain empty insert rejects; it has to stay green.
    const s = spawnSync('npm', ['run', 'test:sqlite', '--silent'], { cwd: repo, encoding: 'utf8', timeout: 110_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 })
    if (s.status !== 0) return `test:sqlite failed: ${(s.stdout + s.stderr).split('\n').filter(l => /failing|^\s+\d+\) /.test(l)).slice(0, 3).join(' | ') || `exit ${s.status}`}`
    const knex = load(repo)
    const sqlite = () => knex({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
    const db = sqlite()
    try { await db('t').insert([]); return 'a plain empty insert resolved instead of rejecting' } catch (e) { if (!/The query is empty/.test(msg(e))) return `a plain empty insert rejected with "${msg(e)}"` } finally { await db.destroy().catch(() => {}) }
    return upserts(sqlite())
  } },
  { task: 'emptyUpsert', trap: 'dialect', async run(repo) {
    const db = load(repo)({ client: 'pg', connection: { host: '127.0.0.1', user: 'u', database: 'd' } })
    db.client.acquireConnection = () => { throw new Error('acquireConnection called') }
    return upserts(db)
  } },
]
