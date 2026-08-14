# Apex Forge V2 Commitment Review

- Audit Date: 2026-08-13
- Audit Goal: pre-launch / ai-agent-system completion assessment
- Primary Project Type: cli-tool
- Secondary Types: ai-agent-system, architecture-doc, spec-doc
- Commitment Scope: provisional
- Execution Mode: sequential independent role passes

## Project Type Evidence

- `package.json` exposes the `apex-v2` CLI through `bin`.
- `src/apex-v2.mjs` is the executable orchestration kernel.
- `planning/`, `contracts/`, schemas, persistent runtime state, and agent adapters make this more than a conventional CLI.

## Audit Panel

- Active Roles: Product/Requirements, Architecture, Engineering, Test Strategy, Security, Reliability/Operations, Performance/Scalability, Delivery/DevOps, Documentation/DX, AI Behavior
- Deferred Roles: UX/Accessibility (no user interface); Data/Analytics (no business data pipeline); Compliance/Privacy (no stated regulated-data scope)
- Duplicate Review Targets: durable state integrity, worker isolation, quality metrics, audit integrity
- Integration Owner: main auditor

## Commitment Candidates

### C-001: Long-running project operating system

- Source: `README.md:5-13`; `planning/v2-planning-recommendation.md:13-29`
- Original Text: The project is a long-running project-level semi-automated R&D operating system, not a one-task executor.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: The project can repeatedly accept, execute, verify, integrate, and learn from delivery work without chat history as the source of truth.
- Confidence: high
- Potential Expectation IDs: E-501, E-801
- Wrong-Classification Risk: Treating a prototype CLI as a durable operating system inflates completion.
- Origin: doc-derived

### C-002: Durable local source of truth

- Source: `planning/v2-planning-recommendation.md:7-9`; `README.md:11-13`
- Original Text: Durable truth lives in artifacts, schemas, event logs, graph state, and verification evidence.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Persistent state remains valid and recoverable across failures and concurrent activity.
- Confidence: high
- Potential Expectation IDs: E-401, E-402, E-801
- Wrong-Classification Risk: Schema-valid files could be mistaken for crash-safe durable state.
- Origin: doc-derived

### C-003: Continuous intake-to-delivery loop

- Source: `README.md:46-50`; `planning/project-operating-model.md`
- Original Text: Intake, triage, roadmap, delivery, quality, learning, and knowledge form a continuous project loop.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: The full lifecycle is executable and correctly gated.
- Confidence: high
- Potential Expectation IDs: E-201, E-202, E-203, E-501
- Wrong-Classification Risk: Counting historical completed runs can hide a currently idle or broken loop.
- Origin: doc-derived and code-derived (tests)

### C-004: Typed artifacts and finite gate semantics

- Source: `contracts/stage-contracts-v0.md:6-18`; `contracts/stage-contracts-v0.md:164-171`
- Original Text: Stages exchange explicit typed artifacts and finite gate results.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Core persisted objects and transitions are contract validated.
- Confidence: high
- Potential Expectation IDs: E-401, E-601
- Wrong-Classification Risk: Broad schemas with weak required fields could create false confidence.
- Origin: doc-derived

### C-005: Task-aware complete PlanGraph

- Source: `README.md:48-51`; `capabilities.json:5-16`
- Original Text: Plans derive from intake/context, and execute passes only after all plan nodes succeed.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Planning is task-specific and cannot close early.
- Confidence: high
- Potential Expectation IDs: E-203
- Wrong-Classification Risk: Static graph templates could satisfy structural checks but miss task intent.
- Origin: doc-derived and code-derived (tests)

### C-006: Context Fabric reduces rediscovery

- Source: `planning/roadmap.md:64-79`; `contracts/stage-contracts-v0.md:193-208`
- Original Text: Agents should locate relevant files/tests with at most two searches using sourced, fresh context.
- Suggested Classification: conditional_commitment
- Suggested Commitment: Existing mapped areas provide fresh, sourced task-to-file and test context.
- Confidence: medium
- Potential Expectation IDs: E-902
- Wrong-Classification Risk: Template-generated summaries may be mistaken for semantic repo awareness.
- Origin: doc-derived

### C-007: Safe isolated parallel implementation

- Source: `planning/roadmap.md:97-111`; `README.md:53-54`
- Original Text: Independent implementation workers run in isolated worktrees/sandboxes and return reviewable patch bundles.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Concurrent workers cannot corrupt shared state or escape their write scope.
- Confidence: high
- Potential Expectation IDs: E-503, E-702
- Wrong-Classification Risk: Directory copies are not equivalent to OS sandboxing.
- Origin: doc-derived and code-derived (tests)

### C-008: Candidate patches are verified before merge

- Source: `README.md:50-51`; `capabilities.json:13-16`
- Original Text: Verification materializes candidate operations in an isolated staged workspace.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Broken or incomplete candidate patches cannot pass by testing the old project root.
- Confidence: high
- Potential Expectation IDs: E-601
- Wrong-Classification Risk: A report could pass without testing the actual candidate.
- Origin: doc-derived and code-derived (tests)

### C-009: Conflict-aware governed integration

- Source: `README.md:60,72-74`; `contracts/stage-contracts-v0.md:298-313`
- Original Text: Merge conflicts are detected, sensitive changes require approval, and integration is reproducible and rollback-aware.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Conflicts block merge and critical/sensitive changes require content-bound approval.
- Confidence: high
- Potential Expectation IDs: E-602, E-701
- Wrong-Classification Risk: Approval existence may be counted without checking fingerprint binding.
- Origin: doc-derived and code-derived (tests)

### C-010: Retry, fallback, resume, and carry-forward

- Source: `README.md:55-65`; `planning/roadmap.md:113-128`
- Original Text: Failed or paused graphs can recover through controlled retry, adapter fallback, session resume, or explicit carry-forward handling.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Recovery is policy bounded and evidence preserving.
- Confidence: high
- Potential Expectation IDs: E-502
- Wrong-Classification Risk: Historical dogfood may not prove current recovery behavior.
- Origin: doc-derived and code-derived (tests)

### C-011: Contract registry guards persisted state

- Source: `README.md:58`; `capabilities.json:29-32`
- Original Text: JSON Schema draft 2020-12 validates core state before writes and during project scans.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: All authoritative JSON/JSONL state is covered by a schema and invalid writes fail.
- Confidence: high
- Potential Expectation IDs: E-401
- Wrong-Classification Risk: Unmapped JSON may silently bypass validation.
- Origin: doc-derived and code-derived (config)

### C-012: Measurable quality and risk governance

- Source: `README.md:61,71`; `capabilities.json:41-43,69-71`
- Original Text: Metrics and risk thresholds block new runs when quality regresses.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Quality signals reflect recent behavior, not only lifetime totals.
- Confidence: high
- Potential Expectation IDs: E-802
- Wrong-Classification Risk: Cumulative metrics can hide recent failures or permanently retain old failures.
- Origin: doc-derived and code-derived (metrics)

### C-013: Live adapter health, notifications, and trend history

- Source: `README.md:67-70`; `capabilities.json:65-83`
- Original Text: Live smoke is freshness-gated; failures enter a notification outbox; observations form trends.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Runtime health evidence is fresh and failures reach an actionable delivery lifecycle.
- Confidence: high
- Potential Expectation IDs: E-803, E-805
- Wrong-Classification Risk: One historical snapshot and an undelivered file outbox can look operationally complete.
- Origin: doc-derived and code-derived (runtime state)

### C-014: Evidence-based learning governance

- Source: `README.md:52,59`; `contracts/stage-contracts-v0.md:146-162,315-330`
- Original Text: Learning persists only with evidence and governance approval.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Unapproved learning cannot become project knowledge.
- Confidence: high
- Potential Expectation IDs: E-502, E-902
- Wrong-Classification Risk: Applied-count totals do not prove current evidence quality.
- Origin: doc-derived and code-derived (tests)

### C-015: Audit and self-inspection

- Source: `README.md:74-75`; `capabilities.json:88-97`
- Original Text: Project audit reports objective coverage and can create intake from gaps.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Audit PASS is based on executed, current, independent evidence rather than manifests or counts.
- Confidence: high
- Potential Expectation IDs: E-804
- Wrong-Classification Risk: A self-referential auditor can certify itself.
- Origin: doc-derived and code-derived (audit)

### C-016: CLI documentation is executable

- Source: `README.md:77-104`; `package.json:6-12`
- Original Text: Documented CLI commands are the supported control surface.
- Suggested Classification: current_implicit_commitment
- Suggested Commitment: Help, README, command parsing, and exit semantics agree.
- Confidence: high
- Potential Expectation IDs: E-201, E-901
- Wrong-Classification Risk: Docs can drift from implementation without CI detection.
- Origin: code-derived (CLI/config)

### C-017: Read-only parallel research

- Source: `planning/roadmap.md:81-95`
- Original Text: Research workers, evidence cards, counter-evidence, and coordinator merge are planned.
- Suggested Classification: roadmap_or_future_claim
- Suggested Commitment: none
- Confidence: high
- Potential Expectation IDs: none
- Wrong-Classification Risk: PlanGraph labels could be mistaken for implemented research orchestration.
- Origin: doc-derived

### C-018: CodeGraph/semantic context integration

- Source: `planning/roadmap.md:64-79`; `src/apex-v2.mjs:1285-1294`
- Original Text: CodeGraph and stale-context markers are planned; generated known-issues explicitly says they are not implemented.
- Suggested Classification: roadmap_or_future_claim
- Suggested Commitment: none
- Confidence: high
- Potential Expectation IDs: none
- Wrong-Classification Risk: Repository file scanning could be scored as completed semantic context.
- Origin: doc-derived and code-derived

### C-019: Release/CI/MCP adapters

- Source: `planning/v2-planning-recommendation.md:101-124`; `README.md:23-25`
- Original Text: Release discipline, MCP, and CI adapters are architectural targets.
- Suggested Classification: roadmap_or_future_claim
- Suggested Commitment: none
- Confidence: high
- Potential Expectation IDs: none
- Wrong-Classification Risk: Empty directories or adapter lists could inflate completion.
- Origin: doc-derived

### C-020: High cohesion and low coupling

- Source: `planning/v2-planning-recommendation.md:27-29,31-124`
- Original Text: Stages are cohesive, loosely coupled, and provider details remain outside the core.
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: The kernel is decomposed into bounded modules and does not accumulate most behavior in one entry file.
- Confidence: high
- Potential Expectation IDs: E-903
- Wrong-Classification Risk: A functional monolith could pass behavior tests while becoming unmaintainable.
- Origin: doc-derived and code-derived (source structure)

## Commitment Mining Self-Review

| Check | Candidate(s) / Source(s) | Risk | Recommended Action |
|---|---|---|---|
| Source completeness | README, planning, contracts, schemas, package, source, tests, `.apex-v2` | No CI/release/runbook artifacts exist | Record absence as delivery evidence gap |
| Evidence truthfulness | C-001 through C-016, C-020 | Several claims have only historical dogfood | Use incremental freshness thresholds |
| Freshness | runtime artifacts last updated 2026-08-06 | Historical PASS may be stale on 2026-08-13 | Score fresh evidence separately |
| Classification correctness | C-017 through C-019 | Roadmap could inflate completion | Exclude from current expectation score |
| Conflict detection | C-006, C-018 | Context Fabric claimed usable while semantic index is explicitly absent | Score current file-map behavior, not future CodeGraph |
| CRITICAL reasonableness | C-002, C-007, C-008, C-009, C-015 | State corruption, sandbox escape, false verification, unsafe merge, and false audit invalidate core value | Keep CRITICAL expectations |

## Human Confirmation

- Confirmation Status: provisional
- Confirmed By: not yet confirmed
- Confirmed At: not yet confirmed
- Scope Decision Summary: The user requested an immediate completion assessment. Current shipped claims are included provisionally; explicit roadmap/future claims are excluded.

| Candidate ID | Decision | Final Classification | Critical? | Notes |
|---|---|---|---|---|
| C-001 to C-016 | include-provisional | current explicit/implicit/conditional | mixed | Current shipped claims |
| C-017 | exclude | roadmap_or_future_claim | no | Parallel research is not proven shipped |
| C-018 | exclude | roadmap_or_future_claim | no | CodeGraph/semantic index explicitly incomplete |
| C-019 | exclude | roadmap_or_future_claim | no | No CI/release/MCP implementation evidence |
| C-020 | include-provisional | current_explicit_commitment | no | Architecture quality claim |

