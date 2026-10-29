// The fake model: plays start, plan and build the way the skills do, from the phase's text and fixture files.
import fs from 'node:fs'
import path from 'node:path'
import { must } from '../lib/checks.mjs'

const copy = (sb, files) => files.forEach(f => { fs.mkdirSync(path.dirname(sb.file(f.dest)), { recursive: true }); fs.copyFileSync(f.src, sb.file(f.dest)) })

export function scriptedDriver(sb, phase) {
  const dir = `.rig/changes/${phase.slug}`
  return {
    // /rig:start: a branch, the change folder and its intent.
    async begin() {
      sb.git('checkout', '-q', '-b', `sdlc/${phase.slug}`)
      must(sb.sdlc(['new', phase.slug, '--type', phase.type, '--title', phase.title]), 'new')
      const head = /^---\n[\s\S]*?\n---\n/.exec(sb.read(`${dir}/intent.md`))[0]
      sb.write(`${dir}/intent.md`, `${head}# ${phase.title}\n\n## Intent\n${phase.intent.problem}\n\nDone when: ${phase.intent.outcome}\n\nNot in scope: ${phase.intent.nonGoals}\n\n## Open questions\nnone\n`)
      return phase.slug
    },
    // /rig:start (spec) and /rig:plan.
    async plan() {
      sb.write(`${dir}/spec.md`, phase.spec)
      sb.write(`${dir}/plan.md`, phase.plan)
      copy(sb, phase.contracts ?? [])
    },
    // /rig:build, /rig:test and /rig:pr: red, green, verify, PR.
    async build() {
      copy(sb, phase.tests)
      must(sb.sdlc(['run', '--slug', phase.slug, '--expect-fail', '--', 'npm test']), 'red run')
      copy(sb, phase.impl)
      must(sb.sdlc(['run', '--slug', phase.slug, '--', 'npm test']), 'green run')
      // verify's own contract log, kept apart from the hooks' runs that follow (assert/change.mjs reads it).
      const log = sb.env.CONTRACT_LOG
      if (log) fs.writeFileSync(log, '')
      must(sb.sdlc(['verify', phase.slug]), 'verify')
      if (log) fs.copyFileSync(log, `${log}.verify`)
      must(sb.sdlc(['pr', phase.slug, '--message', phase.commit]), 'pr')
    },
  }
}
