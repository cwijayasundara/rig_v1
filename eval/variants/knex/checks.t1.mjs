// Hidden checks of task notLike (traps caller, types). Each run(repo) -> true | a failure string.
// caller: the four new methods on mysql and mssql (whose compilers override whereLike/whereILike with a collation) must give
//   the negation of upstream's own whereLike/whereILike SQL, computed here from the same client, so no SQL is written out.
// types: a usage file that calls all four on a typed builder must pass `tsc --noEmit`.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

// "x like ?" -> "x not like ?" (the keyword is the only place the negation goes).
const negate = sql => sql.replace(/ (i?like) /, ' not $1 ')

const SHAPES = [
  ['whereNotLike', 'whereLike', 'name'],
  ['whereNotILike', 'whereILike', 'name'],
  ['whereNotLike', 'whereLike', 'users.name'],
  ['whereNotILike', 'whereILike', 'users.name'],
]

function caller(repo) {
  const require = createRequire(path.join(repo, 'x.js'))
  for (const client of ['mysql', 'mssql']) {
    const knex = require(path.join(repo, 'knex.js'))({ client })
    const build = (m, col, or) => {
      const b = knex('users').where('id', 1)
      return (or ? b[`or${m[0].toUpperCase()}${m.slice(1)}`] : b[m]).call(b, col, 'luk%')
    }
    for (const [neg, pos, col] of SHAPES) for (const or of [false, true]) {
      let got
      try { got = build(neg, col, or).toSQL().sql } catch (e) { return `${client} ${or ? 'or' : ''}${neg}(${col}) threw: ${String(e.message).split('\n')[0]}` }
      const want = negate(build(pos, col, or).toSQL().sql)
      if (got !== want) return `${client} ${or ? 'or' : ''}${neg}(${col}): got ${got}, want ${want}`
    }
  }
  return true
}

const USAGE = repo => `import { knex, Knex } from ${JSON.stringify(repo)};

interface User { id: number; name: string }
declare const db: Knex;
const q: Knex.QueryBuilder<User, User[]> = db<User>('users');
const a: Knex.QueryBuilder<User, User[]> = q.whereNotLike('name', 'a%');
const b: Knex.QueryBuilder<User, User[]> = q.whereNotILike('name', 'a%');
const c: Knex.QueryBuilder<User, User[]> = q.where('id', 1).orWhereNotLike('name', 'a%');
const d: Knex.QueryBuilder<User, User[]> = q.where('id', 1).orWhereNotILike('name', 'a%');
const e = db('users').whereNotLike('users.name', 'a%').orWhereNotILike('users.name', 'b%');
void [a, b, c, d, e, knex];
`

function types(repo) {
  const tsc = path.join(repo, 'node_modules/.bin/tsc')
  if (!fs.existsSync(tsc)) return 'typescript is not installed in the repo'
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-kx-types-'))
  try {
    fs.writeFileSync(path.join(dir, 'usage.ts'), USAGE(repo))
    const r = spawnSync(tsc, ['--noEmit', '--strict', '--skipLibCheck', '--esModuleInterop', '--moduleResolution', 'node', '--module', 'commonjs', '--target', 'es2019', '--typeRoots', path.join(repo, 'node_modules/@types'), path.join(dir, 'usage.ts')], { cwd: dir, encoding: 'utf8', timeout: 90_000 })
    return r.status === 0 ? true : `tsc exit ${r.status}: ${(r.stdout + r.stderr).split('\n').slice(0, 3).join(' | ')}`
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

export default [
  { task: 'notLike', trap: 'caller', run: caller },
  { task: 'notLike', trap: 'types', run: types },
]
