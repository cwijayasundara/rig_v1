// The start path router (spec 2026-11-04 task-router): which way /rig:start takes a free-text request. The model proposes a
// change type; this check decides whether the quick path (no brainstorm, no question batch) is allowed. It only narrows:
// any doubt is 'full', and nothing here touches approval, the red/green proof or the final gate.
import { TYPES } from './lifecycle.ts'

export type Route = { path: 'quick' | 'full'; type: string; reasons: string[] }

const MAX_REQUEST = 600
// Fail-closed lists: a bugfix is quick only on a positive symptom verb (a noun like "error messages", a backticked name, a quoted
// label or a status number alone is not one), and a refactor only on a structural verb with no new-behaviour stem.
const SYMPTOM = /\b(throws?|thrown|throwing|fails?|failed|failing|crash\w*|wrong|incorrect|regress\w*|errors? out|returns? (?:undefined|null|NaN)|(?:is|are|was) (?:undefined|null|NaN)|(?:returns?|responds? with|gets?|got) (?:an? )?[45]\d\d)\b/i
const NEGATED_SYMPTOM = /(?:\bnever|\bnot|\bno longer|n't|\bcannot)\s+(?:\w+\s+){0,2}?(?:throw\w*|fail\w*|crash\w*)\b/i
const NEW_BEHAVIOUR = /\b(add\w*|new|support\w*|allow\w*|enabl\w*|introduc\w*|also|implement\w*|handl\w*|accept\w*|extend\w*|options?|plus|creat\w*|feature\w*|flags?)\b/i
const STRUCTURAL = /\b(extract|rename|move|inline|split|merge|dedupe|deduplicate|reorgani[sz]e|restructure|simplify|consolidate|replace)\b/i

export function routeCheck(type: string, request: string, opts: { noRoute?: boolean } = {}): Route {
  const full = (reason: string): Route => ({ path: 'full', type, reasons: [reason] })
  if (opts.noRoute) return full('routing skipped (--no-route)')
  if (!(TYPES as readonly string[]).includes(type)) return full(`unknown type ${type}`)
  if (type === 'feature' || type === 'chore') return full(`${type} takes the full conversation`)
  if (request.length > MAX_REQUEST) return full(`request over ${MAX_REQUEST} characters`)
  if (type === 'bugfix') {
    if (!SYMPTOM.test(request)) return full('no symptom named')
    return NEGATED_SYMPTOM.test(request) ? full('negated symptom') : { path: 'quick', type, reasons: ['bugfix names a symptom'] }
  }
  const word = NEW_BEHAVIOUR.exec(request)?.[1]
  if (word) return full(`mentions new behaviour: ${word.toLowerCase()}`)
  return STRUCTURAL.test(request) ? { path: 'quick', type, reasons: ['refactor names no new behaviour'] } : full('no structural verb named')
}
