# Prescription — Apex Forge V2

## Background

- Current audit score: 48.9% (D)
- Estimated overall completion: 64%
- Report status: provisional
- CRITICAL failures: 1
- Non-clean expectations: 14
- Root causes: 6
- Key insight: The functional kernel is strong; durable operation, safety
  boundaries, maintainability, and independent evidence are not yet closed.
- Residual risk: commitment scope is provisional and destructive host-escape
  probing was not run.

## Required Reading

- `.product-audit/EXPECTATIONS.md`
- `.product-audit/reports/audit-2026-08-13.md`
- `.product-audit/DIAGNOSIS.md`
- `.product-audit/EXPERT_FINDINGS.md`

## Round 1

### Fix-001: Independent Audit Evidence — P0 (CRITICAL)

Addresses: E-804, E-904, E-203, E-502, E-601, E-901.

#### Current Data

- Built-in audit uses `test_count >= 30` and `capabilityFeatureIds.has(...)`.
- It does not execute `npm test`.
- E-904 adversarial classes: 0/6.
- Product audit result: E-804 FAIL.

#### Audit Evidence

- Test and Product roles independently confirmed the false-PASS risk.
- Provisional risk: no manifest mutation benchmark has been executed yet.

#### Target

- E-804 PASS: every grade-affecting capability uses executed or directly
  inspected evidence.
- E-904 PASS: 6/6 adversarial classes have executable tests.
- Built-in audit must fail when capability IDs or test text are added without
  behavior.

#### Investigation Path

1. `src/apex-v2.mjs`, `auditProject`, `buildAuditSummary`, `buildAuditChecks`.
2. `tests/apex-v2.test.mjs`, current project audit tests.
3. `capabilities.json`.
4. `.apex-v2/audits/`.

#### Fix Approach

1. Extract audit checks into `src/core/project-audit.mjs`.
2. Execute current test/contract/reconcile probes or verify signed fresh results.
3. Replace feature-ID booleans with behavior evidence contracts.
4. Add adversarial fixtures for fake manifest PASS, fake test-count PASS,
   stale evidence, and malformed audit summaries.
5. Persist raw check records separately from rendered reports.

#### Verification

- Command: `npm test && node src/apex-v2.mjs project audit --project .`
- Expected: 6/6 audit adversarial tests pass; audit cannot PASS after adding an
  unused capability ID.
- Audit check: `.product-audit/audit.mjs`; expected E-804 PASS and E-904 PASS.
- Rollback trigger: any previously PASS merge/verification test regresses.

#### Dependencies

- fix_id: Fix-001
- depends_on: none
- conflicts_with: [Fix-006]
- reason: Fix-006 moves the same audit command code; finish evidence semantics first.

### Fix-002: Atomic State Store And Project Locking — P0 (CRITICAL)

Addresses: E-402, E-401, E-801, part of E-503/E-803.

#### Current Data

- `writeJson` calls direct `writeFileSync`.
- `appendEvent` calls direct `appendFileSync`.
- Atomic write/lock detected: false.
- Crash/concurrent writer tests: false.

#### Audit Evidence

- Architecture and Reliability independently confirmed the issue.
- Current reconcile detects drift but does not prevent partial multi-file commits.

#### Target

- E-402 PASS: temp-file + fsync + rename for JSON; append/event sequencing under
  a project lock or transactional journal.
- 0 lost updates in 100 concurrent writer iterations.
- Crash injection at each multi-file write boundary recovers to a consistent state.

#### Investigation Path

1. `src/lib/common.mjs`, `writeJson`.
2. `src/core/store.mjs`, `appendEvent`, `updateProject`.
3. `src/core/reconcile.mjs`.
4. New `tests/store-atomicity.test.mjs`.

#### Fix Approach

1. Introduce `atomicWriteJson()` with same-directory temporary files, fsync,
   rename, and directory fsync.
2. Add project-scoped advisory lock with owner, timeout, and stale-lock recovery.
3. Wrap event + materialized-state updates in a journaled transaction helper.
4. Make reconcile detect and resolve incomplete transaction journals.
5. Exclude archived sandbox copies from authoritative contract scanning.

#### Verification

- Command: `node --test tests/store-atomicity.test.mjs`
- Expected: 100/100 concurrent writes preserve all events and valid JSON;
  crash-point matrix ends `CONSISTENT`.
- Full command: `npm test && node src/apex-v2.mjs project reconcile --project .`
- Expected: no regressions and reconcile `CONSISTENT`.

#### Dependencies

- fix_id: Fix-002
- depends_on: none
- conflicts_with: none
- reason: foundational state layer for later scheduler and concurrent execution.

### Fix-004: OS-Enforced Agent Capability Boundary — P1 (CRITICAL)

Addresses: E-702, security side of E-503.

#### Current Data

- Claude uses `--dangerously-skip-permissions`.
- Gemini uses `--approval-mode yolo --skip-trust`.
- In-tree scope test exists; host escape/network/secret tests do not.
- Elevated adapters: 2/3.

#### Audit Evidence

- Security and Engineering confirmed the boundary is post-execution detection,
  not preventive isolation.

#### Target

- E-702 PASS: all coding adapters execute under an OS/container sandbox.
- Default network access denied; secrets explicitly capability mounted.
- 0 host file changes in escape benchmark.
- 0 external side effects without a bound approval capability.

#### Investigation Path

1. `src/adapters/claude.mjs`.
2. `src/adapters/gemini.mjs`.
3. `src/core/agent-execution.mjs`.
4. `src/core/governance.mjs`.
5. New `tests/agent-sandbox.test.mjs`.

#### Fix Approach

1. Add an adapter-neutral capability envelope for filesystem, network, secrets,
   commands, and external side effects.
2. Run Claude/Gemini through macOS sandbox/container isolation rather than
   permission bypass alone.
3. Mount only the worker workspace and explicit read-only context.
4. Deny network and credential inheritance by default.
5. Add escape attempts for parent paths, symlink targets, network calls, and env secrets.

#### Verification

- Command: `node --test tests/agent-sandbox.test.mjs`
- Expected: every escape/secret/network probe is denied; scoped file change succeeds.
- Audit expected: E-702 PASS.
- Rollback trigger: real structured-output smoke or scoped patch generation fails.

#### Dependencies

- fix_id: Fix-004
- depends_on: none
- conflicts_with: [Fix-006]
- reason: Fix-006 may relocate adapter command wiring; security semantics must be preserved.

### Fix-005: Approval Contract V1 — P1 (CRITICAL)

Addresses: E-701.

#### Current Data

- Fingerprint binding exists.
- Approval expiry: absent.
- Actor capability and policy revision binding: absent.
- Persisted approvals: 2.

#### Audit Evidence

- Security and Product agreed stale approval could authorize changed high-risk content.

#### Target

- E-701 PASS.
- Required binding: revision, capability, artifact/action hash, policy revision,
  approver identity, decision timestamp, expiry.
- Expired or changed-action approvals reject 100% of merge attempts.

#### Investigation Path

1. `src/core/governance.mjs`.
2. `schemas/approval-request.schema.json`.
3. `src/apex-v2.mjs`, approval CLI and merge apply.
4. New `tests/approval-v1.test.mjs`.

#### Fix Approach

1. Version the approval contract.
2. Add expiry and explicit capability/action fields.
3. Include execution policy revision and complete action fingerprint.
4. Re-evaluate approval at merge time and reject stale/expired decisions.
5. Migrate legacy approvals as historical evidence, not reusable authorization.

#### Verification

- Command: `node --test tests/approval-v1.test.mjs`
- Expected: expiry, actor mismatch, policy change, and action mutation all block merge.
- Audit expected: E-701 PASS.

#### Dependencies

- fix_id: Fix-005
- depends_on: [Fix-002]
- conflicts_with: none
- reason: approval decisions require durable atomic persistence.

## Round 2

### Fix-003: Rolling Metrics, Scheduler, And Notification Delivery — P0 (HIGH)

Addresses: E-802, E-803, E-501, E-805.

#### Current Data

- Smoke age: 173.5 hours; policy maximum: 24 hours.
- Metrics/trend age: about 7.23 days.
- Adapter history: 1 snapshot over 0 days.
- Metrics use lifetime adapter pass/fail and average cycle values.
- Notification delivery mode: local outbox only.

#### Audit Evidence

- Reliability, Performance, and Delivery independently confirmed the operating gap.
- Built-in audit failed freshness on both 2026-08-06 and 2026-08-13.

#### Target

- E-802 PASS: rolling 7-day and last-20-run metrics.
- E-803 PASS: live smoke <=24h and delivery receipt/dead-letter lifecycle.
- E-805 PASS: >=7 time-separated observations over >=7 days.
- Scheduler idle cost bounded to policy and no duplicate concurrent run.

#### Investigation Path

1. `src/core/metrics.mjs`.
2. `src/core/adapter-observability.mjs`.
3. `src/core/notifications.mjs`.
4. `src/apex-v2.mjs`, `projectTick`.
5. `.apex-v2/policies/quality.json` and notification policy.

#### Fix Approach

1. Add a project heartbeat/scheduler independent of ready roadmap nodes.
2. Record rolling metrics by run/time window and per adapter.
3. Add notification dispatcher states: queued, delivering, delivered, failed,
   acknowledged, dead-letter.
4. Add bounded retry/backoff, delivery receipts, and dedupe persistence.
5. Schedule smoke and observation refresh separately from new-run creation.

#### Verification

- Command: advance a fake clock across 8 days and run
  `node --test tests/operational-observability.test.mjs`.
- Expected: 8 observations, smoke age <=24h, one delivered failure notification,
  rolling failure regression detected despite strong lifetime history.
- Audit expected: E-501/E-802/E-803/E-805 PASS.

#### Dependencies

- fix_id: Fix-003
- depends_on: [Fix-002]
- conflicts_with: [Fix-006]
- reason: scheduler writes shared state; modularization touches project command wiring.

### Fix-009: Contract Authority Classification — P3 (HIGH)

Addresses: E-401.

#### Current Data

- Contracts: 39 schemas, 1281 validated values, 60 skipped JSON, 0 errors.
- Skipped files are mainly archived sandbox project/schema copies plus empty outbox.

#### Audit Evidence

- Engineering review found no immediate invalid authoritative state, but scanner
  output cannot explain authority class.

#### Target

- E-401 PASS.
- Scanner output reports authoritative, derived, archived-sandbox, and unknown JSON separately.
- Unknown authoritative JSON count = 0.

#### Investigation Path

1. `src/core/contracts.mjs`, `contractTargets`, `scanProjectContracts`.
2. `.apex-v2/runs/*/workers/*/sandbox/`.
3. `.apex-v2/notifications/outbox.json`.
4. New `tests/contract-authority.test.mjs`.

#### Fix Approach

1. Define authority classes in the contract registry.
2. Exclude or separately count archived sandbox copies.
3. Treat empty collection files as validated container contracts.
4. Fail only on unknown authoritative state; report archived/derived copies as INFO.

#### Verification

- Command: `node src/apex-v2.mjs contracts validate --project .`
- Expected: authoritative_unknown=0, errors=0, skipped unexplained=0.
- Audit expected: E-401 PASS.

#### Dependencies

- fix_id: Fix-009
- depends_on: [Fix-002]
- conflicts_with: none
- reason: authority classification should align with transaction ownership.

### Fix-006: Command-Domain Modularization — P2 (HIGH)

Addresses: E-903 and reduces E-902/E-904 maintenance cost.

#### Current Data

- `src/apex-v2.mjs`: 4366 lines.
- Total source: 7384 lines.
- Main-file share: 59.1%.

#### Audit Evidence

- Architecture and Engineering confirmed the entry file is the dominant ownership bottleneck.

#### Target

- E-903 PASS.
- `src/apex-v2.mjs` <=1500 lines and <=25% of source.
- Each command domain has a module, tests, and explicit dependency direction.

#### Investigation Path

1. `src/apex-v2.mjs`.
2. `src/core/`.
3. New `src/commands/{project,worker,merge,run,learning}.mjs`.
4. Existing 71 tests plus new command-routing tests.

#### Fix Approach

1. Freeze behavior with routing contract tests.
2. Extract command handlers by domain without changing schemas.
3. Move audit, knowledge rendering, sandbox, and merge orchestration out of main.
4. Keep main limited to argument parsing, command registration, and error handling.
5. Add a source-size architecture gate.

#### Verification

- Command: `npm test && wc -l src/apex-v2.mjs`
- Expected: 71+ tests PASS; main <=1500 lines; CLI help unchanged.
- Audit expected: E-903 PASS.

#### Dependencies

- fix_id: Fix-006
- depends_on: [Fix-001]
- conflicts_with: [Fix-003, Fix-004]
- reason: preserve corrected audit and security semantics while moving code.

## Round 3

### Fix-007: Fresh Context Fabric And Routing Benchmark — P2 (HIGH)

Addresses: E-902 and strengthens E-203.

#### Current Data

- Knowledge markdown age: about 9.7 days.
- Stale markers: absent.
- Code explicitly states CodeGraph/semantic index is not integrated.
- Task-aware plans: 7/15.

#### Audit Evidence

- Documentation and Product confirmed knowledge freshness and internal known-issue drift.

#### Target

- E-902 PASS.
- Every knowledge artifact has source refs, generated/checked timestamps,
  confidence, unknowns, and stale-after policy.
- >=90% benchmark tasks locate relevant files/tests in <=2 searches.
- New plans: 100% task-aware.

#### Investigation Path

1. `src/apex-v2.mjs`, knowledge inventory/renderers.
2. `.apex-v2/knowledge/`.
3. `src/core/plan-graph.mjs`.
4. Optional CodeGraph adapter module.
5. New `tests/context-routing-benchmark.test.mjs`.

#### Fix Approach

1. Define versioned Context Fabric entries with freshness and confidence fields.
2. Integrate CodeGraph when present; retain deterministic native fallback.
3. Generate sourced unknowns and stale markers.
4. Add task-to-file/test routing benchmark fixtures.
5. Make stale context block or warn planning according to risk.

#### Verification

- Command: `node --test tests/context-routing-benchmark.test.mjs`
- Expected: >=90% tasks resolved in <=2 searches; all generated entries have
  source/freshness/confidence; new plans 100% task-aware.
- Audit expected: E-902 PASS and E-203 evidence strengthened.

#### Dependencies

- fix_id: Fix-007
- depends_on: [Fix-006]
- conflicts_with: none
- reason: knowledge and planning handlers should move before extension.

### Fix-008: Real Concurrency And Multi-Adapter Evidence Campaign — P2 (CRITICAL)

Addresses: E-503, E-502, E-601, E-901 and verifies all prior fixes.

#### Current Data

- Real concurrent adversarial runs: 0.
- Worker distribution: shell=37, codex=5, claude=1, gemini=1.
- Staged verification: 2/12 historical reports.
- Documentation audit samples 5/54 commands.

#### Audit Evidence

- Engineering, Security, AI Behavior, and Test agree that implementation
  contracts are broader than real-runtime evidence.

#### Target

- E-503 PASS: two concurrent workers complete disjoint writes with no state loss;
  overlap blocks deterministically.
- Each coding adapter has >=3 controlled recovery scenarios.
- All future patch-bearing verification reports use staged-copy.
- README/help/capability command agreement = 54/54.

#### Investigation Path

1. `src/core/agent-execution.mjs`.
2. `src/core/worker.mjs`.
3. `src/core/plan-graph.mjs`.
4. `src/adapters/`.
5. New `tests/concurrent-dogfood.test.mjs`,
   `tests/adapter-recovery-live.test.mjs`, and `tests/cli-surface.test.mjs`.

#### Fix Approach

1. Create isolated, bounded, cleanable concurrency fixtures.
2. Run two disjoint workers and two conflicting workers simultaneously.
3. Inject timeout, structured-output failure, and resume/fallback scenarios for
   Codex/Claude/Gemini.
4. Enforce staged-copy for every patch-bearing verification after migration.
5. Parse all command sources and fail on any command-surface drift.

#### Verification

- Command: `node --test tests/concurrent-dogfood.test.mjs tests/adapter-recovery-live.test.mjs tests/cli-surface.test.mjs`
- Expected: all scenarios PASS; no host/project contamination; command match 54/54.
- Full command: `npm test && .product-audit/audit.mjs`
- Expected: E-503/E-502/E-601/E-901 PASS and no regressions.

#### Dependencies

- fix_id: Fix-008
- depends_on: [Fix-002, Fix-003, Fix-004, Fix-005, Fix-006, Fix-007, Fix-009]
- conflicts_with: none
- reason: final dogfood must validate the hardened architecture.

## Execution Order Summary

| Round | Fixes | Dependencies | Conflicts | Notes |
|---|---|---|---|---|
| 1 | Fix-001, Fix-002, Fix-004, Fix-005 | none except Fix-005 -> Fix-002 | separate source domains | Use separate new test files |
| 2 | Fix-003, Fix-009, then Fix-006 | Fix-003/009 -> Fix-002; Fix-006 -> Fix-001 | Fix-003/Fix-006, Fix-004/Fix-006 | Higher-priority semantics first, modularize after |
| 3 | Fix-007, then Fix-008 | Fix-007 -> Fix-006; Fix-008 -> all prior | none | Final real-runtime evidence campaign |

Dependency graph:

```text
Fix-001 ───────────────> Fix-006 ──> Fix-007 ──┐
Fix-002 ──> Fix-003 ───────────────────────────┤
    ├─────> Fix-005 ───────────────────────────┤
    └─────> Fix-009 ───────────────────────────┤
Fix-004 ───────────────────────────────────────┤
                                              └─> Fix-008
```

The graph is acyclic.

## Conflict Resolution

- Fix-003 and Fix-006 both affect project command wiring. Apply Fix-003 first;
  Fix-006 must re-read and preserve scheduler semantics.
- Fix-004 and Fix-006 both affect adapter command wiring. Apply Fix-004 first;
  Fix-006 must preserve the capability boundary.
- Fix-001 and Fix-006 both affect audit command code. Apply Fix-001 first.

## Global Constraints

1. Do not modify `.product-audit/` during fix execution.
2. Run the audit after every round and compare against the 48.9% baseline.
3. Fix any new regression before continuing.
4. Every change must reference a Fix-ID.
5. Verify expectations/script hashes before every audit.
6. If a fix proves an audit assumption wrong, return to instrumentation rather
   than editing the report to look successful.
7. Preserve unrelated local changes and persistent `.apex-v2` evidence.

## Acceptance Criteria

- Audit score >=90% for two consecutive rounds.
- Effective grade A.
- CRITICAL failures = 0.
- All P0/P1 expectations PASS.
- No previously PASS expectation regresses.
- Live smoke and metrics remain fresh without a ready roadmap node.
- At least 7 days of adapter trend observations.
- Real concurrent and multi-adapter dogfood evidence is retained.

