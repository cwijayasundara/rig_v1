# Goal

Build a production-ready harness for Claude Code.

## Constraints (set by the person, 2026-10-17)

- **A very thin layer on top of Claude Code.** Claude Code already writes code well; the harness does not compete with it.
- **Fall back to native Claude Code wherever possible** (<https://code.claude.com/docs/en/overview>): plan mode, skills, subagents,
  hooks, plugins, memory, GitHub Actions, `/code-review`. A rig feature that a native one now covers is a candidate for removal.
- **Do not prune capability for the sake of size.** Cut a feature only when a native one covers it or a measurement shows no lift.

## Scope the harness must cover

1. **Inner loop (one change):** guides and sensors steer the agent; contracts frozen at plan approval; human gates.
2. **Outer loop (a sprint):** a human architect and BA turn a large PRD into a list of smaller intents (with dependencies), an
   architecture and design for the sprint, and the testing artefacts (test plan, test cases, test data), traced back to the PRD.
3. **Code wiki:** a self-updating, DeepWiki-style map of the codebase (was `brain/code_wiki`). `init` on an existing codebase
   indexes it (cf. <https://docs.devin.ai/onboard-devin/index-repo>), and the index is kept up to date when code changes.
4. **Learning loop:** the harness improves from what it learns, "dream"-style memory and rule proposals (was `brain/memory`).
5. **Evaluation:** a measurement that shows each part lifts a model; a part that shows no lift is a candidate for removal.

## Sources to learn from

- Fowler: *Are harnesses worth the cost?*, *Harness engineering*, *Sensors for coding agents*.
- Devin: DeepWiki, Memory. Other production harnesses around Claude Code and coding agents.

## Status

Research phase. Findings: `docs/research/2026-10-17-*.md`. Next: a spec, then a plan.
