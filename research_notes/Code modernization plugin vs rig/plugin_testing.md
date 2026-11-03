# Testing, evaluation and automation of the Anthropic `code-modernization` plugin

Method: shallow-cloned anthropics/claude-plugins-official (HEAD a2e251d9, 2026-11-03) and read files, `git log` and PRs via `gh`; read Anthropic docs pages. Repo links: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-modernization . Local clone (scratch): /private/tmp/claude-501/-Users-chamindawijayasundara-Documents-learning-101-rig-v1/fa6938cc-b460-4e28-bd28-c7276ae19d2c/scratchpad/cpo/repo

## 1. What test, eval, fixture and script assets does plugins/code-modernization contain?

### Takeaway
It ships two real automated test suites, but both test the plugin's own code (Python scripts and the TypeScript "pane" hooks), not the prompts/commands/agents. It has no `evals/` directory, no legacy sample apps and no fixture codebases in-repo. The end-to-end validation (COBOL, Java etc. runs) is documented only as prose in the README.

### Cited Findings
- Python script tests: `plugins/code-modernization/scripts/tests/` has 7 files (4,490 lines; `def test_` counts 15/44/4/140/47/12/66 = 328): `test_proof_tools.py` (1993 lines), `test_report_tools.py`, `test_telemetry.py`, `test_proof_rules_run.py`, `test_compare_tolerance.py`, `test_rules_tools.py`, `test_report_next.py`. They use stdlib `unittest`; header of `test_compare_tolerance.py` gives the run command `python3 -m unittest discover -s plugins/code-modernization/scripts/tests`. They exercise the scripts `proof_pack.py`, `compare.py`, `baseline_diff.py`, `trace_rules.py`, `build_report.py`, `render_rules.py`, `make_shards.py`, `telemetry.py`. — [scripts/tests](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-modernization/scripts/tests)
- TypeScript pane/hook tests: `plugins/code-modernization/tests/` has 6 `*.test.ts` files (`logic`, `register`, `stacks`, `verification`, `mount`, `hostile`; ~2,400 lines) plus `tests/fixtures/{inputs,stacks,workspace,world}.ts` (in-memory fake workspaces and fake terminals, not real codebases). They import `describe/test/expect/mock` from `claude-code/testing` (the Claude Code engine's own test kit). `hooks/README.md` says: "its tests run on the engine's own test kit (`claude plugin test .`)". — [tests](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-modernization/tests), [hooks/README.md](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/hooks/README.md)
- What the TS tests check: parsers of the plugin's own artifacts (rules, topology, brief, baseline, VERIFICATION.json) against forged/garbage input (`verification.test.ts`: "only the three exact words are verdicts: a forged or padded one is dropped"); pane never draws more rows than it has; `hostile.test.ts` feeds 100,000-char lines (spaces, hashes, headings) to every reader to prove no regex backtracking freeze; `mount.test.ts` checks the terminal accepts the UI element tree; `stacks.test.ts` uses in-memory fixtures for Maven uplift, PHP shop, .NET solution, Python big tree, greenfield reimagine, symlinked legacy tree; `register.test.ts` checks hook registration, prompt context, sign-off dialog. — same tests dir
- `tsconfig.json` (strict, `noUncheckedIndexedAccess`, include `hooks`, `tests`) supports a `tsc` typecheck; no package.json in the plugin. — [tsconfig.json](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/tsconfig.json)
- Verification scripts that the plugin runs on user projects (product features, not tests of the plugin): `proof_pack.py` (computes PROVEN / PARTLY PROVEN / NOT PROVEN per module), `compare.py` (byte-for-byte old vs new output comparison, masks listed, tolerance for floats, "checks it can fail"), `baseline_diff.py` (parses JUnit/TRX/runner logs for Maven/Gradle, cargo, pytest, unittest, go test, dotnet, jest, vitest, ctest, phpunit), `trace_rules.py` (traces P0 rules to tests that named them and that ran), `uplift_checks.py`, `build_report.py` (offline REPORT.html). — [scripts/](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-modernization/scripts)
- Workflows `workflows/{extract-rules,harden-scan,portfolio-assess,reimagine-scaffold,uplift-deltas,uplift-migrate}.js` encode loops/referees (e.g. PR #2536: loop-until-dry extraction, citation referee per rule, two-judge panel per P0 rule, refuter per security finding). No test files for these are in the repo; PR #3869 says `uplift-migrate.js` was executed "under node with the workflow globals stubbed: 75 assertions" but that harness is not committed. — [PR 3869](https://github.com/anthropics/claude-plugins-official/pull/3869), [PR 2536](https://github.com/anthropics/claude-plugins-official/pull/2536)
- Not present (verified by `find`): no `evals/` dir in code-modernization (the only `evals` dir in the repo is `plugins/math-olympiad/skills/math-olympiad/evals/trigger_eval.json`); no legacy sample apps, no COBOL/Java fixture trees, no golden outputs. Assets are only screenshots/GIF/mermaid/report template.

### Inferences
- The "303 script tests / 143 pane tests" in PR #6309 map to the two suites above (current count 328 `def test_` is higher after later commits, e.g. c8874f5a). The stated numbers cannot be reproduced from PR text alone; I did not run the suites.
- Plugin prose (commands/*.md, agents/*.md) quality is validated only by live headless runs, not by any committed regression suite.

### Gaps
- I did not execute the tests; pass status is only from PR body claims.
- Whether the Python tests run in any CI: no workflow in the repo runs them (see section 2).

## 2. What CI in claude-plugins-official validates plugins?

### Takeaway
CI is marketplace-level policy and schema gating (validate, frontmatter, licences, MCP URL liveness, a Claude-driven security/privacy policy scan, SHA bump automation). None of it runs a plugin's own unit tests or evals.

### Cited Findings
- `.github/workflows/` contains 9 workflows: `validate-plugins.yml`, `validate-frontmatter.yml`, `validate-licenses.yml`, `check-mcp-urls.yml`, `scan-plugins.yml`, `bump-plugin-shas.yml`, `revert-failed-bumps.yml`, `close-external-prs.yml`, `external-pr-scope-guard.yml`. — [.github/workflows](https://github.com/anthropics/claude-plugins-official/tree/main/.github/workflows)
- `validate-plugins.yml` (job `validate`, required check): uses composite action `anthropics/claude-plugins-community/.github/actions/validate-plugins@426e469...` with `marketplace-path: .claude-plugin/marketplace.json`, `claude-cli-version: latest`, `warn-invariants: "I1 I3 I8 I11"` (comment: SHA-pin invariant I5 is a hard error for the official marketplace; I8/I11 warnings pending cleanup). Triggers on plugin manifest/agents/skills/commands/hooks/.mcp.json/README changes plus workflow/policy files, and `workflow_dispatch` for bump PRs. The action internals were not read. PR #3869 states `claude plugin validate` was run on the plugin and marketplace manifest. — [validate-plugins.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/validate-plugins.yml)
- `validate-frontmatter.yml` runs `bun .github/scripts/validate-frontmatter.ts` on changed `agents/*.md`, `skills/*/SKILL.md`, `commands/*.md` (YAML frontmatter parse, with pre-quoting of special chars). Skips fork PRs. — [validate-frontmatter.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/validate-frontmatter.yml), [script](https://github.com/anthropics/claude-plugins-official/blob/main/.github/scripts/validate-frontmatter.ts)
- `validate-licenses.yml`: every `plugins/*/LICENSE` must exist and contain "Apache License" and "Version 2.0" (exempts `plugins/claude-security`). — [validate-licenses.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/validate-licenses.yml)
- `check-mcp-urls.yml`: probes http/sse MCP URLs of vendored plugins daily and on PR; 404/410/DNS/TLS failure fails; 401/403/405/5xx pass. — [check-mcp-urls.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/check-mcp-urls.yml)
- `scan-plugins.yml` (job `scan`, required check): "Claude policy scan of changed external marketplace entries"; verdict cache per (plugin, sha) keyed on policy hash. Policy prompt `.github/policy/prompt.md` reviews against Anthropic Software Directory Policy and AUP: malware, privacy, prompt-injection payloads, cross-service credential extraction, and a strict Part 2 on hook scope and disclosure; reads the whole shipped payload incl. dotdirs, `scripts/`, `tests/`. Output must match `.github/policy/schema.json` (`passes`, `violations`, `hooks`, `has_broad_scope_hooks`, `has_undisclosed_telemetry`, `description_matches_behavior`, ...). Scoped to external (SHA-pinned) entries per the header; whether vendored `plugins/*` are scanned is not established from what I read (the PR #6309 checks show `scan` passing in 8s). — [scan-plugins.yml](https://github.com/anthropics/claude-plugins-official/blob/main/.github/workflows/scan-plugins.yml), [prompt.md](https://github.com/anthropics/claude-plugins-official/blob/main/.github/policy/prompt.md), [schema.json](https://github.com/anthropics/claude-plugins-official/blob/main/.github/policy/schema.json)
- `bump-plugin-shas.yml` nightly: for stale external pins, validates with `claude plugin validate`, opens per-plugin `bump/<slug>` PRs, dispatches scan/check/validate; `revert-failed-bumps.yml` reverts only `source.sha` of policy-failing entries. `close-external-prs.yml` and `external-pr-scope-guard.yml`: non-members' PRs auto-closed unless additions-only to marketplace.json from an already-live repo. — workflow files above
- PR checks seen on #6309: `check`, `emit-verdict`, `scan`, `scope-guard`, `validate` (x2), `validate-licenses`, all pass; PR reviews: one APPROVED. — `gh pr checks 6309`, [PR 6309](https://github.com/anthropics/claude-plugins-official/pull/6309)
- No workflow runs `unittest`, `pytest`, `bun test`, `claude plugin test` or `claude plugin eval` (grep of workflows). 

### Inferences
- A plugin's own tests are a local/author discipline in this repo; CI only guarantees manifest/frontmatter/licence/policy hygiene. The `claude-code/testing` TS suite would need `claude plugin test` and is not wired to CI.

### Gaps
- Internals of the composite `validate-plugins` action (invariants I1..I11) were not read.
- Exact scan applicability to vendored `plugins/*` unconfirmed.

## 3. Public evidence of how code-modernization was developed and tested

### Takeaway
Evidence is the git history, PR bodies and the README's "What it has been tried on" table: headless runs on ~14 public codebases plus a booby-trapped one, with the tester playing the human at approval gates. Pass criteria are the plugin's own computed verdicts, not an external benchmark.

### Cited Findings
- Timeline: PR #1582 (merged 2026-04-28, commit bdca23e8 2026-04-24, author morganl-ant / Morgan Lunt) added plugin; #1820 (merged 2026-05-12) "dry-run hardening" from "a real CardDemo dry run" (commit 22a1b259: found map/brief mismatch, missing P0 priority field, scc dependency); #2467 (credentials never written into findings), #2468 (topology map, preflight), #2536 (workflows + untrusted-content hardening, 2026-06-18), #3869 (pilot-first uplift, 2026-07-13), #6309 (1.0.0 "guided workflow with independent proof", merged 2026-09-25). Closed unmerged: #6153, #6110, #5747, #5332, #5378 (docs/fixes). — `git log`, `gh pr list`
- PR #1582 and #1820 test plans contain no test evidence beyond description; #1820 says dry run of discovery workflow against AWS CardDemo. PR #3869 test plan: ran `/modernize-preflight` headlessly with `--plugin-dir` on a COBOL/CICS codebase; ran `uplift-migrate.js` under node with stubbed globals (75 assertions); malformed-input invocations rejected (path traversal, dir aliasing, dependency cycle); `claude plugin validate` passes. Reviewer comment: "LGTM!" praising pilot stage. — [PR 3869](https://github.com/anthropics/claude-plugins-official/pull/3869)
- PR #6309 test plan: "Script tests (303), pane tests (143), `tsc`, manifest validation and the frontmatter check pass. Ran every command headlessly on 14 public codebases and a purpose-built hostile one (COBOL, Java, PHP, Python, Perl, C, .NET, Rails, AngularJS, CI pipelines)... The usage-count hooks were checked in live headless sessions...; an independent review's findings were fixed." One PR comment (author not examined) lists customer prerequisites incl. "A runnable legacy system. The proof works by running both versions on the same inputs", "A machine-readable baseline: JUnit or TRX XML...", and a budget note ("30,000 lines needed roughly 466-647 agents"). — [PR 6309](https://github.com/anthropics/claude-plugins-official/pull/6309)
- README section "What it has been tried on" (verbatim claims): runs were "headlessly, on public codebases"; numbers "come from the files those runs wrote"; counts vary between runs (osCommerce security scan 48 then 52 findings); "the tester played that person" at approval gates; some runs stopped early due to test-machine limits. Table rows: AWS CardDemo (COBOL/CICS/JCL, to Java: 35 rules/8 critical, interest job in Java 21, 213 tests, five independent checks vs real COBOL built locally found blank-field halt, non-numeric key, negative zero; final 15 malformed inputs found 7 differences so NOT PROVEN); Eclipse Jetty (Java 8 to 17, jetty-util pilot, 946 tests same on both, 6 non-predicted changes, 50 tests added, 996 run each); osCommerce (PHP5 to Python/FastAPI, 97 rules, 17,957 tests, 17,727 comparison cases identical, 2 deliberate breaks turned red, verify PROVEN, 14 new inputs matched real PHP); AngularJS RealWorld (166 tests, 29 comparison cases vs recorded API: 23 identical, 6 approved; 4 deliberate breaks; no separate verify run); JPetStore (NOT PROVEN, 6 of 24 comparisons differ; exposed skipped tests counted as covering rules, then fixed); beets (Python 2 to 3; no tests could run, reported not claimed); Spring PetClinic (Boot 2.6 to 3.3; pilot stopped at plan gate); AWStats (Perl; 48 findings, 14 of 62 refuted as false positives); Redmine, eShop, Jenkins (maps/rules/plans only); booby-trapped codebase (planted instructions in comments, README, CLAUDE.md, settings file, marker-dropping script, shell-syntax filenames: nothing obeyed, source unchanged, credential masked). — [README.md "What it has been tried on"](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/README.md)
- The proof-hardening commits are failure-driven: d49ccb38 "a rule is tested only if a test that ran backs it" (JPetStore skipped-test finding); f45794fa "an uplift is not proven by a typed baseline or edited tests" (3 ways uplift could come out PROVEN too easily; "214 script tests pass"; says weakened assertions cannot be detected); 4672eac1/5b8ec4b3 float tolerance; d3a40f72 approve a difference once per input; ff833bd7 auditable, injection-safe rule consolidation. — `git log` / `git show`
- Public external material (secondary, not read in depth): Anthropic marketplace listing https://claude.com/marketplace/plugins/code-modernization ; Anthropic webinar page https://claude.com/resources/webinars/modernizing-legacy-code-with-claude-code (described by search snippet as COBOL-to-Java and a ~500,000-line Java 8 to 17 upgrade); news coverage of the Feb 2026 COBOL announcement (streetinsider). Search found no primary Anthropic engineering blog post on how the plugin was tested.

### Inferences
- Because CardDemo needed a locally built COBOL program to run "old" side by side, the strongest evidence is differential testing on public repos; pass criterion = script-computed PROVEN, and the authors report honest NOT PROVEN outcomes (CardDemo final, JPetStore), which suggests the verdicts are not trivially satisfiable.
- The CardDemo/Jetty/osCommerce run artifacts are not committed, so the table cannot be independently reproduced from the repo.

### Gaps
- No committed run logs, transcripts or "expected output" snapshots; no stated numeric acceptance threshold beyond verdict definitions.
- Did not fetch the marketplace page, webinar page or news pieces; their content is from search snippets only.
- Author of the "prerequisites" PR comment on #6309 not checked.

## 4. How the plugin claims to verify its own output (characterization / equivalence)

### Takeaway
The product design is differential testing driven by scripts rather than model judgement: tests re-run from clean, old and new executed on the same inputs and compared byte-for-byte, canary break to prove tests can fail, P0 rules traced to tests that actually ran, and a script-computed verdict.

### Cited Findings
- README (quote): "Modernization fails quietly: the new code passes the tests someone wrote, and differs on the inputs nobody thought of. So the proof is built from evidence a script can check, not from the model's opinion." Components: tests re-run from clean (counts from runner result files; zero executed or skipped = failure); old and new on same inputs with byte comparison, masks listed, float tolerance declared, accepted differences recorded with reason; at least ten inputs development did not use (commit 2efd715a); canary (deliberate one-line break must turn tests red) and a check that the comparison fails when one byte is changed; each P0 rule must be named by a test that ran ("named, not run" otherwise); legacy source untouched check by file times; human criteria listed as waiting for a person, never ticked. Without a runnable old system the best verdict is PARTLY PROVEN. — [README](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/README.md)
- Characterization tests: `modernize-transform` is described as "tests that pin the old behavior, an idiomatic rewrite, and proof"; `test-engineer` agent "audits test suites for behavior-pinning vs coverage theater" (PR #1582). Uplift: "The proof is the same test suite run on both versions" against a measured baseline (JUnit/TRX/per-test JSON; typed table ignored, f45794fa). — README, [PR 1582](https://github.com/anthropics/claude-plugins-official/pull/1582)
- Self-checking inside runs: independent referee/judge agents (citation referee per rule, two-judge panel per P0 rule, adversarial refuter per security finding) per PR #2536; `modernize-verify` "ideally in a fresh session". — [PR 2536](https://github.com/anthropics/claude-plugins-official/pull/2536)

### Inferences
- The scripts that compute verdicts are the only part with strong unit-test coverage (`test_proof_tools.py` ~140 tests); this makes the verdict logic itself regression-tested while the agent/prompt layers are not.

### Gaps
- Mutation or eval of the LLM-driven extraction quality (rule recall/precision) is not documented; the README gives counts of rules but no ground truth.

## 5. Anthropic's documented plugin testing practice

### Takeaway
Anthropic documents three tools: `claude plugin validate` (static manifest/schema/frontmatter check, CI exit codes), `claude plugin test` (runs `*.test.ts` for "mods", plugins registering event handlers), and `claude plugin eval` (behavioral eval suites with graders, with-vs-without-plugin baseline, CI threshold). code-modernization uses validate and (for its hooks) the test kit, but ships no `claude plugin eval` suite.

### Cited Findings
- `claude plugin validate <path> [--strict] [--json]`: validates a plugin manifest, marketplace manifest, or the skills/agents/commands in a directory; exit 0/1, 2 on unexpected error; `--strict` turns warnings into errors; marketplace runs do not open component files of plugins in other directories (validate each plugin dir); does not check a root SKILL.md. — [CLI reference](https://code.claude.com/docs/en/plugins/cli-reference#plugin-validate)
- `claude plugin test [directory]`: "Run the tests for a mod, a plugin whose code registers event handlers"; needs no session, sign-in or network; runs every `*.test.ts(x)` under the dir; exit 1 on failure. See "Test a mod" https://code.claude.com/docs/en/plugins/mods/test.md . — [CLI reference](https://code.claude.com/docs/en/plugins/cli-reference)
- `claude plugin eval` (Claude Code 2.1.269+): suites in `evals/`, each case a directory with `prompt.md` and/or `case.yaml` and `graders/`; run in a fresh isolated non-interactive session with only the plugin loaded in an empty workspace; 3 runs per case by default; score = fraction of graders passed, case passes at `--threshold` (default 1.0); by default also runs a no-plugin baseline (with-arm vs without-arm, Δ column); six grader types: `regex`, `tool_used`, `tool_order`, `file_exists` (free) and `llm`, `baseline` (judge-model calls); "There are no custom-code graders"; `claude plugin eval init` generates the suite; fixtures via `case.yaml` `context.scaffold_script` (needs `--scaffold`), mocked MCP servers with replay; Bash granted runs under OS sandbox; CI: `--json`, `--trust-plugin`, pinned `--model`/`--judge-model`, `--threshold`, cost ceiling; exit 0 pass, 1 fail, 143 terminated. Recommends grading long outputs with regex over files, and to verify a build/test inside a run by having the prompt write the outcome to a file and grading that file plus a `tool_used` grader. Docs note skill-creator uses a separate `evals/evals.json` format. — [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals.md), [CLI reference](https://code.claude.com/docs/en/plugins/cli-reference)
- Third-party tip (wmedia.es) says 3 runs with and 3 without; consistent with official "three runs ... three times without". Not needed as a source.

### Inferences
- `claude plugin eval` per-run empty workspace and agent sandbox would make multi-hour modernization runs (466-647 agents for 30k lines per the PR comment) impractical as eval cases; unit-level cases (e.g. a single command on a tiny fixture) would be feasible. This is my inference, not documented.

### Gaps
- Did not read the marketplace-reference / manifest-reference validator rules, or "Test a mod" page in detail.

## 6. Notably absent

### Takeaway
No committed evals, no committed sample legacy apps or golden outputs, no CI for plugin tests, no public methodology write-up beyond README table and PR bodies.

### Cited Findings
- No `evals/` in `plugins/code-modernization` (verified `ls`); no `package.json`; no sample legacy codebase or fixtures of real code; tests fixtures are synthetic in-memory workspaces. — repo tree
- No workflow in `.github/workflows/` invokes the plugin's `scripts/tests` or `tests` suites or `claude plugin eval` (read all 9 workflows; the `validate`/`scan` job names match what PR checks list).
- The README itself states verification caveats: results vary between runs; testers played the human; some runs ended early due to machine limits; weakened assertions cannot be detected by the uplift test-diff (f45794fa); Eclipse Jetty/AngularJS rows say no separate verification run for AngularJS.
- I found no Anthropic blog/engineering post specifically on how code-modernization was tested (web search returned marketplace listing, webinar page, and news coverage only).

### Inferences
- Quality assurance relies on manual, costly live runs by the author plus unit tests of deterministic code; a reader wanting to replicate the evidence would need to re-run the plugin on the named public repos (CardDemo, Jetty, osCommerce, etc.).

### Gaps
- Other branches/forks/discussions/issues beyond PR search (title-search "code-modernization", limit 20) not exhaustively checked.
