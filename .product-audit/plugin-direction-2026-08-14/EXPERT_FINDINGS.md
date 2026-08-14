# Expert Findings — Plugin Direction

- Audit Date: 2026-08-14
- Scope: provisional
- Active Roles: Product/UX, Architecture/Reliability, AI Behavior/Test/Engineering, Platform Strategy/DX
- Independent Passes: 4

## Finding Matrix

| ID | Finding | Evidence | Severity | Confidence | Role | Cross-check |
|---|---|---|---|---|---|---|
| F-001 | Previous 100% / A audit proves Kernel commitments, not product direction or UX | `.product-audit/state.md`; old audit deferred UX | CRITICAL | high | Product, Platform | confirmed |
| F-002 | Target user, buyer, flagship scenario, and observation window are not defined | `planning/v2-planning-recommendation.md:11-29`; `planning/project-operating-model.md:23-47` | HIGH | high | Product | unique |
| F-003 | CLI-only journey has excessive cognitive load | `README.md:77-96`; `capabilities.json` command groups | HIGH | high | Product, Platform | confirmed |
| F-004 | Durable Kernel is the real V2 differentiation and must be retained | `README.md:46-75`; staged verification, approval, reconcile, artifacts | CRITICAL | high | Product, Architecture, AI Behavior | confirmed |
| F-005 | A Codex plugin can improve discovery and first use, but does not itself improve task correctness | local Superpowers manifest; no V2 plugin or Skills | HIGH | high | Product, Platform, AI Behavior | confirmed |
| F-006 | No Host Adapter exists; all current Agent adapters are external Worker Executors | `src/adapters/registry.mjs`; `src/adapters/codex.mjs`; no host contract | HIGH | high | Architecture, Platform, AI Behavior | confirmed |
| F-007 | Context, risk, design, verification, and review are shell-backed rather than semantic Agent work | `src/core/plan-graph.mjs:28-147`; `src/apex-v2.mjs:997-1131` | CRITICAL | high | all roles | confirmed |
| F-008 | Provider-neutral boundary is already leaking Codex into core and policies | `src/core/agent-execution.mjs:11,50`; 46 provider references in `src/core` | HIGH | high | Architecture, Platform | confirmed |
| F-009 | Automatic runtime fallback is not closed end to end | fallback changes worker adapter, but automatic runner accepts only `worker.adapter === "codex"` | CRITICAL | high | AI Behavior | unique, direct code evidence |
| F-010 | Current success evidence is concentrated in self-dogfood and stale-window metrics | 12/16 intake titles contain `dogfood`; 7-day window has 0 runs while evaluation is PASS | HIGH | high | Product | unique, direct state evidence |
| F-011 | Local Codex/Node runtime was broken and blocked fresh validation | Node 25.8.0 required missing `libllhttp.9.3.dylib`; resolved by Node 26.7.0 reinstall | HIGH | high | Architecture, Platform, AI Behavior | resolved |
| F-012 | Plugin/CLI/heartbeat concurrency increases the impact of non-transactional multi-file transitions | run and merge transitions write several authoritative objects sequentially | CRITICAL | medium | Architecture | unique |
| F-013 | MCP/service-first is premature for the current flagship hypothesis | MCP is designed as an adapter; no validated MCP-only requirement exists | MEDIUM | high | Product, Architecture, Platform | confirmed |
| F-014 | Cross-agent portability requires separate Host Adapters and OS/runtime validation, not only more Worker Adapters | current worker registry and macOS sandbox/launchd dependencies | HIGH | high | Architecture, Platform | complemented |

## Disagreement Ledger

| Item | Roles | Disagreement | Adjudication |
|---|---|---|---|
| Current readiness | Initial plugin-direction readiness was 12.5%; current implementation audit is 96.4% | Different implementation snapshots | Use 96.4% as current; retain 12.5% only as the pre-upgrade baseline |
| Confidence | Architecture calls the relative direction high-confidence; Product keeps the decision provisional | Evidence supports relative ranking but not real-user superiority | Direction ranking is high-confidence; final product commitment remains provisional until benchmarks |
| First implementation step | Product favors a fast plugin prototype; Architecture favors boundary and transaction work first | Speed of UX learning vs runtime correctness | Build a non-release plugin spike in parallel with boundary freeze; no release until semantic and transaction gates pass |
| Kernel thickness | Product says retain Kernel; AI Behavior recommends a thin Kernel | Possible conflict over scope | Keep deterministic state/policy/evidence/verification/recovery; move cognitive methodology and host interaction into Skills/Host Adapter |

## Expert Panel Summary

- Role findings: 14 integrated
- Confirmed by duplicate review: 9
- Complemented: 1
- Evidence-supported unique: 4
- Conflicted: 3, all adjudicated above
- Unsupported/dropped: 0
- Open evidence gaps:
  - No target-user interviews
  - No public marketplace release validation
  - Comparative Product Gate remains incomplete at 9/90 runs
  - Four repositories and the parallel scenarios remain unmeasured
