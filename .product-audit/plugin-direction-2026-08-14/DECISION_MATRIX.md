# Direction Decision Matrix

- Decision Status: provisional
- Decision Date: 2026-08-14
- Audit Question: Which product architecture best advances Apex Forge V2?

## Candidate Definitions

- **A — CLI-only Kernel**: Continue current V2 as an operator-facing CLI.
- **B — Skill-only / V1-style**: Return execution control to the current Agent and keep only lightweight state.
- **C — Codex-first Plugin + neutral Kernel**: Codex Plugin is the first product surface; a provider-neutral Kernel owns durable truth; external workers are optional.
- **D — MCP/service-first**: Build a standalone service or MCP control plane before the plugin experience.

## Independent Scores

Scores are normalized from four independent role passes.

| Candidate | Product/UX | Architecture | AI Behavior | Platform/DX | Integrated |
|---|---:|---:|---:|---:|---:|
| A — CLI-only Kernel | 51 | 70 | 55 | 59* | **59** |
| B — Skill-only / V1-style | 64 | 62 | 71 | 76 | **68** |
| C — Codex-first Plugin + neutral Kernel | 87 | 89 | 86 | 90 | **88** |
| D — MCP/service-first | 61 | 72 | 61* | 61 | **64** |

`*` denotes an inferred normalized score where that role used a nearby candidate definition rather than the exact label.

## Decision

**Recommend C with conditions.**

The correct statement is:

> Apex Forge V2 should become a Codex-first plugin product surface backed by a
> platform-neutral, deterministic Kernel. The current Codex Agent should handle
> ordinary reasoning and implementation. External Codex/Claude/Gemini workers
> should be an optional Factory Mode for durable, parallel, or background work.

The incorrect statement is:

> Convert the Kernel itself into a Codex-specific plugin or hide the current 54
> CLI operations behind Skills without changing execution semantics.

## Why C Wins

1. It restores V1's natural-language usability without discarding V2's durable state and governance.
2. It makes Codex the fastest environment for product validation while preserving later host optionality.
3. It allows interactive work to avoid nested Codex processes and context duplication.
4. It keeps MCP/service work deferred until a stable typed control boundary has real external consumers.
5. It is reversible: the plugin can change without migrating authoritative project state.

## Rejected Alternatives

- **A rejected**: Strong operator tooling, weak end-user product and discovery.
- **B rejected**: Strong immediate UX, weak enforcement, recovery, concurrency, and audit.
- **D rejected for now**: Strong long-term interoperability, excessive deployment, security, and protocol cost before the flagship experience is proven.

## One-Way And Two-Way Decisions

- Two-way: plugin manifest, Skill names, starter prompts, local bridge implementation.
- Medium-cost: HostAdapter and WorkerExecutor contracts.
- One-way/high-cost: persisted schema changes, public Kernel API, remote service protocol, marketplace compatibility promises.

## Kill Criteria

Stop or redesign the plugin direction if any of these occur:

1. After 30 representative tasks across 5 external repositories, Plugin + Kernel does not beat V1 Skill-only on at least 4 of 6 product metrics.
2. More than 20% of normal workflows still require users to type raw CLI commands.
3. Interactive median latency or token/cost exceeds V1 by more than 25% without using recovery or parallelism.
4. A second Host Adapter requires rewriting more than 30% of shared workflow content.
5. Codex-specific concepts escape the Host Adapter and enter persisted Kernel contracts.
6. Plugin install-to-first-governed-run exceeds 5 minutes.
7. Upgrade or uninstall cannot preserve `.apex-v2` state with 100% migration verification.
