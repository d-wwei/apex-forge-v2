# Diagnosis — Apex Forge V2

- Date: 2026-08-13
- Source Report Status: provisional
- Explicit Provisional Use: accepted by the user's request for immediate completion and optimization assessment

## Causal Root Summary

Six root causes explain 18 FAIL/WARN/deep-concern findings:

1. Self-audit measures declarations and counts rather than independent execution.
2. File-backed state has no atomic transaction or concurrency control.
3. Operational freshness has no idle scheduler and notifications stop at an outbox.
4. Quality metrics are lifetime aggregates, not rolling operational signals.
5. Agent execution relies on prompt/post-diff boundaries instead of OS-enforced capabilities.
6. The main CLI file concentrates most orchestration domains.

## Classification And Priority

| Expectation | Result | Classification | Priority | Root/Downstream | Confidence |
|---|---|---|---|---|---|
| E-804 | FAIL | false_pass | P0 | root | high |
| E-402 | WARN | never_worked | P0 | root | high |
| E-803 | FAIL | regressed + never_worked delivery | P0 | root | high |
| E-802 | FAIL | never_worked | P0 | root | high |
| E-904 | FAIL | never_worked | P0 | root/enabler | high |
| E-702 | WARN | never_worked | P1 | independent security root | high |
| E-701 | WARN | never_worked | P1 | independent governance root | high |
| E-503 | WARN | never_worked | P1 | downstream E-402/E-702 | high |
| E-501 | FAIL | regressed | P2 | downstream E-802/E-803 | high |
| E-903 | FAIL | degrading | P2 | root | high |
| E-805 | FAIL | never_worked | P2 | downstream E-803 | high |
| E-801 | WARN | never_worked | P2 | downstream E-402 | high |
| E-902 | WARN | regressed | P2 | downstream E-903 | high |
| E-401 | WARN | data_quality | P3 | independent | high |
| E-203 | PASS/deep concern | data_quality | P3 | downstream E-804 | high |
| E-502 | PASS/provisional | data_quality | P3 | downstream E-804 | medium |
| E-601 | PASS/deep concern | data_quality | P3 | downstream E-804 | high |
| E-901 | PASS/deep concern | data_quality | P3 | downstream E-804/E-903 | high |

## Fix Chains

### Fix Chain A: Trustworthy Evidence

- Root: E-804.
- Enabler: E-904.
- Downstream: E-203, E-502, E-601, E-901.
- Leverage: fixing independent executed evidence plus adversarial benchmarks
  resolves or clarifies 6 findings.

### Fix Chain B: Durable Concurrent State

- Root: E-402.
- Downstream: E-503, E-801, part of E-803.
- Leverage: atomic writes and project locking address 4 findings.

### Fix Chain C: Autonomous Operations

- Roots: E-802 and E-803.
- Downstream: E-501 and E-805.
- Leverage: rolling metrics plus a scheduler/dispatcher address 4 findings.

### Fix Chain D: Agent Safety

- Root: E-702.
- Downstream: E-503.
- Related governance: E-701.
- Leverage: capability sandbox plus approval v1 address 3 findings.

### Fix Chain E: Maintainable Architecture

- Root: E-903.
- Downstream: E-902 and documentation/test expansion cost.
- Leverage: command-domain extraction addresses 3 findings and lowers future change risk.

### Independent: Contract Authority Classification

- E-401 scanner should distinguish authoritative runtime state from archived
  sandbox copies instead of reporting an undifferentiated skipped count.

## Priority Order

### P0

1. E-804/E-904: make audit evidence executable and adversarial.
2. E-402: atomic state writes and concurrency control.
3. E-802/E-803: rolling metrics, scheduler, notification delivery lifecycle.

### P1

1. E-702: OS-enforced agent capability boundary.
2. E-701: approval expiry, actor capability, policy/action binding.
3. E-503: real concurrent worker dogfood after state and sandbox fixes.

### P2

1. E-903: split the CLI god file.
2. E-801: full event replay and materialized-state comparison.
3. E-902: Context Fabric freshness and task-routing benchmark.
4. E-501/E-805: verify continuous operation and real trend accumulation.

### P3

1. E-401: contract scanner authority classes.
2. E-203/E-502/E-601/E-901: broaden real evidence distribution.

## Leverage Statement

Fixing the five main chains addresses all 18 non-clean expectations. The
highest-leverage sequence is:

`trustworthy audit -> atomic state -> operational scheduler/metrics -> agent safety -> modular architecture/context`.

## Trust Boundary

This diagnosis is provisional because commitment scope is not user-confirmed
and destructive escape tests were not executed. Every P0/P1 prescription must
include a verification step that either resolves or contains that uncertainty.

