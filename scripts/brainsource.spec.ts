// /rig:init --quick enables rig-brain without asking where rig lives: the source comes from Claude Code's own
// marketplace registry, and a shareable source beats a local directory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveBrainSource } from './brainsource.ts'

function marketplace(dir: string, name: string, plugins: string[], withBrain = false): string {
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name, plugins: plugins.map(p => ({ name: p, source: './' })) }))
  if (withBrain) {
    fs.mkdirSync(path.join(dir, 'brain', 'code_wiki'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'brain', 'code_wiki', 'wiki.ts'), '')
  }
  return dir
}

function home(known: unknown): string {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'brainsrc-'))
  fs.mkdirSync(path.join(h, '.claude', 'plugins'), { recursive: true })
  fs.writeFileSync(path.join(h, '.claude', 'plugins', 'known_marketplaces.json'), typeof known === 'string' ? known : JSON.stringify(known))
  return path.join(h, '.claude')
}

const noPlugin = fs.mkdtempSync(path.join(os.tmpdir(), 'brainsrc-root-'))

test('brain-source: a directory marketplace listing rig-brain is the source, seeded from its brain/', () => {
  const dir = marketplace(fs.mkdtempSync(path.join(os.tmpdir(), 'rigmk-')), 'rig', ['rig', 'rig-brain'], true)
  const other = marketplace(fs.mkdtempSync(path.join(os.tmpdir(), 'othermk-')), 'other', ['something'])
  const got = resolveBrainSource(home({ other: { source: { source: 'directory', path: other }, installLocation: other }, rig: { source: { source: 'directory', path: dir }, installLocation: dir } }), noPlugin)
  assert.deepEqual(got, { marketplace: 'rig', source: { source: 'directory', path: dir }, brainDir: path.join(dir, 'brain') })
})

test('brain-source: a github source wins over a url or a directory one, and seeding uses the running plugin\'s brain/', () => {
  const dir = marketplace(fs.mkdtempSync(path.join(os.tmpdir(), 'rigmk-')), 'rig', ['rig-brain'])
  const cache = marketplace(fs.mkdtempSync(path.join(os.tmpdir(), 'rigcache-')), 'rig', ['rig-brain'])
  const plugin = marketplace(fs.mkdtempSync(path.join(os.tmpdir(), 'rigplugin-')), 'rig', [], true)
  const got = resolveBrainSource(home({
    local: { source: { source: 'directory', path: dir }, installLocation: dir },
    mirror: { source: { source: 'url', url: 'https://example.com/marketplace.json' }, installLocation: dir },
    rig: { source: { source: 'github', repo: 'acme/rig' }, installLocation: cache },
  }), plugin)
  assert.deepEqual(got, { marketplace: 'rig', source: { source: 'github', repo: 'acme/rig' }, brainDir: path.join(plugin, 'brain') })
})

test('brain-source: the settings key is the marketplace\'s own name, not the registry key', () => {
  const dir = marketplace(fs.mkdtempSync(path.join(os.tmpdir(), 'rigmk-')), 'rig', ['rig-brain'])
  const got = resolveBrainSource(home({ 'rig-local': { source: { source: 'directory', path: dir }, installLocation: dir } }), noPlugin)
  assert.ok('marketplace' in got)
  assert.equal(got.marketplace, 'rig')
  assert.equal(got.brainDir, null)
})

test('brain-source: no marketplace lists rig-brain, or the registry is missing or malformed, gives an error and no source', () => {
  const other = marketplace(fs.mkdtempSync(path.join(os.tmpdir(), 'othermk-')), 'other', ['rig'])
  assert.match((resolveBrainSource(home({ other: { source: { source: 'directory', path: other }, installLocation: other } }), noPlugin) as { error: string }).error, /no registered marketplace lists rig-brain/)
  assert.match((resolveBrainSource(home('{not json'), noPlugin) as { error: string }).error, /known_marketplaces\.json/)
  assert.match((resolveBrainSource(fs.mkdtempSync(path.join(os.tmpdir(), 'nohome-')), noPlugin) as { error: string }).error, /known_marketplaces\.json/)
})
