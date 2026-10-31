// What each npm script runs. A leg is a run of stages, optionally started from the recorded snapshot of an earlier stage.
// fast: the build of one intent, greenfield then brownfield, each from an approved chart (the charts are what take the time).
// chart: init and the sprint 1 chart, then the sprint 2 chart on a recorded built sprint 1.
// full: the whole journey from nothing, which is also how the snapshots are recorded.
const ALL = ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6']
export const MODES = {
  fast: { legs: [{ seed: 'J2', stages: ['J3'] }, { seed: 'J5', stages: ['J6'] }], minutes: 20, intents: 1 },
  chart: { legs: [{ seed: null, stages: ['J0', 'J1', 'J2'] }, { seed: 'J3', stages: ['J4', 'J5'] }], minutes: 30, intents: 1 },
  full: { legs: [{ seed: null, stages: ALL }], minutes: 70, intents: Infinity },
}
// The snapshots a full run must record for the other modes to start from.
export const SEEDS = ['J2', 'J3', 'J5']
export const legStages = (all, ids) => all.filter(s => ids.includes(s.id))
