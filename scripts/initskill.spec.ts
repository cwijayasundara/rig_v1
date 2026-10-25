// The init skill tells a model how to write .rig/sensors.json; what it shows must be what the harness's own parser accepts.
// A live run wrote `fast`/`full` as strings (as the skill said), and the ship gate then refused every change.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const skill = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/init/SKILL.md'), 'utf8')

test('init skill: never says fast/full are plain command strings', () => {
  assert.doesNotMatch(skill, /`fast`\/`full` command strings/)
})

test('init skill: a Node scaffold uses `node --test` with no directory argument (Node 24 treats `test/` as a module path)', () => {
  assert.match(skill, /`node --test`[^.]*no directory argument/)
  assert.doesNotMatch(skill, /node --test test\//)
})

test('init skill: no marketplace registration or mod is left (step 4a deleted the mod)', () => {
  assert.doesNotMatch(skill, /marketplace add|\.rig\/mod|rig-review|\.claude-plugin\//)
})

test('init skill: writes rig docs into README.md between markers, brownfield in place and greenfield new', () => {
  const tpl = fs.readFileSync(path.resolve(import.meta.dirname, '../templates/readme-rig.md'), 'utf8')
  assert.match(skill, /templates\/readme-rig\.md/)
  assert.match(skill, /\*\*Brownfield:\*\* keep the existing `README\.md`/)
  assert.match(skill, /\*\*Greenfield:\*\* create `README\.md`/)
  assert.match(tpl, /^<!-- rig:begin/)
  assert.match(tpl.trimEnd(), /<!-- rig:end -->$/)
  assert.match(tpl, /### Architecture/)
  assert.match(tpl, /### User guide/)
  assert.match(tpl, /### Layout/)
  for (const dir of ['.claude/skills/', '.claude/agents/', '.rig/bin/', '.rig/mod/', '.rig/githooks/', '.rig/guides/', '.rig/templates/', '.rig/product/', '.rig/changes/']) assert.ok(tpl.includes(`| \`${dir}`), `layout map lists ${dir}`)
  assert.doesNotMatch(tpl, /\{\{P\}\}|\/rig-(start|next|approve|waive|status)\b/, 'skills are /rig:x in every install mode')
  assert.doesNotMatch(tpl, /\{\{BRAIN\}\}/)
})

test('init skill: pins Sonnet in its frontmatter, so an Opus session does not run init', () => {
  assert.match(skill, /^---\n[\s\S]*?\nmodel: sonnet\n[\s\S]*?\n---/)
  assert.doesNotMatch(skill, /Model check/)
})

test('init skill: the baseline runs through `sdlc.ts baseline`, never `run` or `quality` (both need a change, and init has none)', () => {
  assert.match(skill, /sdlc\.ts baseline/)
  assert.doesNotMatch(skill, /through `sdlc\.ts run`|sdlc\.ts quality <first-change-slug>/)
})

test('init skill: never tells the model to write `/rig-start`, and runs no preflight', () => {
  assert.doesNotMatch(skill, /names its skills `rig-\*`|`\/rig-` for a standalone/)
  assert.doesNotMatch(skill, /preflight|valueRate/)
})

test('init skill: allowed-tools grants the scaffold commands init itself instructs (git, npm, node, make), and no blanket ones', () => {
  const tools = /^allowed-tools: (.*)$/m.exec(skill)?.[1] ?? ''
  for (const t of ['Bash(git init*)', 'Bash(git add *)', 'Bash(git commit *)', 'Bash(git remote*)', 'Bash(npm test*)', 'Bash(node --test*)', 'Bash(node --check *)', 'Bash(make test*)']) assert.ok(tools.includes(t), `allowed-tools is missing ${t}: ${tools}`)
  for (const t of ['Bash(git *)', 'Bash(npm *)', 'Bash(node *)', 'Bash(make *)']) assert.ok(!tools.includes(t), `allowed-tools grants ${t}, which runs any code unprompted: ${tools}`)
})

test('init skill: one command per Bash call, so unattended runs are not denied on compound commands', () => {
  assert.match(skill, /its own Bash call \(no `cd`, pipes, redirects, `&&`/)
})

test('init skill: the greenfield lint script never writes helper files under .rig/', () => {
  assert.match(skill, /never write scaffold helper files under `\.rig\/`/)
})

test('init skill: --quick is the no-question fast lane that turns on workflows', () => {
  assert.match(skill, /argument-hint: '\[--quick \| --defaults\]/)
  const mode = /## `--quick` mode\n([\s\S]*?)\n## /.exec(skill)?.[1] ?? ''
  assert.match(mode, /no AskUserQuestion at all/)
  assert.match(mode, /`--workflows`[^\n]*only when `git remote get-url origin` succeeds/)
  assert.doesNotMatch(mode, /claude plugin install|~\/\.claude\/settings/)
})

test('init skill: greenfield and PRD repos are sent to /rig:chart 0 first, a one-off change to /rig:start', () => {
  const tpl = fs.readFileSync(path.resolve(import.meta.dirname, '../templates/readme-rig.md'), 'utf8')
  assert.match(skill, /Greenfield, or any repo with a PRD[^\n]*`Next: \/rig:chart 0 @docs\/prd\/sprint-0\.md`/)
  assert.match(skill, /docs\/prd\/sprint-0\.md/)
  assert.match(skill, /One-off change with no PRD[^\n]*\/rig:start/)
  assert.match(tpl, /\/rig:chart 0/)
  assert.match(tpl, /docs\/prd\/sprint-0\.md/)
})

test('init skill: a greenfield CLAUDE.md maps only files that exist on disk, PRD design is marked planned', () => {
  assert.match(skill, /only files that exist on disk/)
  assert.match(skill, /Planned \(from the PRD\)/)
})

test('init skill: --quick and --defaults end by telling the person the commit command, since they ask no question', () => {
  assert.match(skill, /Under `--defaults` and `--quick` do not commit[^\n]*`git add /)
})

test('init skill: only brownfield runs wiki init; greenfield and Both never do (2026-10-25 shop_app greenfield got a wiki.json)', () => {
  const brownfield = skill.slice(skill.indexOf('## Brownfield'), skill.indexOf('## Greenfield'))
  const rest = skill.slice(skill.indexOf('## Greenfield'))
  assert.match(brownfield, /sdlc\.ts wiki init/)
  assert.doesNotMatch(rest, /sdlc\.ts wiki init/)
})

test('init skill: the README block comes from the vendored template, which carries the standalone /rig-x names', () => {
  assert.match(skill, /from `\.rig\/templates\/readme-rig\.md`/)
  assert.match(skill, /write them as `\/rig-start`/)
})

test('init skill: the 2026-10-25 shop_app --quick run gaps are closed in the text', () => {
  // The model wrote README.md with `{ printf; cat; } > README.md`, declared cart.cli:main with no cli.py, put PRD rules under
  // Conventions, ran wiki init on greenfield, left the --quick commit on master and was told to chart a sprint-0.md that did not exist.
  assert.match(skill, /write them with Write \(never a redirect, `printf` or heredoc\)/)
  assert.match(skill, /Every entry point the manifest declares[^\n]*exists and the smoke test runs it/)
  assert.match(skill, /Conventions and Gotchas describe only files that exist on disk after the scaffold and the rules that code already follows/)
  const greenfield = skill.slice(skill.indexOf('## Greenfield'), skill.indexOf('## Both'))
  assert.match(greenfield, /Skip the Brownfield \*\*Wiki\*\* step/)
  assert.match(skill, /Under `--defaults` and `--quick` do not commit[^\n]*`git branch -m main` first when the repo has no commits and is not on `main`/)
  assert.match(skill, /docs\/prd\/sprint-<n>-<title>\.md`[^\n]*`Next: \/rig:chart 1 @docs\/prd\/sprint-1-cart\.md`/)
})
