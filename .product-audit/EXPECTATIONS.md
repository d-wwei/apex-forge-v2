# Apex Forge V2 Provisional Expectations

- Audit Date: 2026-08-13
- Project Type: cli-tool
- Secondary Types: ai-agent-system, architecture-doc, spec-doc
- Audit Goal: pre-launch / ai-agent-system completion assessment
- Commitment Scope: provisional
- Defined Expectations: 21
- Automated Checks Planned: 21
- Extractable Current Goals Covered: 17/17 (100%)
- Excluded Future Goals: C-017, C-018, C-019

### E-201: CLI lifecycle is executable

- **Commitment ID**: C-003, C-016
- **Confirmation Status**: provisional
- **Expectation**: Documented lifecycle commands initialize, validate, inspect, and audit a project with correct exit codes.
- **Measurement**: Run help, strict validate, contract validate, and reconcile.
- **Threshold**: PASS: all commands exit 0; WARN: one non-core command differs from docs; FAIL: lifecycle command crashes or returns misleading success.
- **Severity**: MEDIUM
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: command-by-command exit status
  - trend_query: compare command inventory to previous audit
  - ratio_check: documented commands vs recognized commands
  - causal_upstream: [E-401]
  - causal_downstream: [E-501, E-901]

### E-202: Invalid transitions fail closed

- **Commitment ID**: C-003, C-004
- **Confirmation Status**: provisional
- **Expectation**: Invalid triage, node, worker, merge, approval, and contract transitions return non-zero and preserve state.
- **Measurement**: Run the negative-path test groups and inspect assertions.
- **Threshold**: PASS: all negative tests pass; WARN: missing edge class; FAIL: invalid state can advance.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: failures by state-machine area
  - trend_query: negative-test count over audits
  - ratio_check: negative tests vs positive lifecycle tests
  - causal_upstream: [E-401]
  - causal_downstream: [E-601, E-602]

### E-203: PlanGraph is task-aware and complete-gated

- **Commitment ID**: C-003, C-005
- **Confirmation Status**: provisional
- **Expectation**: PlanGraph derives from intake/context and execute cannot pass until every required node has successful evidence.
- **Measurement**: Run PlanGraph and complete-execute tests; inspect generated task-specific plans.
- **Threshold**: PASS: task-aware and early-close tests pass; WARN: only fixture evidence; FAIL: fixed graph reuse or early PASS occurs.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: task-aware plans by intake type
  - trend_query: plan coverage across recent runs
  - ratio_check: fully covered plans vs total plans
  - causal_upstream: [E-902]
  - causal_downstream: [E-503, E-601]

### E-401: Authoritative state is contract validated

- **Commitment ID**: C-002, C-004, C-011
- **Confirmation Status**: provisional
- **Expectation**: Every authoritative persisted JSON/JSONL type has a schema and invalid writes/scans fail.
- **Measurement**: Run `contracts validate`, runtime write-gate tests, and enumerate skipped JSON.
- **Threshold**: PASS: zero contract errors and no authoritative skipped files; WARN: skipped derived/temp files are documented; FAIL: authoritative state bypasses validation.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: validated and skipped files by directory
  - trend_query: schema count and contract-error trend
  - ratio_check: authoritative schemas vs authoritative object types
  - causal_upstream: []
  - causal_downstream: [E-201, E-202, E-402, E-801]

### E-402: State writes are crash-consistent and concurrent-safe

- **Commitment ID**: C-001, C-002
- **Confirmation Status**: provisional
- **Expectation**: State/event/outbox updates use atomic replacement or transactions and prevent concurrent lost updates.
- **Measurement**: Inspect write primitives and run concurrent writer/crash-injection tests.
- **Threshold**: PASS: atomic writes plus locking/transaction tests; WARN: reconciliation detects all injected partial writes; FAIL: direct overwrite/append without locking and no crash test.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: write sites by atomic/non-atomic primitive
  - trend_query: corruption/reconcile incidents per audit
  - ratio_check: transactional multi-file updates vs total multi-file updates
  - causal_upstream: [E-401]
  - causal_downstream: [E-501, E-801, E-803]

### E-501: Project loop has fresh operational evidence

- **Commitment ID**: C-001, C-003
- **Confirmation Status**: provisional
- **Expectation**: The project lifecycle continues to work in a recent operational window, not only historically.
- **Measurement**: Check latest successful tick/run/audit/metrics/smoke timestamps and current test execution.
- **Threshold**: PASS: core runtime evidence within policy window and tests pass today; WARN: tests pass today but operational artifacts are older than 2 policy windows; FAIL: current lifecycle or audit fails.
- **Severity**: HIGH
- **Metric Type**: incremental
- **Deep Dive Metadata**:
  - distribution_query: successful events by day for last 14 days
  - trend_query: run/tick/smoke cadence
  - ratio_check: recent successful runs vs recent accepted intake
  - causal_upstream: [E-201, E-402, E-803]
  - causal_downstream: [E-804]

### E-502: Recovery paths are policy bounded

- **Commitment ID**: C-010, C-014
- **Confirmation Status**: provisional
- **Expectation**: Retry, fallback, resume, carry-forward, and learning governance preserve evidence and obey policy.
- **Measurement**: Run recovery/governance tests and inspect policy-bound events.
- **Threshold**: PASS: all recovery tests pass and non-retryable classes remain blocked; WARN: only simulated adapters; FAIL: retry bypasses policy or loses evidence.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: recovery events by failure kind and adapter
  - trend_query: retry/fallback success rate over recent runs
  - ratio_check: retries requested vs recovered workers
  - causal_upstream: [E-401]
  - causal_downstream: [E-501]

### E-503: Parallel workers are isolated

- **Commitment ID**: C-007
- **Confirmation Status**: provisional
- **Expectation**: At least two workers can execute concurrently without shared checkout writes, namespace collisions, or state corruption.
- **Measurement**: Run concurrent worktree/scratch adversarial test with disjoint and overlapping scopes.
- **Threshold**: PASS: real concurrent test proves isolation; WARN: structural/WIP tests pass but no real concurrent dogfood; FAIL: shared writes or collision occurs.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: worker sandbox types and overlap outcomes
  - trend_query: concurrent worker count and conflict rate
  - ratio_check: isolated concurrent runs vs total multi-worker runs
  - causal_upstream: [E-203, E-402, E-702]
  - causal_downstream: [E-601, E-602]

### E-601: Candidate patches are verified, not old roots

- **Commitment ID**: C-004, C-008
- **Confirmation Status**: provisional
- **Expectation**: Verification materializes all queued patch operations in an isolated workspace and rejects incomplete/conflicting operations.
- **Measurement**: Run staged verification positive and adversarial tests.
- **Threshold**: PASS: syntax-error and missing-operation candidates fail; WARN: only text operations covered; FAIL: old root can pass for broken candidate.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: verification reports by mode and patch count
  - trend_query: staged verification usage over recent runs
  - ratio_check: staged verification reports vs patch-bearing integrations
  - causal_upstream: [E-203, E-503]
  - causal_downstream: [E-602, E-804]

### E-602: Integration is conflict-aware and reproducible

- **Commitment ID**: C-009
- **Confirmation Status**: provisional
- **Expectation**: Conflicts block integration, resolution is explicit, and final applied files match the approved queue.
- **Measurement**: Run conflict, resolution, ambiguous replacement, and merge tests.
- **Threshold**: PASS: all conflict classes block and resolve deterministically; WARN: binary/delete operations unsupported but explicit; FAIL: conflict silently overwrites.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: conflicts by kind/path
  - trend_query: conflict resolution success rate
  - ratio_check: resolved conflicts vs detected conflicts
  - causal_upstream: [E-601, E-701]
  - causal_downstream: [E-501]

### E-701: High-risk merge approval is content-bound

- **Commitment ID**: C-009
- **Confirmation Status**: provisional
- **Expectation**: Critical or sensitive changes require approval bound to current patch IDs, files, policy, and fingerprint.
- **Measurement**: Run approval invalidation tests and inspect approval schema.
- **Threshold**: PASS: patch mutation invalidates approval; WARN: expiry/reviewer capability not modeled; FAIL: stale approval authorizes changed content.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: approvals by kind/status/risk
  - trend_query: pending and expired approval age
  - ratio_check: sensitive merges vs approved sensitive merges
  - causal_upstream: [E-401]
  - causal_downstream: [E-602]

### E-702: Agent execution cannot escape its capability boundary

- **Commitment ID**: C-007, C-009
- **Confirmation Status**: provisional
- **Expectation**: Coding agents cannot modify host files, execute unapproved external side effects, or access secrets outside the sandbox/write scope.
- **Measurement**: Inspect adapter permission flags and run filesystem/network/secret escape adversarial tests.
- **Threshold**: PASS: OS/container sandbox plus denied side-effect tests; WARN: post-run workspace diff catches in-tree scope violations but host escape is unproven; FAIL: demonstrated host escape or uncontrolled side effect.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: adapter permission modes and sandbox type
  - trend_query: scope/permission violations over runs
  - ratio_check: adapters with OS isolation vs enabled coding adapters
  - causal_upstream: [E-503]
  - causal_downstream: [E-501, E-601]

### E-801: Event log and reconcile recover derived state

- **Commitment ID**: C-001, C-002
- **Confirmation Status**: provisional
- **Expectation**: Event integrity is checked and derived state drift is detected and safely reconciled.
- **Measurement**: Run reconcile, corruption, duplicate-ID, and drift tests.
- **Threshold**: PASS: current reconcile is CONSISTENT and corruption blocks apply; WARN: no full replay from events; FAIL: drift is silent or corrupt log is applied.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: event types, duplicates, and drift classes
  - trend_query: reconciliation changes and integrity failures
  - ratio_check: repairable drift vs detected drift
  - causal_upstream: [E-401, E-402]
  - causal_downstream: [E-804]

### E-802: Quality metrics represent recent behavior

- **Commitment ID**: C-012
- **Confirmation Status**: provisional
- **Expectation**: Quality gates use bounded recent windows or deltas for adapter failure, cycle time, verification, and risk signals.
- **Measurement**: Inspect metric aggregation and simulate recent regression after strong historical totals.
- **Threshold**: PASS: recent-window metrics detect regression; WARN: all-time metrics exist with explicit caveat; FAIL: cumulative totals can hide recent failures or permanently poison quality.
- **Severity**: HIGH
- **Metric Type**: incremental
- **Deep Dive Metadata**:
  - distribution_query: metrics by run/date/adapter
  - trend_query: rolling 7/14/30-run rates
  - ratio_check: recent failure rate vs lifetime failure rate
  - causal_upstream: [E-801]
  - causal_downstream: [E-501, E-804]

### E-803: Adapter health and notifications are operationally fresh

- **Commitment ID**: C-013
- **Confirmation Status**: provisional
- **Expectation**: Live smoke remains within the configured freshness window and failures move through delivery, retry, acknowledgement, and dead-letter states.
- **Measurement**: Check live smoke age, outbox implementation, dispatcher/retry evidence, and failure injection.
- **Threshold**: PASS: smoke <=24h and notification delivery lifecycle proven; WARN: smoke fresh but outbox-only; FAIL: smoke stale or failures cannot leave local queued state.
- **Severity**: HIGH
- **Metric Type**: incremental
- **Deep Dive Metadata**:
  - distribution_query: smoke result by adapter and notification status
  - trend_query: smoke age and delivery latency
  - ratio_check: failed smokes vs delivered notifications
  - causal_upstream: [E-402]
  - causal_downstream: [E-501, E-805]

### E-804: Audit PASS uses independent execution evidence

- **Commitment ID**: C-015
- **Confirmation Status**: provisional
- **Expectation**: Project audit runs or verifies current tests and derives features from executable behavior, not test-file counts or self-declared capability IDs.
- **Measurement**: Mutate manifest/test text without behavior and confirm audit does not falsely PASS.
- **Threshold**: PASS: adversarial false-PASS cases fail audit; WARN: audit mixes direct and self-declared evidence; FAIL: manifest/count manipulation can create PASS.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: audit checks by evidence strength
  - trend_query: weak-evidence PASS count per audit
  - ratio_check: executed checks vs declaration/count checks
  - causal_upstream: [E-501, E-601, E-801, E-802]
  - causal_downstream: []

### E-805: Adapter history contains a real trend

- **Commitment ID**: C-013
- **Confirmation Status**: provisional
- **Expectation**: Adapter trend history contains enough time-separated observations to detect version, capability, availability, and smoke changes.
- **Measurement**: Count snapshots and time span.
- **Threshold**: PASS: >=7 observations across >=7 days; WARN: 2-6 observations or shorter span; FAIL: <=1 snapshot.
- **Severity**: MEDIUM
- **Metric Type**: incremental
- **Deep Dive Metadata**:
  - distribution_query: observations per adapter
  - trend_query: version/capability/smoke changes over time
  - ratio_check: expected observation windows vs recorded snapshots
  - causal_upstream: [E-803]
  - causal_downstream: [E-804]

### E-901: Documentation and CLI remain aligned

- **Commitment ID**: C-016
- **Confirmation Status**: provisional
- **Expectation**: README commands, help output, package scripts, and machine-readable capabilities agree.
- **Measurement**: Parse command inventories and execute documented validation commands.
- **Threshold**: PASS: no command mismatch; WARN: undocumented internal command; FAIL: documented command is rejected or semantics differ.
- **Severity**: MEDIUM
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: commands by source
  - trend_query: doc-command drift over audits
  - ratio_check: documented commands recognized by CLI
  - causal_upstream: [E-201]
  - causal_downstream: []

### E-902: Context Fabric is fresh, sourced, and uncertainty-aware

- **Commitment ID**: C-006, C-014
- **Confirmation Status**: provisional
- **Expectation**: Knowledge artifacts expose current sources, timestamps, confidence/unknowns, and stale markers sufficient for task routing.
- **Measurement**: Inspect knowledge files and run task-to-file retrieval probes.
- **Threshold**: PASS: freshness policy plus <=2-search routing benchmark; WARN: sourced file maps exist but semantic/stale markers are incomplete; FAIL: stale template summaries are treated as current fact.
- **Severity**: HIGH
- **Condition**: mapped module -> HIGH; unmapped module -> MEDIUM
- **Metric Type**: incremental
- **Deep Dive Metadata**:
  - distribution_query: knowledge age and source refs by file
  - trend_query: refresh cadence and stale-marker count
  - ratio_check: mapped tasks resolved within two searches
  - causal_upstream: [E-401]
  - causal_downstream: [E-203, E-501]

### E-903: Kernel architecture remains cohesive and replaceable

- **Commitment ID**: C-020
- **Confirmation Status**: provisional
- **Expectation**: Core orchestration, adapters, contracts, and observability have bounded modules without a dominant god file.
- **Measurement**: Measure file size, responsibilities, imports, and provider-specific logic in core.
- **Threshold**: PASS: no core file >1500 LOC and command domains have dedicated modules; WARN: main file 1501-3000 LOC; FAIL: main file >3000 LOC or mixed domain ownership blocks change isolation.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: LOC and exported symbols by module
  - trend_query: main-file LOC growth
  - ratio_check: main-file LOC vs total source LOC
  - causal_upstream: []
  - causal_downstream: [E-501, E-901]

### E-904: Test evidence covers adversarial production risks

- **Commitment ID**: C-003, C-007, C-015
- **Confirmation Status**: provisional
- **Expectation**: Tests include crash consistency, concurrent writers, sandbox escape, false-audit PASS, notification delivery, and recent-window metric traps.
- **Measurement**: Search and execute adversarial tests for each risk class.
- **Threshold**: PASS: all six classes have executable tests; WARN: 3-5 classes; FAIL: <=2 classes.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: tests by risk class and layer
  - trend_query: adversarial coverage growth
  - ratio_check: covered critical risks vs identified critical risks
  - causal_upstream: [E-804]
  - causal_downstream: [E-501]

## Coverage Manifest

| Commitment | Expectations | Status |
|---|---|---|
| C-001 | E-402, E-501, E-801 | covered |
| C-002 | E-401, E-402, E-801 | covered |
| C-003 | E-201, E-202, E-203, E-501, E-904 | covered |
| C-004 | E-202, E-401, E-601 | covered |
| C-005 | E-203 | covered |
| C-006 | E-902 | covered |
| C-007 | E-503, E-702, E-904 | covered |
| C-008 | E-601 | covered |
| C-009 | E-602, E-701, E-702 | covered |
| C-010 | E-502 | covered |
| C-011 | E-401 | covered |
| C-012 | E-802 | covered |
| C-013 | E-803, E-805 | covered |
| C-014 | E-502, E-902 | covered |
| C-015 | E-804, E-904 | covered |
| C-016 | E-201, E-901 | covered |
| C-020 | E-903 | covered |
| C-017 to C-019 | none | excluded as future scope |
