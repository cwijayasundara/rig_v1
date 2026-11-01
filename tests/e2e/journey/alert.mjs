// What the person sees when a journey ends: one screen, a bell and a notification when something new is wrong.
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export function summarise(log, { stages = [], costUsd = 0, minutes = 0 } = {}) {
  const open = log.open()
  const sev = s => open.filter(v => v.severity === s).length
  const table = stages.map(s => `  ${s.stage}: ${s.status}`).join('\n')
  const top = open.slice(0, 5).map(v => `  ${v.id} (${v.severity}) ${v.note}\n    ${v.evidence}`).join('\n')
  return [
    `journey: ${open.length} open violation(s) (${sev('block')} block, ${sev('warn')} warn), ${log.accepted().length} accepted`,
    table,
    `spend $${costUsd.toFixed(2)}, ${minutes.toFixed(1)} min`,
    top,
    `details: ${path.join(log.dir, 'violations.md')}`,
  ].filter(Boolean).join('\n')
}

const notifyMac = text => {
  if (process.platform === 'darwin') spawnSync('osascript', ['-e', `display notification ${JSON.stringify(text)} with title "rig journey"`])
}

// Exit code for the run: 0 when nothing open, else 1 with a bell and a notification.
export function alert(log, { notify = notifyMac, bell = () => process.stdout.write('\x07'), print = console.log, summary } = {}) {
  const open = log.open()
  print(summary ?? summarise(log))
  if (open.length === 0) return 0
  bell()
  notify(`${open.length} open violation(s): ${open[0].id}`)
  return 1
}
