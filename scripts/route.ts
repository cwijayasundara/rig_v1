// The start path router (spec 2026-11-04 task-router): which way /rig:start takes a free-text request. The model proposes a
// change type; this check decides whether the quick path (no brainstorm, no question batch) is allowed. It only narrows:
// any doubt is 'full', and nothing here touches approval, the red/green proof or the final gate.
import { TYPES } from './lifecycle.ts'

export type Route = { path: 'quick' | 'full'; type: string; reasons: string[] }

const MAX_REQUEST = 600
const SYMPTOM = /\b(errors?|exceptions?|throws?|thrown|fails?|failing|failed|crash\w*|wrong|incorrect|instead|undefined|null|NaN|regress\w*)\b|`[^`]+`|"[^"]+"|\b[45]\d\d\b/i
const NEW_BEHAVIOUR = /\b(add|adds|new|support|supports|allow|allows|enable|introduce|also)\b/i

export function routeCheck(type: string, request: string, opts: { noRoute?: boolean } = {}): Route {
  const full = (reason: string): Route => ({ path: 'full', type, reasons: [reason] })
  if (opts.noRoute) return full('routing skipped (--no-route)')
  if (!(TYPES as readonly string[]).includes(type)) return full(`unknown type ${type}`)
  if (type === 'feature' || type === 'chore') return full(`${type} takes the full conversation`)
  if (request.length > MAX_REQUEST) return full(`request over ${MAX_REQUEST} characters`)
  if (type === 'bugfix') {
    return SYMPTOM.test(request) ? { path: 'quick', type, reasons: ['bugfix names a symptom'] } : full('no symptom named')
  }
  const word = NEW_BEHAVIOUR.exec(request)?.[1]
  return word ? full(`mentions new behaviour: ${word.toLowerCase()}`) : { path: 'quick', type, reasons: ['refactor names no new behaviour'] }
}
