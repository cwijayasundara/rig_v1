// A command sensor's finding is filed as sensor `commands`, with its registry id leading the message ("unit failed (exit 1): …").
export const sensorOf = f => (f.sensor === 'commands' ? /^(\S+) (?:failed|not run)/.exec(f.message ?? '')?.[1] ?? 'commands' : f.sensor)
