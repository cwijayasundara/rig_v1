# Clean-context review (Phase 2, item 2.2)

Status: built 2026-10-21 on the maintainer's choice ("fresh agent, diff and intent only"). It changes the code pass of
`docs/superpowers/specs/*native-review*`: `/rig:pr` no longer runs the bundled `/code-review` in the build session; `/security-review` stays native.

## Why

Sources agree a reviewer that sees only the diff and the intent finds more, and a builder that filters findings against the user's
instructions keeps precision up (Cognition: diff-only reviewer plus author triage; Anthropic: separate worker from judge). Whether the
native `/code-review` ran with a clean context was not recorded, and the three evals so far show rig losing to bare on quality, not cost.

## What changed

- `templates/review-brief.md`: the whole prompt of the reviewer, at most 60 lines. Inputs are the delta (`git diff <base>`), intent.md, spec.md,
  plan.md, `CLAUDE.md ## Review` and REVIEW.md. A finding needs a concrete failing input or a spec/contract line, at most 8, no style.
- `skills/pr/SKILL.md`: one `general-purpose` Sonnet agent, foreground, given the brief with `<base>` and `<slug>` filled in and nothing else.
  Then the builder triages: fix, or dismiss with a reason that cites a spec line, a non-goal or code read. Security and contract findings are
  never dismissed by the builder. Dismissals go under `## Dismissed` with no `[category:]` tag, so `learn mine` counts kept findings only.

## Not decided here

- The proposal's eval (findings resolved rate and false-positive rate against a same-context review) is not run. It needs live runs and a set of
  changes with known defects; the cheapest honest version seeds a known defect into a few finished changes and counts what each reviewer finds.
- Precision tuning beyond the brief's rules (Cognition tuned a confidence threshold): wait for data.
