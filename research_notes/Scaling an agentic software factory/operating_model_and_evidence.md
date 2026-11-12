# Operating model, change management and measurement evidence for scaling agent-driven software delivery (as of Nov 2026)

Method note: ~16 web searches plus one primary fetch (METR). Most figures below come from search-result summaries, not from reading full primary papers; where I could not reach the primary I say so. "Evidence" = measured data; "Opinion" = practitioner or vendor argument. Several sources are vendors with a commercial interest (Faros, CodeRabbit, Veracode, GitClear, Humanitec/platform vendors).

## 1. Platform model: structure, ratios, golden paths, release channels, support

### Takeaway
The only solid research link is DORA 2025: high-quality internal platforms correlate with getting value from AI, and AI amplifies whatever the organisation already is. I found no reliable survey-wide platform-engineer-to-developer ratio; only single-company anecdotes. Nothing found on canary-to-stable release channels for harness/agent config, or inner-source models, in this session.

### Cited Findings
- DORA 2025 "State of AI-assisted Software Development": survey of nearly 5,000 technology professionals (fielded 13 Jun-21 Jul 2025) plus 100+ hours qualitative data; central conclusion is AI is an amplifier of existing strengths and weaknesses — [Google Cloud PDF](https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf); [InfoQ](https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025)
- DORA 2025 reports (via secondary coverage) ~90% of organisations have at least one internal developer platform, 76% have dedicated platform teams, and a direct correlation between high-quality internal platform and ability to unlock AI value — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report?e=48754805); [InfoQ](https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025). Exact 90%/76% wording varies by source; verify in the PDF.
- DORA 2025 introduces an "AI Capabilities Model" of seven capabilities; small-batch working is singled out as especially powerful with AI — [Google Cloud PDF](https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf); secondary summary [Rob Bowley](https://blog.robbowley.net/2025/10/01/dora-2025-ai-assisted-dev-report-some-benefit-most-dont/)
- Ratio anecdote (single org, not a survey average): SIXT reported as 40 platform engineers for 800 developers (20:1), per a blog summarising State of Platform Engineering Vol 4 (518 respondents) — [platformengineering.org](https://platformengineering.org/blog/announcing-the-state-of-platform-engineering-vol-4). A second-hand forum claim puts platform engineers at 15-20% of workforce at Atlassian — [community.platformengineering.org](https://community.platformengineering.org/t/22677683/wave-hi-everyone-i-m-conducting-a-brief-research-project-to-); unverified.
- Docusign engineering case (company blog, opinion/case): pilot gave Copilot to ~20% of engineers Dec 2023-Jun 2024 yet adoption was still low double digits; an Eng AI Champions peer network was the key ingredient; building an internal "Skill Marketplace" for sharing prompts/agent configs — [Docusign](https://www.docusign.com/blog/how-we-drove-ai-adoption-across-docusign-engineering-without-mandating-it)
- Thoughtworks Radar (opinion from a consultancy): spec-driven development and Agent Skills are "feedforward controls", mutation testing a "feedback control", intended to trigger self-correction before human review; vocabulary (spec-driven development, harness engineering) used inconsistently — [Thoughtworks Radar](https://www.thoughtworks.com/en-de/radar); [ITWire](https://itwire.com/business-it-news/data/as-ai-accelerates-software-complexity,-thoughtworks-technology-radar-urges-a-return-to-engineering-fundamentals-to-combat-cognitive-debt)

### Inferences
- If DORA's platform correlation holds, the harness owner team is best framed as a platform team with product management and a golden-path mandate, not a training function. (Correlation, survey-based, not causal.)
- A defensible planning range from the thin evidence is "one platform engineer per tens of developers" (20:1 at SIXT), but this is one data point and predates agent harnesses.

### Gaps
- No published survey-wide platform:developer ratio found; no ratio for AI-enablement/harness teams specifically.
- No evidence found on canary-to-stable release channels for harness/skills/config, inner-source contribution models for agent tooling, or support-model staffing.
- Team Topologies primary material, McKinsey/BCG/Forrester operating-model reports not retrieved.

## 2. Enablement: training, champions, new roles, review skills

### Takeaway
Evidence for what works is mostly vendor/company case studies favouring peer champions over mandates. The one rigorous study on learning (Anthropic RCT) says passive delegation harms skill formation, which matters most for low-to-mid-skill staff. No credible evidence on certification programmes or on new-role titles found.

### Cited Findings
- Anthropic RCT (Shen & Tamkin, published 29 Jan 2026): ~52 software engineers (one source says 51) learning an unfamiliar Python library (Trio); AI group scored 50% vs 67% on comprehension quiz (Cohen's d=0.738, p=0.01); largest gap on debugging; speedup not statistically significant; six interaction patterns, three (asking follow-ups, building understanding) preserved learning. Authors call it small, short-horizon, single library. Funded/run by Anthropic, a vendor of AI coding tools — [Anthropic](https://www.anthropic.com/research/AI-assistance-coding-skills); [arXiv 2601.20245](https://www.arxiv.org/pdf/2601.20245); [InfoQ](https://www.infoq.com/news/2026/02/ai-coding-skill-formation)
- Champions networks: Docusign (above); AutoScout24 describes its AI Champions Network as turning isolated experiments into reusable deliverables — [AutoScout24](https://tech.autoscout24.com/blog/posts/the-ai-champions-network/); Microsoft Learn guidance recommends managers nominate team champions — [Microsoft Learn](https://learn.microsoft.com/hu-hu/training/modules/phase-two-onboard/3-build-your-champions-early-adopters-programs)
- Claims of "60-80% adoption with champions vs 30-40% without" and "600% higher usage" circulate from consultancies attributed to unnamed "Microsoft research"; I could not verify — [Copilot Consulting](https://www.copilotconsulting.com/insights/building-copilot-champions-program) (do not rely)
- Anthropic internal study (Dec 2025; 132 survey respondents, 53 interviews, internal Claude Code usage data; self-reported ~50% productivity gain; engineers reported moving to managing AI systems and worried about skill erosion, weaker mentorship; Anthropic engineers have frontier-model access so generalisation is limited) — [Anthropic](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic); numbers via secondary [Interview Query](https://www.interviewquery.com/p/anthropic-ai-skill-erosion-report)
- Entry-level labour effect: Brynjolfsson, Chandar, Chen "Canaries in the Coal Mine" (ADP payroll data) — ~16% relative employment decline for ages 22-25 in AI-exposed jobs; software developers aged 22-25 reportedly down nearly 20% from late-2022 peak; causation debated — [LeadDev](https://leaddev.com/hiring/young-devs-steepest-losses-exposed-roles-stanford-study-finds); [Axios](https://www.axios.com/2025/08/26/ai-entry-level-jobs)

### Inferences
- For a low-to-mid-skill workforce, training should enforce comprehension-preserving interaction (explain, question, predict) rather than only tool usage; the Anthropic RCT supports this though in a small sample.
- Reduced junior hiring suggests the pipeline of future reviewers/architects thins; an organisation relying on humans as approvers needs deliberate apprenticeship.

### Gaps
- No evidence located on certification programmes, new roles (spec author, agent supervisor, reviewer) as formal job families, or on the specific skills needed to approve an architecture/PR one did not write beyond opinion. Not researched: Pragmatic Engineer / LeadDev role-redesign pieces.

## 3. Human review as bottleneck and weak point

### Takeaway
Multiple datasets show review load rising sharply as AI output grows, and some evidence of approval drift/complacency. Risk-tiered oversight is the main mitigation proposed, but it is practitioner guidance, not validated.

### Cited Findings
- Faros AI Productivity Paradox (vendor telemetry; 10,000+ developers, 1,255 teams): high-AI-adoption teams complete 21% more tasks, merge 98% more PRs, PR review time up 91%, PR size up 154%, bugs per developer up 9% — [Faros](https://www.faros.ai/blog/ai-productivity-paradox-report-2025)
- Faros 2026 "Acceleration Whiplash" (22,000 developers, 4,000+ teams): median time to first review +156.6%, time in review +199.6% — [Faros](https://www.faros.ai/blog/ai-acceleration-whiplash-takeaways)
- METR maintainer study: maintainers of scikit-learn, Sphinx, pytest blind-reviewed 296 AI patches; between half and two-thirds of patches passing SWE-bench's automated grader would be rejected — reported via [LeadDev](https://leaddev.com/software-quality/ai-generated-code-passes-far-more-automated-tests-than-human) (primary not fetched)
- "Habituation at the Gate" paper: reviewers' approval rate drifted from 30.1% to 36.8% between early and late reviews, with fewer inline comments and longer latency — seen only via aggregator [Emergent Mind](https://www.emergentmind.com/papers/2606.22721); verify. A 2026 ESEM short paper studies 669 developers across 103 repos using AIDev under automation-complacency theory — [Dagstuhl LIPIcs](https://drops.dagstuhl.de/storage/00lipics/lipics-vol394-esem2026/LIPIcs.ESEM.2026.67/LIPIcs.ESEM.2026.67.pdf)
- AIDev-based studies: agentic PRs are merged less than human PRs; 83.77% vs 91.00% accepted in a 567 Claude Code PR sample — [arXiv 2509.14745](https://arxiv.org/html/2509.14745v3); 40,214 PRs (6,618 human, 33,596 agentic) — [arXiv 2601.18749](https://arxiv.org/html/2601.18749v1); narrow, well-defined tasks show higher/more stable merge rates (220,612 PRs, 489 Python repos) — [alphaxiv 2607.21832](https://www.alphaxiv.org/abs/2607.21832)
- CodeRabbit (Dec 2025; 470 open-source PRs, 320 AI vs 150 human; vendor of AI review): AI PRs 10.83 vs 6.45 issues per PR (~1.7x); logic issues ~75% higher; security multiplier reported inconsistently (1.57x to 2.74x) — [CodeRabbit](https://www.coderabbit.ai/blog/state-of-AI-vs-human-code-generation-report)
- Risk-tiered oversight (opinion/practice): Thoughtworks Radar technique — auto-merge low-risk via CI, human review for intermediate, humans-only for hardest-to-reverse — [Thoughtworks](https://www.thoughtworks.com/radar/techniques/risk-tiered-human-oversight); vendor example Rewind: AI grades PRs LOW/MED/HIGH, deterministic gate, >19% auto-approved (self-reported) — [Rewind](https://rewind.com/blog/ai-approve-pull-requests-safely/); NHI Mgmt Group suggests scoped workload identities, logging every approval — [NHIMG](https://nhimg.org/faq/when-does-ai-assisted-code-review-become-too-risky-to-deploy-broadly/)
- DORA 2025: AI associated with larger changesets and instability; small batches recommended — [Google Cloud PDF](https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf)

### Inferences
- A PR-approval-only human gate is exposed to volume growth: review time rising 90-200% while PR size grows means per-PR attention likely falls; the drift paper is consistent with that but unverified.
- Mitigations consistent across sources: cap PR size, require agent-supplied plan/rationale, automated feedback controls before humans see the PR, tiered lanes, track approval rate and review time as health metrics.

### Gaps
- No numeric PR-size limits backed by evidence for AI PRs found; no controlled study of rubber-stamping rates in enterprises; reviewer-load ratios not found.

## 4. Empirical evidence on productivity and quality

### Takeaway
Results range from large gains (greenfield, junior, simple tasks) to roughly zero or negative (complex brownfield, experienced devs), with the best 2026 data (METR) too noisy to settle the sign. Organisation-level delivery gains lag individual output.

### Cited Findings
- METR original RCT (early 2025): 16 experienced open-source developers, tasks took 19% longer with AI (CI +2% to +39%) while developers believed 20% faster — [scienceblog](https://scienceblog.com/t-a-randomized-trial-by-metr-found-that-experienced-developers-completed-real-coding-tasks-19-slower-when-allowed-to-use-ai-tools-yet-afterwards-they-estimated-on-average-that-ai-had-made-them-20-fast/)
- METR 2026 update (primary, fetched): 57 developers, 143 repos, 800+ tasks; returning developers (10) speedup 18% (CI -38% to +9% on time), new developers (47) 4% (CI -15% to +9%); intervals include zero; selection effects (30-50% withheld tasks from AI-disallowed condition), task substitution, pay cut $150 to $50/h; authors say developers likely more sped up than early 2025 but data is very weak evidence; METR moving away from this design — [METR](https://metr.org/blog/2026-02-24-uplift-update/)
- Google RCT (ICSE 2025 SEIP): 96 Google engineers, ~21% faster on one enterprise task, wide CI, summer-2024 internal tooling; reports of seniority effect conflict across summaries — [arXiv 2410.12944](https://arxiv.org/pdf/2410.12944)
- Cui, Demirer et al. three field experiments (Microsoft, Accenture, a Fortune 100 manufacturer; 4,867 developers; 2022-23 GPT-3.5 Copilot): +26.08% (SE 10.3%) completed tasks; junior/newer hires gained more, little significant lift for seniors; Management Science — [SSRN](https://papers.ssrn.com/abstract=4945566); [MIT draft](https://economics.mit.edu/sites/default/files/inline-files/draft_copilot_experiments.pdf). Microsoft is a Copilot owner, so note interest.
- Stanford (Denisov-Blanch) ~100k developers, 600+ companies, talk only, no paper found: simple greenfield ~30-40%, simple brownfield ~15-20%, complex brownfield ~0-10%, some negative; rework offsets part; headline average ~15-20% — [ai.engineer talk](https://www.ai.engineer/talks/tbDDYKRFjhk-ai-developer-productivity); figures vary across write-ups ([Sirris](https://www.sirris.be/en/inspiration/how-much-more-productive-does-ai-make-developers)). Treat as unreviewed.
- DORA 2025: AI adoption ~90% (+14 pts); ~65% heavy reliance; adoption now linked to higher throughput (reversal of 2024) but also higher instability; only 3% report high trust — [Google blog](https://blog.google/technology/developers/dora-report-2025/); [TechRepublic](https://www.techrepublic.com/article/news-dora-ai-report-2025/). DORA 2024 had linked adoption to lower delivery stability but a 3.4% code-quality gain per [Rob Bowley's GitClear post](https://blog.robbowley.net/2025/02/17/gitclears-latest-report-indicates-genai-is-having-a-negative-impact-on-code-quality/) (secondary).
- GitClear (vendor analytics; 211M changed lines 2020-24): 8x rise in duplicated blocks of 5+ lines in 2024; moved (refactored) code fell 24.8% (2021) to 9.5% (2024); later report covers 623M changes 2023-26 — [LeadDev](https://leaddev.com/ai/code-maintainability-plummets-in-the-ai-coding-era); [DevClass](https://www.devclass.com/ai-ml/2025/02/20/ai-is-eroding-code-quality-states-new-in-depth-report/1626250). Does not prove AI authorship of each block.
- Anthropic internal: self-reported ~50% gains; ~27% of AI-assisted work was tasks that would not have been attempted — [secondary](https://www.interviewquery.com/p/anthropic-ai-skill-erosion-report). Self-report, vendor.

### Inferences
- Junior-vs-senior: RCTs on 2022-24 tools show gains for juniors on bounded tasks; METR shows no gain or slowdown for experts in familiar repos; but Anthropic RCT shows juniors learning less. A workforce of low-to-mid skill may see the largest throughput gain with the largest comprehension/quality risk.
- Self-perception is unreliable (METR 20% belief vs 19% slower), so rollouts should not rely on surveys alone.

### Gaps
- No 2026 independent RCT with agentic (multi-step) tools at enterprise scale found. McKinsey/BCG/Gartner productivity claims not retrieved. Primary papers for GitClear 2026 and Stanford not read.

## 5. Risks: deskilling, comprehension debt, security, accountability

### Takeaway
Comprehension debt/cognitive debt is a named, widely-argued risk with thin direct measurement (the Anthropic RCT is the main data). Security evidence is mostly vendor benchmarks. Accountability has practitioner proposals only.

### Cited Findings
- "Comprehension debt" coined by Jason Gorman (2025), popularised by Addy Osmani (2026): gap between code volume and human understanding; invisible to velocity/DORA/coverage metrics; proposed mitigations: small changes, require plans/rationale, ask agent to explain, human author-of-record, no silent approvals — [Osmani](https://addyosmani.com/blog/comprehension-debt/); [O'Reilly](https://www.oreilly.com/radar/comprehension-debt-the-hidden-cost-of-ai-generated-code/); [TechRadar](https://techradar.com/pro/the-rise-of-comprehension-debt-in-the-age-of-ai-coding). Opinion.
- Thoughtworks Radar vol 34 (Apr 2026) names "cognitive debt" and urges return to engineering fundamentals — [ITWire](https://itwire.com/business-it-news/data/as-ai-accelerates-software-complexity,-thoughtworks-technology-radar-urges-a-return-to-engineering-fundamentals-to-combat-cognitive-debt)
- Veracode 2025 GenAI Code Security Report (vendor; 80 tasks, 100+ LLMs, static analysis): ~45% of cases introduced vulnerabilities; Java >70% failure; XSS missed 86%; security performance flat as models improve syntactically — [Veracode](https://www.veracode.com/press-release/ai-generated-code-poses-major-security-risks-in-nearly-half-of-all-development-tasks-veracode-research-reveals/); [Help Net Security](https://www.helpnetsecurity.com/2025/08/07/create-ai-code-security-risks/). Prompts were constrained completions; framing of 45% varies by outlet.
- CodeRabbit security findings (above) — directionally higher.
- Anthropic internal interviews flag skill erosion, mentorship decline — [Anthropic](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic)
- Gartner (Jun 2025): >40% of agentic AI projects will be cancelled by end-2027 for cost, unclear value, weak risk controls; general agentic AI, not software delivery specifically — [SD Times](https://sdtimes.com/agentic-ai/gartner-more-than-40-of-agentic-ai-projects-will-be-canceled-in-next-few-years/)
- Agent-security controls suggested: OWASP Agentic AI Top 10, CSA MAESTRO, NIST AI RMF — [NHIMG](https://nhimg.org/faq/when-does-ai-assisted-code-review-become-too-risky-to-deploy-broadly/)

### Inferences
- When humans approve only specs and the final PR, the human's understanding comes only from the artefacts presented; therefore agent-produced plans, explanations and tests are the control surface that must be designed for comprehension.
- Accountability needs a named human approver of record per change; this is suggested by sources but not backed by legal or empirical evidence here.

### Gaps
- No incident data on production failures traced to unreviewed agent code; no legal/regulatory analysis of accountability; no independent (non-vendor) security study of agentic PRs found; no peer-reviewed measurement of comprehension debt beyond the Anthropic RCT.

## 6. Metrics and expansion gates

### Takeaway
Sources converge on measuring system outcomes (DORA stability and throughput, review load, rework) rather than usage or output volume, because volume metrics are inflated by AI. No validated gate thresholds exist in what I found; thresholds below are my inferences.

### Cited Findings
- Faros: output metrics (PRs, tasks) rise while review time, PR size and bugs rise too, so organisational delivery gains are not visible from activity metrics — [Faros](https://www.faros.ai/blog/ai-productivity-paradox-report-2025)
- DORA 2025: track throughput and instability together; small batch size; platform quality — [Google Cloud PDF](https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf)
- Comprehension debt is invisible to standard dashboards — [O'Reilly](https://www.oreilly.com/radar/comprehension-debt-the-hidden-cost-of-ai-generated-code/)
- METR: developers' self-reported speedups mismatched measured results — [METR](https://metr.org/blog/2026-02-24-uplift-update/)
- Faros guidance on scaling adoption stresses structured enablement and executive sponsorship (vendor) — [Faros](https://faros.ai/blog/enterprise-ai-coding-assistant-adoption-scaling-guide)

### Inferences (not sourced thresholds)
- Candidate metrics: change failure rate, rework/revert rate, time-to-first-review and review hours per PR, PR size distribution, reviewer approval rate and comment density over time (habituation), post-merge defect and security-scan findings, comprehension spot-checks (reviewer can explain a sampled change), escaped-defect by risk tier, cost per merged change, junior-reviewer vs senior-reviewer outcomes.
- Plausible gates: expand only if stability metrics do not degrade vs baseline for a full cycle, review queue time stays within a fixed bound, and sampled audit shows reviewers catching seeded defects at an acceptable rate. Seeded-defect audits are my suggestion, not found in the sources.

### Gaps
- No published expansion-gate frameworks with thresholds; no pilot-to-scale studies with outcome data (McKinsey/BCG/Forrester not retrieved).
