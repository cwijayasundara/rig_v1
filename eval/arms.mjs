// The arms of spec §9: the same shop brief, with and without rig, across model grades and rig's two policies.
export const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

export const ARMS = [
  { id: 'haiku-rig', model: MODELS.haiku, rig: true, policy: 'continuous' },
  { id: 'haiku-bare', model: MODELS.haiku, rig: false },
  { id: 'sonnet-bare', model: MODELS.sonnet, rig: false },
  { id: 'opus-bare', model: MODELS.opus, rig: false },
  { id: 'haiku-rig-arch', model: MODELS.haiku, rig: true, policy: 'continuous', arch: true },
  { id: 'haiku-rig-final', model: MODELS.haiku, rig: true, policy: 'final' },
]

export function armsFrom(arg) {
  if (!arg || arg === 'all') return ARMS
  return arg.split(',').map(id => ARMS.find(a => a.id === id.trim()) ?? (() => { throw new Error(`unknown arm: ${id.trim()} (known: ${ARMS.map(a => a.id).join(', ')})`) })())
}
