// What /rig:init does for each test script the baseline names as run by no sensor: a ci-cadence command sensor (ship runs it, the
// baseline does not, so it never goes into knownRed). The stand-in onboarding of an eval does the same, or ship blocks on test-scripts.
export function withScriptSensors(text, names) {
  const reg = JSON.parse(text)
  reg.sensors = [...reg.sensors, ...names.map(n => ({ id: `script-${n.replace(/[^a-z0-9]+/gi, '-')}`, cmd: `npm run ${n}`, cadence: 'ci', blocks: true, count: 'exit', guide: `The ${n} script passes; fix the code, never the tests.` }))]
  return JSON.stringify(reg, null, 2) + '\n'
}
