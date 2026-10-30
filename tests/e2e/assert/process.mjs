// What the sessions did, read from `claude -p --output-format stream-json --verbose` transcripts: cost, turns, permission
// denials, errors, and every skill and agent the model invoked.
import fs from 'node:fs'

export function readSession(file) {
  const s = { file, costUsd: 0, turns: 0, ms: 0, isError: true, denials: [], skills: [], agents: [], ended: false, inputTokens: 0, outputTokens: 0, models: {} }
  if (!fs.existsSync(file)) return s
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (ev.type === 'assistant') {
      for (const c of ev.message?.content ?? []) {
        if (c.type !== 'tool_use') continue
        if (c.name === 'Skill') s.skills.push(String(c.input?.skill ?? c.input?.command ?? ''))
        if (c.name === 'Agent' || c.name === 'Task') s.agents.push(String(c.input?.subagent_type ?? 'general-purpose'))
      }
    }
    if (ev.type === 'result') {
      s.ended = true
      s.costUsd = ev.total_cost_usd ?? 0
      s.turns = ev.num_turns ?? 0
      s.ms = ev.duration_ms ?? 0
      s.isError = Boolean(ev.is_error)
      s.denials = ev.permission_denials ?? []
      // modelUsage covers every model the session used, subagents included; usage alone is the main thread's.
      const mu = ev.modelUsage && typeof ev.modelUsage === 'object' ? ev.modelUsage : null
      if (mu) {
        s.models = Object.fromEntries(Object.entries(mu).map(([m, v]) => [m, { inputTokens: (v.inputTokens ?? 0) + (v.cacheReadInputTokens ?? 0) + (v.cacheCreationInputTokens ?? 0), outputTokens: v.outputTokens ?? 0, costUsd: v.costUSD ?? 0 }]))
        s.inputTokens = Object.values(s.models).reduce((n, v) => n + v.inputTokens, 0)
        s.outputTokens = Object.values(s.models).reduce((n, v) => n + v.outputTokens, 0)
      } else {
        const u = ev.usage ?? {}
        s.inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
        s.outputTokens = u.output_tokens ?? 0
      }
      s.running = { costUsd: s.costUsd, models: s.models }
    }
  }
  return s
}

// `claude -p --continue` resumes the previous conversation, and its result event reports that conversation's running cost and
// per-model usage, not what this call added. Take the previous session's running figures off, so summing sessions counts each
// dollar and token once. A figure below the previous one means the conversation restarted: count it whole.
export function sinceSession(s, prev) {
  const before = prev?.running
  if (!s.running || !before || s.costUsd < before.costUsd) return s
  const perModel = Object.keys(s.models).length > 0
  const models = Object.fromEntries(Object.entries(s.models).map(([m, v]) => {
    const p = before.models[m] ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
    return [m, { inputTokens: Math.max(0, v.inputTokens - p.inputTokens), outputTokens: Math.max(0, v.outputTokens - p.outputTokens), costUsd: Number(Math.max(0, v.costUsd - p.costUsd).toFixed(6)) }]
  }))
  return {
    ...s, models,
    costUsd: s.costUsd - before.costUsd,
    ...(perModel && { inputTokens: Object.values(models).reduce((n, v) => n + v.inputTokens, 0), outputTokens: Object.values(models).reduce((n, v) => n + v.outputTokens, 0) }),
  }
}

export const totals = sessions => ({
  costUsd: sessions.reduce((n, s) => n + s.costUsd, 0),
  turns: sessions.reduce((n, s) => n + s.turns, 0),
  ms: sessions.reduce((n, s) => n + s.ms, 0),
  inputTokens: sessions.reduce((n, s) => n + (s.inputTokens ?? 0), 0),
  outputTokens: sessions.reduce((n, s) => n + (s.outputTokens ?? 0), 0),
  models: sessions.reduce((acc, s) => {
    for (const [m, v] of Object.entries(s.models ?? {})) {
      const a = (acc[m] ??= { inputTokens: 0, outputTokens: 0, costUsd: 0 })
      a.inputTokens += v.inputTokens; a.outputTokens += v.outputTokens; a.costUsd = Number((a.costUsd + v.costUsd).toFixed(6))
    }
    return acc
  }, {}),
  denials: sessions.flatMap(s => s.denials),
})

// rig's skills are rig-* in a standalone repo and rig:* from the plugin, and its stages call two built-ins (pr-review runs
// code-review; security-review where a stage names it). Anything else means a plugin leaked into the run.
const RIG_SKILL = /^(?:rig[-:]|code-review$|security-review$)/

export async function assertProcess(c, sessions, { label = 'phase' } = {}) {
  await c.check(`${label}: every session ran to a result`, () =>
    (sessions.length > 0 && sessions.every(s => s.ended)) || sessions.filter(s => !s.ended).map(s => s.file).join(', ') || 'no sessions')
  await c.check(`${label}: no session ended in error`, () => sessions.every(s => !s.isError) || sessions.filter(s => s.isError).map(s => s.file).join(', '))
  await c.check(`${label}: 0 permission denials`, () => {
    const d = totals(sessions).denials
    return d.length === 0 || d.map(x => `${x.tool_name}: ${JSON.stringify(x.tool_input).slice(0, 120)}`).join(' | ')
  })
  await c.check(`${label}: only rig skills invoked`, () => {
    const other = sessions.flatMap(s => s.skills).filter(n => !RIG_SKILL.test(n))
    return other.length === 0 || [...new Set(other)].join(', ')
  })
  await c.check(`${label}: no skill-load fallbacks`, () => {
    const hit = sessions.filter(s => fs.existsSync(s.file) && /skill-load-failed/.test(fs.readFileSync(s.file, 'utf8')))
    return hit.length === 0 || hit.map(s => s.file).join(', ')
  })
}
