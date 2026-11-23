// Facts read off one stream-json transcript of a live session, for the live loop test (loops-live.mjs). Pure: no model, no disk.
// A session may run its tools directly or, in Code Mode, from scripts given to one REPL tool; both are counted.
const count = (text, re) => [...String(text ?? '').matchAll(re)].length

export function transcriptFacts(text, skills) {
  const hyphen = new RegExp(`/rig-(?:${skills.join('|')})\\b`, 'g')
  const f = { questions: 0, launches: 0, hyphen: [], skills: [], goal: [] }
  for (const line of String(text).split('\n')) {
    let e
    try { e = JSON.parse(line) } catch { continue }
    const blocks = Array.isArray(e?.message?.content) ? e.message.content : []
    for (const b of blocks) {
      if (b.type === 'tool_use') {
        const code = b.name === 'REPL' ? b.input?.code : ''
        f.questions += b.name === 'AskUserQuestion' ? 1 : count(code, /\bAskUserQuestion\s*\(/g)
        // A launch by the main thread only: a subagent's own tool calls carry the id of the call that started it.
        if (!e.parent_tool_use_id) f.launches += b.name === 'Agent' || b.name === 'Task' ? 1 : count(code, /\bAgent\s*\(/g)
        if (b.name === 'Skill') f.skills.push(String(b.input?.skill ?? ''))
      }
      if (e.type === 'assistant' && b.type === 'text') f.hyphen.push(...(b.text.match(hyphen) ?? []))
      if (b.type === 'tool_result') f.goal.push(...(JSON.stringify(b.content ?? '').match(/chart-\d+ goal: (?:MET|NOT MET)/g) ?? []))
    }
  }
  return f
}

// The numbered or bulleted items under "## Findings" of a chart-review.md.
export const findingCount = review => (/^## Findings\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(String(review))?.[1] ?? '').split('\n').filter(l => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(l)).length
