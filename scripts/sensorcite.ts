// A behaviour that only says a check the sensors already run stays clean ends its line with [sensor: lint, types]: it is traced by
// those blocking sensors and needs no test. A cited id that is not a blocking sensor of the registry is a finding, never a pass.
import { section, type Finding } from './model.ts'
import type { RegistrySensor } from './registry.ts'

const MARK = /\[sensor:\s*([^\]]*)\]\s*[.;]?\s*$/i

// Per B-id of the Behaviours section: the sensors a trailing marker cites, split into those that block and those that do not.
export function sensorCites(spec: string, sensors: Pick<RegistrySensor, 'id' | 'blocks'>[], ids: string[] = []): { traced: string[]; rest: string[]; findings: Finding[] } {
  const traced: string[] = [], findings: Finding[] = []
  for (const line of section(spec, 'Behaviours').split('\n')) {
    const id = /\bB\d+\b/.exec(line)?.[0], m = MARK.exec(line.trimEnd())
    if (!id || !m) continue
    const cited = m[1]!.split(',').map(s => s.trim()).filter(Boolean)
    const unknown = cited.filter(c => !sensors.some(s => s.id === c && s.blocks))
    if (cited.length && !unknown.length) traced.push(id)
    else findings.push({ sensor: 'traceability', severity: 'block', message: `${id} cites [sensor: ${(cited.length ? unknown : ['none named']).join(', ')}], which is not a blocking sensor in .rig/sensors.json`, fix: 'name sensors that exist with blocks true, or write a test that names the behaviour' })
  }
  return { traced, rest: ids.filter(id => !traced.includes(id)), findings }
}
