# Audit Report — Apex Forge V2

**Date**: 2026-08-13
**Audit Period**: current snapshot plus recent persisted history
**Project Type**: cli-tool + ai-agent-system
**Commitment Scope**: provisional
**Audit Report Status**: provisional
**Overall Score**: 100.0%
**Grade**: A

## Executive Summary

| Metric | Value |
|---|---:|
| Total Expectations | 21 |
| Passing | 21 |
| Failing | 0 |
| Warnings | 0 |
| CRITICAL Failures | 0 |
| Automated Coverage | 100% |
| Weak-Evidence PASS | 2 |
| Open Audit Issues | 1 (provisional commitment scope) |

## Scope Confirmation

| Field | Value |
|---|---|
| Commitment Review | `.product-audit/COMMITMENT_REVIEW.md` |
| Confirmation Status | provisional |
| Confirmed By | not yet confirmed |
| Confirmed At | not yet confirmed |
| Provisional Caveats | Current shipped claims inferred from docs/code; roadmap items excluded |

## Audit-of-Audit Review

| Layer | Artifact | Status | Open Issues |
|---|---|---|---|
| Commitment Mining | `COMMITMENT_REVIEW.md` | provisional | User confirmation pending |
| Audit Script | `AUDIT_SCRIPT_REVIEW.md` | provisional | Scope remains provisional |
| Audit Result | `AUDIT_RESULT_REVIEW.md` | pending at generation | Independent recomputation required |

## CRITICAL Failures

None. No CRITICAL failures detected.

**CRITICAL Blocker Status**: CLEAR — no critical blockers.

## All Results

| ID | Severity | Score | Result | Metric Type | Evidence |
|---|---|---:|---|---|---|
| E-201 | MEDIUM | 100 | PASS | snapshot | help=0, validate=0, contracts=0, reconcile=0 |
| E-202 | HIGH | 100 | PASS | snapshot | npm_test=0, negative_path_tests=18 |
| E-203 | HIGH | 100 | PASS | snapshot | npm_test=0, required_tests=2/2, persisted_plans=15 |
| E-401 | HIGH | 100 | PASS | snapshot | schemas=41, validated=1198, skipped_json=0, errors=0 |
| E-402 | CRITICAL | 100 | PASS | snapshot | atomic_write_or_lock=true, direct_overwrite_append=true, crash_concurrency_test=true |
| E-501 | HIGH | 100 | PASS | incremental | npm_test=0, built_in_audit=PASS, last_event_age_hours=0.0 |
| E-502 | HIGH | 100 | PASS | snapshot | npm_test=0, recovery_classes=5/5 |
| E-503 | CRITICAL | 100 | PASS | snapshot | npm_test=0, structural_isolation=true, real_concurrent_adversarial=true |
| E-601 | CRITICAL | 100 | PASS | snapshot | npm_test=0, staged_adversarial_tests=true |
| E-602 | HIGH | 100 | PASS | snapshot | npm_test=0, conflict_classes=3/3 |
| E-701 | CRITICAL | 100 | PASS | snapshot | npm_test=0, fingerprint_bound=true, expiry_modeled=true |
| E-702 | CRITICAL | 100 | PASS | snapshot | elevated_adapter_permissions=false, in_tree_scope_test=true, host_escape_test=true |
| E-801 | HIGH | 100 | PASS | snapshot | reconcile=CONSISTENT, corruption_test=true, full_event_replay=true |
| E-802 | HIGH | 100 | PASS | incremental | lifetime_aggregation=true, rolling_window=true |
| E-803 | HIGH | 100 | PASS | incremental | smoke_age_hours=2.7, max_age_hours=24, external_delivery_lifecycle=true |
| E-804 | CRITICAL | 100 | PASS | snapshot | executes_current_tests=true, test_count_proxy=false, capability_manifest_proxy=false |
| E-805 | MEDIUM | 100 | PASS | incremental | observations=7, span_days=9.8 |
| E-901 | MEDIUM | 100 | PASS | snapshot | shared_documented_commands=5/5 |
| E-902 | HIGH | 100 | PASS | incremental | max_knowledge_age_days=0.1, source_sections=true, stale_markers=true, semantic_gap_declared=false |
| E-903 | HIGH | 100 | PASS | snapshot | main_lines=1495, total_source_lines=8881, main_share=16.8% |
| E-904 | HIGH | 100 | PASS | snapshot | adversarial_classes=6/6; {"crash_consistency":true,"concurrent_writers":true,"sandbox_escape":true,"false_audit_pass":true,"notification_delivery":true,"recent_metric_trap":true} |

## Conditional Severity Notes

- E-902 remained HIGH because mapped project knowledge is present; its freshness and uncertainty metadata are incomplete.

## Weak-Evidence PASS

| ID | Evidence Gap | Review Source | Phase 4 Action |
|---|---|---|---|
| E-203 | Most evidence is fixtures plus historical persisted plans | result review | sample recent diverse intake plans |
| E-502 | Recovery adapters are substantially simulated | result review | run controlled real adapter failure/recovery |

## Expert Panel Summary

| Metric | Value |
|---|---|
| Active Roles | Product, Architecture, Engineering, Test, Security, Reliability, Performance, Delivery, Documentation, AI Behavior |
| Role Findings | pending sequential synthesis |
| Confirmed by Duplicate Review | pending |
| Conflicted | pending |
| Unsupported/Dropped | pending |
| Open Evidence Gaps | pending |

## Quality by Category

| Category | Expectations | Passing | Score |
|---|---:|---:|---:|
| Interface and Planning | 3 | 3 | 100.0% |
| State and Contracts | 2 | 2 | 100.0% |
| Runtime and Recovery | 3 | 3 | 100.0% |
| Verification and Integration | 2 | 2 | 100.0% |
| Security | 2 | 2 | 100.0% |
| Observability and Audit | 5 | 5 | 100.0% |
| Documentation and Architecture | 4 | 4 | 100.0% |

## Conforming / Non-Conforming / Warning

- **Conforming**: E-201, E-202, E-203, E-401, E-402, E-501, E-502, E-503, E-601, E-602, E-701, E-702, E-801, E-802, E-803, E-804, E-805, E-901, E-902, E-903, E-904
- **Non-Conforming**: None
- **Warning**: None

## Recommendations


## Integrity

- Expectations hash: PASS (7264adab0544f4b239d65527becc1221132a8ca21a4ce3acfb3417b11173e0ad)
- Script hash: PASS (ddd25c139be7d872d5f3ca55959796c9445245b10e0130ea3677bc8f1cdb5a6c)
