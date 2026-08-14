# Deep Dive — Plugin Direction

- Date: 2026-08-14
- Status: provisional

## Surface PASS, Deep Concern

### E-301: Durable Kernel value — PASS

- Surface evidence: core modules, 41 schemas, `.apex-v2` state, and 100 test cases exist.
- Deep concern 1: authoritative transitions span several files and are not a single transaction.
- Deep concern 2: 12 of 16 intake items are self-dogfood, so evidence distribution is highly concentrated.
- Deep concern 3: the latest 7-day metrics window contains zero runs but still evaluates PASS.
- Assessment: The Kernel is real and valuable, but current operational evidence is not strong enough to treat it as proven across external projects or concurrent plugin use.

## Confirmed Failure Chains

### Chain A: Product definition gap

```text
E-203 target user/flagship missing
  -> E-202 no proven one-step first value
  -> E-403 no comparative product benchmark
  -> E-501 plugin packaging has no validated acceptance target
```

Root cause: architecture was defined before the initial user and flagship journey.

### Chain B: Host/worker boundary gap

```text
E-302 provider leakage in Kernel
  -> E-303 no HostAdapter contract
  -> E-304 no current-host execution path
  -> E-402 nested external Agent remains default
  -> E-502 later host portability is unproven
```

Root cause: all adapters were modeled as external worker runtimes, so the host Agent was never represented.

### Chain C: Semantic execution gap

```text
E-401 cognitive nodes pass through shell commands
  -> plugin shell would improve packaging but not execution quality
  -> E-403 cannot prove superiority over V1
```

Root cause: the graph models semantic stages, but the executor treats several of them as deterministic command checks.

## Trend And Ratio Findings

- Dogfood concentration: 12/16 intake items, or 75%, contain `dogfood`.
- Recent activity: 0 delivery runs in the current 7-day metrics window.
- Cognitive evidence ratio: 0/4 audited cognitive nodes use an Agent/human semantic adapter.
- Product surface ratio: 0 V2 Skills and 0 plugin manifests versus 54 documented command entries.
- Provider leakage: 46 Codex/Claude/Gemini references in `src/core`, including two direct Codex adapter imports.

## Effective Interpretation

- Strategic fit of recommended architecture: **88/100**
- Current implementation readiness for that architecture: **96.4% / A**

The implementation now satisfies 12 of 13 expectations. The remaining WARN is
the comparative Product Gate: 9/90 real runs are recorded. Simple, interrupted,
and review-defect runs have not shown a latency or cost advantage over V1, and
the review-defect Plugin run exposed a false durable-completion claim that was
fixed in the Ship Skill but still needs fresh benchmark confirmation.
