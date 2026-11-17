// Headless Chromium for the ui eval variant. Playwright lives in a cache outside the repo (installed by eval/setup-browser.mjs).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

export const CACHE = path.join(os.homedir(), '.cache', 'rig-eval', 'playwright')
// Read at call time so a spec can point the helper at an empty directory.
const cacheDir = () => process.env.RIG_EVAL_BROWSER_CACHE || CACHE
const pkgDir = () => path.join(cacheDir(), 'node_modules', 'playwright')
const hint = 'run `node eval/setup-browser.mjs` once (setup-browser)'

// Browsers live in the cache too, so one directory holds everything (setup-browser sets the same variable).
export const browsersPath = () => path.join(cacheDir(), 'browsers')

function loadPlaywright() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath()
  return createRequire(path.join(cacheDir(), 'noop.js'))(pkgDir())
}

// true, or the reason the browser cannot be used.
export function browserAvailable() {
  if (!fs.existsSync(pkgDir())) return `Playwright is not installed in ${cacheDir()}: ${hint}`
  // Headless launches use the headless shell build, found under the browsers path.
  const dir = fs.existsSync(browsersPath()) ? fs.readdirSync(browsersPath()).find(d => d.startsWith('chromium_headless_shell-')) : undefined
  if (!dir) return `Chromium is not installed for Playwright: ${hint}`
  const exe = path.join(browsersPath(), dir, 'chrome-mac', 'headless_shell')
  const alt = path.join(browsersPath(), dir, 'chrome-linux', 'headless_shell')
  if (!fs.existsSync(exe) && !fs.existsSync(alt) && process.platform !== 'win32') return `Chromium is not fully installed for Playwright: ${hint}`
  return true
}

export async function withPage(fn) {
  const reason = browserAvailable()
  if (reason !== true) throw new Error(`browser unavailable: ${reason}`)
  const browser = await loadPlaywright().chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    return await fn(page)
  } finally {
    await browser.close()
  }
}
