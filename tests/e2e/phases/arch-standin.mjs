// W2 N3 through the CLI: an architecture whose Integrations table lists an external dependency with no stand-in is a blocking
// `arch-standin` finding of `chart check`; naming the stand-in, the live switch and an ADR that exists clears it.
import { json } from '../lib/checks.mjs'

const HEAD = '| Dependency | Kind | Contract | Stand-in | Live switch | ADR |\n|---|---|---|---|---|---|\n'
const ADR = '.rig/product/adr/0001-llm-stand-in.md'

// `arch` is the architecture.md the chart carries; the Integrations section is added to it (or replaces the one it has).
export async function archStandinChecks(c, sb, id, arch, dependency = 'llm-provider') {
  const withRows = rows => `${arch.replace(/\n## Integrations[\s\S]*?(?=\n## |$)/, '')}\n## Integrations\n\n${HEAD}${rows}\n`
  const found = () => (json(sb.sdlc(['chart', 'check', '1', '--json']).stdout) ?? []).filter(f => f.rule === 'arch-standin')
  sb.write('.rig/product/architecture.md', withRows(`| ${dependency} | external | api/${dependency}.yaml |  | - | - |`))
  const bad = found()
  await c.check(`${id}: an external Integrations row with no stand-in blocks with arch-standin`, () => (bad.length >= 2 && bad.every(f => f.severity === 'block') && bad.some(f => /Stand-in/.test(f.message))) || JSON.stringify(bad))
  sb.write(ADR, '# ADR-0001: the LLM provider runs on a recorded stand-in\n\nStatus: accepted\n')
  sb.write('.rig/product/architecture.md', withRows(`| ${dependency} | external | api/${dependency}.yaml | recorded (tests/fakes/${dependency}) | LLM_LIVE=1 | ADR-0001 |`))
  const good = found()
  await c.check(`${id}: a stand-in, a live switch and an existing ADR clear arch-standin`, () => good.length === 0 || JSON.stringify(good))
}
