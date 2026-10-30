// A live run takes tens of minutes; a laptop that sleeps in the middle kills the session mid-response and the run is lost.
// On macOS, hold the machine awake for as long as this process lives (`caffeinate -w <pid>` exits with it). Once per process.
import { spawn } from 'node:child_process'

let held = false
export function keepAwake({ platform = process.platform, start = spawn, pid = process.pid } = {}) {
  if (held || platform !== 'darwin') return false
  held = true
  try {
    const child = start('caffeinate', ['-ims', '-w', String(pid)], { stdio: 'ignore', detached: true })
    child.on?.('error', () => {}) // no caffeinate on PATH: the run goes on, asleep-able
    child.unref?.()
    return true
  } catch { return false }
}
export const resetAwake = () => { held = false }
