// One-time, run by a person: installs Playwright and Chromium into the cache outside the repo. Idempotent.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { CACHE, browserAvailable, browsersPath } from './lib/browser.mjs'

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: CACHE, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath() } })
  if (r.status !== 0) { console.error(`${cmd} ${args.join(' ')} failed`); process.exit(r.status ?? 1) }
}

if (browserAvailable() === true) { console.log(`browser already set up in ${CACHE}`); process.exit(0) }
fs.mkdirSync(CACHE, { recursive: true })
if (!fs.existsSync(path.join(CACHE, 'package.json'))) run('npm', ['init', '-y'])
if (!fs.existsSync(path.join(CACHE, 'node_modules', 'playwright'))) run('npm', ['install', 'playwright@1.56.1'])
run('npx', ['playwright', 'install', 'chromium-headless-shell'])
console.log(`browser set up in ${CACHE}`)
