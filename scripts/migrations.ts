// rig:upgrade migrations: numbered, idempotent steps for changes a file copy cannot make. Each takes the repo root.
import fs from 'node:fs'
import path from 'node:path'
import { isRegistryShape } from './registry.ts'
import { detectedPackText } from './stackinit.ts'

export type Migration = { id: string; since: string; run: (root: string) => string[] }

// Writes the detected pack's registry beside an old-shape sensors.json, for review. Never touches sensors.json itself.
const preRegistrySensors: Migration = {
  id: 'pre-registry-sensors',
  since: '0.6.0', // the plugin version this migration ships in (.claude-plugin/plugin.json)
  run(root) {
    const file = path.join(root, '.rig', 'sensors.json')
    if (!fs.existsSync(file) || isRegistryShape(fs.readFileSync(file, 'utf8'))) return []
    const text = detectedPackText(root)
    if (text === null) return ['.rig/sensors.json uses the pre-registry format and no stack pack matches this repo; write a registry yourself (see init --stack)']
    fs.writeFileSync(`${file}.rig-new`, text + '\n')
    return ['.rig/sensors.json uses the pre-registry format: proposed registry written to .rig/sensors.json.rig-new; review it, adjust the commands, and land it as a harness change']
  },
}

export const MIGRATIONS: Migration[] = [preRegistrySensors]

const parts = (v: string): number[] => (v || '0.0.0').split('.').map(n => parseInt(n, 10) || 0)
const cmp = (a: string, b: string): number => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

export const pendingMigrations = (installed: string, next: string): Migration[] => MIGRATIONS.filter(m => cmp(installed, m.since) < 0 && cmp(m.since, next) <= 0)

export const runMigrations = (list: Migration[], root: string): string[] => list.flatMap(m => m.run(root))
