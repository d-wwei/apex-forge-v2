# Deep Dive — Apex Forge V2

- Date: 2026-08-13
- Source Report: `.product-audit/reports/audit-2026-08-13.md`
- Report Status: provisional
- Framework: distribution, trend, ratio, status distribution, causal trace

## Surface PASS, Deep Concern

### E-203: PlanGraph task awareness

- Surface: PASS.
- Ratio: 7/15 persisted plans are task-aware (46.7%).
- Ratio: latest built-in summary reports only 4/15 fully covered plans (26.7%).
- Assessment: Current generation logic is improved, but historical evidence is
  dominated by older/static plans. Keep PASS for current behavior, but do not
  claim broad project-level proof.

### E-502: Recovery paths

- Surface: PASS.
- Distribution: workers are shell=37, codex=5, claude=1, gemini=1.
- Distribution: adapter results are shell=32, codex=4, claude=3, gemini=2,
  human=1.
- Assessment: Retry/fallback/resume contracts are implemented, but real
  multi-adapter recovery evidence is narrow. Status remains provisional.

### E-601: Staged candidate verification

- Surface: PASS.
- Ratio: 2/12 verification reports use `staged-copy`; 9 are legacy/no workspace
  mode and 1 uses project-root mode.
- Ratio: 2 staged reports vs 9 merged integrations.
- Assessment: The current control is strong and adversarially tested, but
  historical integrations predate it. Require all future patch-bearing runs to
  use staged-copy and track the ratio incrementally.

### E-901: Documentation and CLI alignment

- Surface: PASS.
- Ratio: 5 sampled commands match across README/help, while
  `capabilities.json` declares 54 commands.
- Assessment: No current mismatch was found, but coverage is partial and there
  is no automated full command-surface diff.

## PASS Expectations Cleared

| ID | Deep Check | Result |
|---|---|---|
| E-201 | Current help/validate/contracts/reconcile all exit 0 | cleared |
| E-202 | 18/71 tests are explicit negative/fail-closed cases | cleared |
| E-602 | Conflict, resolution, and ambiguous replacement tests all pass | cleared |

## WARN/FAIL Deep Analysis

| ID | Surface | Deep Check | Finding |
|---|---|---|---|
| E-401 | WARN | Distribution | 60 skipped JSON are mostly historical sandbox copies plus empty outbox; scanner lacks authority classification |
| E-402 | WARN | Status | No atomic rename/fsync/lock; no crash or concurrent writer benchmark |
| E-501 | FAIL | Trend | 641/648 events occurred on 2026-07-31 or 2026-08-03; no delivery runs after 2026-08-03 |
| E-503 | WARN | Ratio | Structural worktree/WIP tests exist; real concurrent adversarial runs=0 |
| E-701 | WARN | Status | 2 approvals exist; expiry, actor capability, and policy revision are absent |
| E-702 | WARN | Distribution | 2/3 coding adapters use bypass/yolo permission modes; host escape tests=0 |
| E-801 | WARN | Trend | 648 events are schema checked, but no full event replay reconstructs state |
| E-802 | FAIL | Trend | 10 metrics snapshots largely repeat lifetime counts; no rolling windows |
| E-803 | FAIL | Trend | Smoke freshness failed on 2026-08-06 and again 2026-08-13; no idle scheduler repaired it |
| E-804 | FAIL | Causal | Audit counts test declarations and capability IDs; it does not execute current tests |
| E-805 | FAIL | Trend | Adapter history has 1 snapshot across 0 days; it is not yet a trend |
| E-902 | WARN | Distribution | All knowledge markdown files are about 9.7 days old; no stale markers; several lack source sections |
| E-903 | FAIL | Ratio | `src/apex-v2.mjs` is 4366/7384 source lines (59.1%) |
| E-904 | FAIL | Distribution | 0/6 required production adversarial risk classes have dedicated tests |

## Status Distribution

- Runs: 16/16 done, all created on 2026-07-31 or 2026-08-03.
- Workers: merged=10, evidence_submitted=30, decision_submitted=1,
  dropped=1, active=2.
- Adapter results: PASS=32, FAIL=9, DECISION=1.
- Verification reports: PASS=12; staged-copy=2, project-root=1, unspecified=9.
- Integrations: MERGED=9, NOOP=5.
- Risks: 1 mitigated, 0 open.
- Learning: 36/36 applied.

The terminal-state ratios look healthy, but nearly all activity is concentrated
in two implementation days. This is bootstrap/dogfood evidence, not continuous
operational evidence.

## Causal Chains

```text
E-804 Audit evidence design [FAIL, root]
  ├─> E-203 weak PASS can look stronger than its 7/15 distribution
  ├─> E-502 weak PASS can look stronger than sparse real adapter recovery
  ├─> E-601 weak PASS can hide 2/12 staged verification usage
  └─> E-904 adversarial gaps remain invisible

E-402 Non-atomic state store [WARN, root]
  ├─> E-503 real concurrent isolation cannot be trusted
  ├─> E-801 reconcile must repair symptoms instead of preventing partial writes
  └─> E-803 outbox/event/project updates can lose consistency under concurrency

E-802 Lifetime metrics [FAIL, root]
  └─> E-501 quality gate cannot represent current operational health

E-803 Missing autonomous freshness/delivery loop [FAIL, root]
  ├─> E-501 project loop becomes operationally stale
  └─> E-805 trend history never accumulates

E-702 Permission-bypass agent boundary [WARN, root]
  └─> E-503 parallel execution remains unsafe beyond in-tree diff checks

E-903 Main-file concentration [FAIL, root]
  ├─> E-902 generated knowledge/known-issues drifts
  └─> E-904 cross-cutting adversarial tests are expensive to add
```

## Weak PASS Resolution

| ID | Decision | Status Impact |
|---|---|---|
| E-203 | deep_concern | Remains PASS but provisional |
| E-502 | still_provisional | Real adapter recovery dogfood required |
| E-601 | deep_concern | Current control passes; future staged ratio must reach 100% |
| E-901 | deep_concern | Full command-surface diff required |

## Effective Interpretation

The surface audit is already D. Deep analysis does not lower the arithmetic
score, but it shows that 4 of 7 PASS expectations have narrow evidence. The
project has a strong functional kernel and verification layer, but its
operational, security, architecture, and self-audit layers remain prototype
grade.

