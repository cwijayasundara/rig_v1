// One change, start to PR, the way a person drives it (spec 2026-10-16 §8): the model writes intent, spec and plan; the person
// approves; the model builds test-first, verifies and opens the PR. afterApprove lets a phase probe the gate before the build.
export const ANSWER_ROUNDS = 2

export async function runChange(sb, phase, driver, { afterApprove } = {}) {
  const slug = await driver.begin()
  await driver.plan(slug)
  let a = sb.sdlc(['approve', slug], { human: true })
  let answered = 0
  // Open questions are the person's to answer. A live driver stands in for the person and approval is tried again, up to
  // ANSWER_ROUNDS times: answering can raise a new question (the 2026-11-14 eval: the plan review asked a sixth after five were
  // answered). Any other refusal, or one past the last round, stops the run with every open question it lists.
  while (a.status !== 0 && driver.answer && answered < ANSWER_ROUNDS && /open question/.test(a.stderr + a.stdout)) {
    await driver.answer(slug, (a.stderr || a.stdout).trim())
    answered++
    a = sb.sdlc(['approve', slug], { human: true })
  }
  if (a.status !== 0) throw new Error(`approve refused: ${(a.stderr || a.stdout).trim()}`)
  const notes = afterApprove ? await afterApprove(slug) : []
  await driver.build(slug)
  // A live session can end with its last evidence uncommitted; the person commits it.
  if (driver.sessions) sb.commitAll('chore: session leftovers')
  return { slug, notes, answered: answered > 0 }
}
