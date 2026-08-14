# Expert Panel Findings

- Date: 2026-08-13
- Execution Mode: sequential independent passes
- Audit Scope: provisional
- Active Roles: Product, Architecture, Engineering, Test, Security, Reliability, Performance, Delivery, Documentation, AI Behavior

## Finding Matrix

| ID | Finding | Evidence | Severity | Confidence | Role | Cross-check |
|---|---|---|---|---|---|---|
| R-prod-001 | The long-running project OS promise lacks fresh autonomous operation evidence | built-in audit FAIL; smoke age 173.5h | HIGH | high | Product | confirmed by Reliability |
| R-arch-001 | Durable state uses direct overwrite/append without atomic commit or locking | `src/lib/common.mjs:27-30`, `src/core/store.mjs:25-42` | CRITICAL | high | Architecture | confirmed by Reliability |
| R-arch-002 | The CLI entry owns too many domains and is a structural bottleneck | `src/apex-v2.mjs` 4366 lines, 59.1% of source | HIGH | high | Architecture | confirmed by Engineering |
| R-eng-001 | Candidate patch verification is one of the strongest implemented controls | staged syntax-error and missing-operation tests PASS | CRITICAL positive | high | Engineering | confirmed by Test |
| R-eng-002 | Parallel isolation is structurally present but not proven under real concurrent writers | WIP/worktree tests; no concurrent adversarial test | CRITICAL | high | Engineering | complemented by Security |
| R-test-001 | Built-in audit can PASS from test-file counts and capability declarations without executing behavior | `src/apex-v2.mjs:3421-3425,3483-3502,3582` | CRITICAL | high | Test | confirmed by Product |
| R-test-002 | Six production-risk adversarial classes are absent | E-904 result 0/6 | HIGH | high | Test | confirmed by Security and Reliability |
| R-sec-001 | Claude and Gemini run with permission bypass/yolo while host escape is untested | `src/adapters/claude.mjs:12`, `src/adapters/gemini.mjs:11` | CRITICAL | high | Security | confirmed by Engineering |
| R-sec-002 | Approval fingerprinting exists, but expiry and actor capability are absent | approval schema and E-701 | CRITICAL | high | Security | complemented by Product |
| R-rel-001 | Smoke freshness and notification delivery are not autonomous | smoke age 173.5h; outbox-only notification mode | HIGH | high | Reliability | confirmed by Delivery |
| R-perf-001 | Quality metrics use lifetime aggregates and cannot reveal recent-window regressions | `src/core/metrics.mjs:13-64` | HIGH | high | Performance | confirmed by Reliability |
| R-delivery-001 | The project is not packaged as a releaseable product | `version=0.0.0`, no `.git`, CI, changelog, release/rollback runbook | HIGH | high | Delivery | unique; future scope boundary |
| R-doc-001 | Context and known-issue artifacts are stale and internally contradictory | knowledge age 9.7d; generated known issues still says shipped features are missing | HIGH | high | Documentation | confirmed by Product |
| R-ai-001 | Structured output, retry, fallback, and resume are implemented, but real recovery evidence is sparse | tests PASS; few persisted real adapter sessions/fallbacks | MEDIUM | medium | AI Behavior | unique |

## Role Coverage Summary

| Role | Findings | Main Conclusion |
|---|---:|---|
| Product | 1 | Prototype behavior is stronger than operational continuity |
| Architecture | 2 | State durability and main-file concentration are limiting |
| Engineering | 2 | Verification is strong; concurrency proof is weak |
| Test | 2 | Test volume is good, adversarial production coverage is not |
| Security | 2 | Capability boundaries are not OS-enforced |
| Reliability | 1 | Freshness and alert delivery are not autonomous |
| Performance | 1 | Metrics are cumulative rather than rolling |
| Delivery | 1 | No release/CI/package maturity |
| Documentation | 1 | Knowledge and known-issues are stale |
| AI Behavior | 1 | Recovery contracts exist but real-runtime evidence is narrow |

## Duplicate Review Summary

- Confirmed by duplicate review: R-prod-001, R-arch-001, R-arch-002,
  R-eng-001, R-test-001, R-test-002, R-sec-001, R-rel-001, R-perf-001,
  R-doc-001.
- Complemented: R-eng-002, R-sec-002.
- Evidence-supported unique: R-delivery-001, R-ai-001.
- Unsupported/dropped: 0.

## Disagreement Ledger

| Item | Roles | Disagreement | Evidence A | Evidence B | Adjudication |
|---|---|---|---|---|---|
| E-503 result | Security vs Engineering | Security treats scratch/yolo as unsafe; Engineering notes in-tree post-diff enforcement | permission flags and no escape test | write-scope diff test passes | Keep CRITICAL severity but WARN result: boundary exists, host isolation unproven |
| E-701 severity | Security vs Product | Security says CRITICAL; Product says HIGH for current prototype | approvals authorize sensitive merges | no production release surface yet | Keep CRITICAL because stale approval can authorize changed content |

## Open Evidence Gaps

1. No safe destructive host-escape benchmark.
2. No real two-worker concurrent write dogfood.
3. No mutation test proving the built-in audit rejects fake capability/test-count PASS.
4. No rolling-window regression fixture.
5. No external notification delivery receipt or dead-letter evidence.

