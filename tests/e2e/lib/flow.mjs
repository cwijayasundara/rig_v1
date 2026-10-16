// One change, start to PR, the way a person drives it (spec 2026-10-16 §8): the model writes intent, spec and plan; the person
// approves; the model builds test-first, verifies and opens the PR. afterApprove lets a phase probe the gate before the build.
export async function runChange(sb, phase, driver, { afterApprove } = {}) {
  const slug = await driver.begin()
  await driver.plan(slug)
  const a = sb.sdlc(['approve', slug], { human: true })
  if (a.status !== 0) throw new Error(`approve refused: ${(a.stderr || a.stdout).trim().split('\n')[0]}`)
  const notes = afterApprove ? await afterApprove(slug) : []
  await driver.build(slug)
  // A live session can end with its last evidence uncommitted; the person commits it.
  if (driver.sessions) sb.commitAll('chore: session leftovers')
  return { slug, notes }
}
