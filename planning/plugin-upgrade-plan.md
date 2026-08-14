# Apex Forge V2 Agent Plugin Upgrade Plan

- Date: 2026-08-14
- Status: plan complete; local implementation candidate ready; comparative Product Gate pending
- Decision source: `.product-audit/plugin-direction-2026-08-14/DECISION_MATRIX.md`
- Strategic direction score: 88/100
- Current plugin-direction readiness: 96.4% / A (Product Gate remains provisional)

## Implementation Status

| Phase | Status | Evidence |
|---|---|---|
| Phase 0 | Complete | Node/Codex restored; fresh tests, contracts, strict validation |
| Phase 1 | Complete | HostAdapter/WorkerExecutor contracts, provider-neutral core, transactions |
| Phase 2 | Complete | Host cognitive actions, shell semantic gate, real fallback, cancellation |
| Phase 3 | Complete | Codex plugin installed; six Skills discovered in a new Codex process |
| Phase 4 | Complete | Interactive default, explicit Factory path, usage and recovery evidence |
| Phase 5 | Blocked on evidence | 30-task/5-repo harness exists; 9/90 real comparison runs recorded |
| Phase 6 | Complete for current scope | Claude plugin installed; DeepSeek provider/executor conformance passes |
| Phase 7 | Deferred by design | MCP trigger conditions are not met |

## 1. Decision

Apex Forge V2 will become a **Codex-first Agent Plugin product** backed by a
**platform-neutral durable Kernel**.

The Plugin is the product surface. The Kernel remains the source of truth.

```text
User
  -> Host Agent Plugin
     -> Shared Apex Forge Workflows
        -> HostAdapter
           -> Platform-neutral Kernel
              -> Interactive execution by current Host Agent
              -> Optional Factory Mode through WorkerExecutors
```

This plan does not:

- convert the Kernel into Codex-specific code;
- hide the existing CLI behind Skills without changing execution semantics;
- make nested Codex execution the default;
- build MCP/service-first before plugin dogfood;
- attempt Codex, Claude, DeepSeek, Gemini, and every other host simultaneously.

## 2. Product Contract

### Initial target user

Provisional target user:

> A developer or technical lead using Codex on a long-running repository who
> needs natural-language development workflows, interruption recovery, evidence,
> review gates, and optional parallel execution.

This target must be confirmed during Phase 0. If the primary target becomes a
user who only needs one-shot coding guidance, Skill-only may be the better
product.

### Flagship scenario

```text
User: "Use Apex Forge to implement this requirement."

1. The plugin recognizes the intent and opens or resumes the project.
2. The Kernel records the intake and derives the task graph.
3. The current Host Agent performs context, planning, implementation, and review
   in Interactive Mode.
4. Deterministic checks run through the Kernel.
5. Long or parallel slices may be delegated to isolated WorkerExecutors.
6. The plugin reports progress, risks, approvals, and final evidence in chat.
7. No normal-path raw CLI command is required from the user.
```

### Product modes

| Mode | Default use | Executor | Kernel role |
|---|---|---|---|
| Interactive | Normal single-user work | Current Host Agent | State, graph, evidence, policy, verification |
| Factory | Long, parallel, background, resumable work | External WorkerExecutors | Scheduling, isolation, merge, recovery |
| Operator | Debugging and recovery | CLI | Explicit administrative control |

Interactive Mode is the default. Factory Mode is opt-in through routing policy.
The CLI remains supported but is no longer the primary user experience.

## 3. Extension Model

Cross-Agent support is split into three boundaries. They must not be combined
into one generic `adapter` concept.

### 3.1 HostAdapter

Represents the Agent environment in which the user is currently interacting.

Examples:

- `codex-host`
- `claude-code-host`
- `gemini-host`
- future `deepseek-agent-host`, only when a stable Agent host exists

Required contract:

```text
describeHost()
openProject()
claimAction()
submitArtifact()
requestApproval()
reportProgress()
cancelAction()
```

HostAdapter owns:

- native plugin/Skill packaging;
- host tool-name mapping;
- current conversation interaction;
- approval and progress presentation;
- conversion between host actions and Kernel contracts.

HostAdapter must not own:

- ProjectState;
- PlanGraph semantics;
- approval truth;
- artifact truth;
- merge state;
- retry policy.

### 3.2 WorkerExecutor

Represents an isolated external coding Agent used by Factory Mode.

Examples:

- `codex-cli`
- `claude-code-cli`
- `gemini-cli`
- `generic-agent-runner`

Required contract:

```text
inspect()
execute()
resume()
cancel()
collectUsage()
```

WorkerExecutor reports capabilities rather than provider identity:

```text
structured_output
workspace_read
workspace_write
session_resume
tool_use
network
usage_reporting
```

PlanGraph must request capabilities. It must not hard-code `codex`, `claude`, or
`gemini`.

### 3.3 ModelProvider

Represents an LLM API consumed inside a generic Agent runner.

Examples:

- OpenAI
- Anthropic
- DeepSeek
- other OpenAI-compatible providers

The Kernel does not call ModelProvider directly. ModelProvider belongs inside a
WorkerExecutor or HostAdapter implementation.

DeepSeek support should initially use:

```text
DeepSeek API
  -> OpenAI-compatible ModelProvider
     -> generic-agent-runner WorkerExecutor
```

Do not claim a `deepseek-agent-host` until there is a specific, stable Agent
runtime whose tools, session model, permissions, and plugin lifecycle can be
tested.

## 4. Target Repository Structure

The migration should converge toward:

```text
v2/
  src/
    core/                    # provider-neutral Kernel
    contracts/
      host-adapter.mjs
      worker-executor.mjs
      execution-capability.mjs
    hosts/
      registry.mjs
      codex/
      claude-code/
      generic/
    executors/
      registry.mjs
      codex-cli.mjs
      claude-code-cli.mjs
      gemini-cli.mjs
      generic-agent-runner.mjs
    providers/
      openai-compatible.mjs
      deepseek.mjs
    bridge/
      local-host-bridge.mjs
    cli/                     # operator surface only
  workflows/                 # shared behavioral source
    intake.md
    plan.md
    execute.md
    review.md
    ship.md
    status.md
  plugins/
    codex/
      .codex-plugin/plugin.json
      skills/
      scripts/
      assets/
    claude-code/             # added after Codex validation
      .claude-plugin/plugin.json
      skills/
    generic-agent/           # portable Skill package, later
  schemas/
    host-action.schema.json
    host-result.schema.json
    executor-capability.schema.json
    executor-result.schema.json
  tests/
    contracts/
    conformance/
    plugin/
    benchmarks/
```

The current `src/adapters/` remains as a compatibility layer during migration.
It should eventually become `src/executors/`.

## 5. Requirements

| ID | Requirement | Source |
|---|---|---|
| REQ-001 | Users can start and complete the flagship workflow through natural language | Direction audit E-201/E-202 |
| REQ-002 | Codex plugin includes manifest, starter prompts, and focused Skills | Direction audit E-501 |
| REQ-003 | Kernel remains the only durable source of truth | Existing V2 architecture |
| REQ-004 | HostAdapter and WorkerExecutor are separate typed contracts | Direction audit E-303 |
| REQ-005 | Kernel schedules by capabilities, not provider names | Direction audit E-302/E-502 |
| REQ-006 | Interactive Mode uses the current Host Agent without nested Agent launch | Direction audit E-304/E-402 |
| REQ-007 | Factory Mode remains available for durable and parallel work | Existing V2 architecture |
| REQ-008 | Cognitive nodes require semantic Agent or human evidence | Direction audit E-401 |
| REQ-009 | Deterministic shell checks cannot satisfy cognitive output contracts | Direction audit E-401 |
| REQ-010 | Retry, fallback, resume, and cancellation work across all WorkerExecutors | Expert finding F-009 |
| REQ-011 | Multi-file Kernel transitions are revisioned, idempotent, and concurrency-safe | Expert finding F-012 |
| REQ-012 | Plugin install, upgrade, rollback, and uninstall preserve `.apex-v2` state | Decision kill criteria |
| REQ-013 | Codex-specific code is confined to `hosts/codex` and `plugins/codex` | Direction audit E-302 |
| REQ-014 | Claude Code can be added without changing Kernel workflow semantics | User requirement |
| REQ-015 | DeepSeek can be used through a generic ModelProvider/WorkerExecutor | User requirement |
| REQ-016 | Every HostAdapter and WorkerExecutor passes a shared conformance suite | Portability requirement |
| REQ-017 | CLI remains available for operators but is not needed in normal use | Product contract |
| REQ-018 | Plugin + Kernel is compared against V1 and CLI-only on real tasks | Direction audit E-403 |
| REQ-019 | Usage captures wall time, tokens when available, tool calls, retries, and nested launches | Cost gate |
| REQ-020 | MCP/service work starts only after explicit trigger conditions are met | Direction audit E-503 |

## 6. Delivery Roadmap

Each requirement maps to exactly one phase.

### Phase 0: Confirm the product wedge and restore the baseline

- Goal: Make the direction testable before architectural migration.
- Requirements: REQ-018
- Work:
  - Confirm the initial target user and flagship scenario.
  - Define benchmark tasks: simple change, multi-step feature, interrupted task.
  - Record V1 Skill-only and current CLI-only baselines.
  - Repair the local Node/Codex runtime and rerun the current full verification chain.
  - Freeze the existing Kernel contract and state fixtures.
- Success criteria:
  1. Target user and flagship scenario are explicitly confirmed.
  2. Baseline includes completion, user actions, recovery, evidence, latency, and cost.
  3. Current tests, contracts, reconcile, and audit run fresh.
  4. No migration begins from an unhealthy Node/Codex baseline.
- Metrics:
  - Baseline task count: at least 6 before implementation.
  - Fresh test pass: 100%.
- Explicitly out of scope:
  - Plugin release.
  - Other host adapters.

### Phase 1: Establish platform-neutral extension boundaries

- Goal: Make Codex the first host without making it part of Kernel semantics.
- Requirements: REQ-004, REQ-005, REQ-011, REQ-013
- Work:
  - Add `HostAdapter`, `WorkerExecutor`, and execution-capability contracts.
  - Replace provider enums in PlanGraph and worker policy with capability requests and adapter IDs.
  - Move provider-specific execution from `src/core/agent-execution.mjs` into `src/executors/`.
  - Keep temporary re-export shims under `src/adapters/`.
  - Add state revision, idempotency key, single-writer lease, and recoverable transition journal.
  - Add schema migrations for existing `.apex-v2` projects.
- Success criteria:
  1. `src/core` has zero direct imports from provider-specific adapters.
  2. Existing Codex/Claude/Gemini worker fixtures pass through `WorkerExecutor`.
  3. A mock non-Codex HostAdapter passes conformance without Kernel changes.
  4. Injected interruption during run/merge transitions recovers without partial authoritative state.
- Metrics:
  - Provider references in `src/core`: <=3 unavoidable labels, zero imports.
  - Existing state migration success: 100% across fixtures.
- Explicitly out of scope:
  - User-facing plugin.
  - MCP server.

### Phase 2: Correct semantic execution

- Goal: Ensure the graph represents real work rather than structural PASS.
- Requirements: REQ-008, REQ-009, REQ-010
- Work:
  - Replace provider-specific `adapter` on PlanGraph nodes with:
    - `execution_class`;
    - `required_capabilities`;
    - `output_contract`;
    - `preferred_mode`.
  - Mark context, risk, design, and review as cognitive tasks.
  - Restrict shell to deterministic checks.
  - Require structured semantic artifacts for cognitive node completion.
  - Close automatic fallback so the next WorkerExecutor completes the same objective.
  - Add cancellation, timeout, resume, and usage evidence to executor results.
- Success criteria:
  1. Zero cognitive node can PASS from shell exit code alone.
  2. Review reads requirements, candidate diff, verification evidence, and risk state.
  3. Twelve injected failure classes complete through retry/fallback or close as a typed blocker.
  4. No shell result can substitute for a failed Agent attempt.
- Metrics:
  - Cognitive semantic-evidence coverage: 100%.
  - Fallback same-objective completion: 12/12 injected cases.
- Explicitly out of scope:
  - Plugin marketplace release.

### Phase 3: Deliver the Codex Interactive Plugin alpha

- Goal: Let users operate Apex Forge naturally from the current Codex session.
- Requirements: REQ-001, REQ-002, REQ-006, REQ-012, REQ-017
- Deliverables:
  - `plugins/codex/.codex-plugin/plugin.json`
  - `using-apex-forge` Skill
  - `project-status` Skill
  - `planning` Skill
  - `executing` Skill
  - `reviewing` Skill
  - `shipping` Skill
  - local typed Host Bridge
  - install/update/rollback validation
- Work:
  - Implement `codex-host` against the HostAdapter contract.
  - Map natural language into Kernel actions.
  - Allow current Codex to claim work and submit typed artifacts.
  - Keep Kernel state outside plugin installation directories.
  - Add starter prompts and plugin metadata.
  - Keep Factory Mode disabled by default.
- Success criteria:
  1. User completes the flagship scenario without raw CLI.
  2. Normal interactive work launches zero nested Codex processes.
  3. Plugin install to first governed run takes <=5 minutes.
  4. Upgrade, rollback, and uninstall preserve `.apex-v2` state.
  5. A new Codex thread can resume the same project state.
- Metrics:
  - Normal-path raw CLI usage: 0%.
  - Interactive nested Agent launches: 0.
  - State preservation during lifecycle tests: 100%.
- Explicitly out of scope:
  - Public marketplace submission.
  - Claude/DeepSeek HostAdapters.
  - MCP.

### Phase 4: Re-enable optional Factory Mode

- Goal: Use external workers only where they provide measurable value.
- Requirements: REQ-003, REQ-007, REQ-019
- Work:
  - Add an execution router based on duration, parallelism, isolation, and recovery needs.
  - Expose an explicit user override for Interactive or Factory Mode.
  - Run external workers through WorkerExecutor only.
  - Record tokens when available, tool calls, wall time, retries, and nested launches.
  - Harden sandbox read/write boundaries and cancellation propagation.
- Success criteria:
  1. Simple tasks default to Interactive Mode.
  2. Parallel or background tasks can use Factory Mode and resume after interruption.
  3. Mode choice and rationale are visible in artifacts.
  4. Cancellation terminates the complete worker process tree.
- Metrics:
  - Interactive median cost/latency overhead vs V1: <=25%.
  - Factory recovery success at 10 interruption points: 100%.
- Explicitly out of scope:
  - Additional HostAdapters.

### Phase 5: Validate product superiority

- Goal: Decide whether the Plugin + Kernel product is actually better.
- Requirements: none; this is the release gate for REQ-018 from Phase 0.
- Work:
  - Run at least 30 tasks across 5 external repositories.
  - Compare V1 Skill-only, CLI-only Kernel, and Plugin + Kernel.
  - Include hidden acceptance tests and injected review defects.
  - Segment results by simple, multi-step, interrupted, and parallel tasks.
- Success criteria:
  1. Plugin + Kernel wins at least 4 of 6 metrics in at least 2 of 3 benchmark scenarios.
  2. Hidden acceptance pass rate is no worse than V1 by more than 3 percentage points.
  3. Review detects >=90% of 20 injected P0/P1 defects with <=15% false positives.
  4. More than 80% of normal workflows require no raw CLI.
- Metrics:
  - Task completion rate.
  - User actions.
  - Recovery success.
  - Evidence completeness.
  - Wall time.
  - Token/cost.
- Explicitly out of scope:
  - Other Agent hosts before this gate passes.

### Phase 6: Add Claude and DeepSeek paths

- Goal: Prove the extension contracts work beyond Codex.
- Requirements: REQ-014, REQ-015, REQ-016
- Claude track:
  - Add `claude-code-host` using Claude Code's native plugin/Skill packaging.
  - Reuse shared workflows but map native tools and approval UX in the HostAdapter.
  - Keep the existing `claude-code-cli` path as a WorkerExecutor.
- DeepSeek track:
  - Add a DeepSeek ModelProvider through the generic Agent runner.
  - Verify structured output, tool use, context limits, cancellation, and usage reporting.
  - Package a DeepSeek HostAdapter only if a stable Agent host contract exists.
- Shared conformance:
  - Run the same host action fixtures against Codex and Claude.
  - Run the same executor fixtures against Codex CLI, Claude Code CLI, Gemini CLI, and the DeepSeek-backed generic runner.
- Success criteria:
  1. Claude HostAdapter requires no Kernel workflow changes.
  2. DeepSeek completes WorkerExecutor conformance through the generic runner.
  3. Shared workflow rewrite for a second host is <=30%.
  4. Platform-specific code remains inside its host/executor/provider package.
- Metrics:
  - Host conformance pass: 100%.
  - Executor conformance pass: 100%.
  - Shared workflow reuse: >=70%.
- Explicitly out of scope:
  - Claiming native DeepSeek plugin support without a validated Agent host.

### Phase 7: Consider MCP or a standalone service

- Goal: Add a remote/tool protocol only when local plugin boundaries are stable.
- Requirements: REQ-020
- Start only if at least one trigger is true:
  - two external HostAdapters need the same typed remote control surface;
  - remote/background workers need cross-machine coordination;
  - a non-plugin client needs stable Kernel access;
  - the local bridge has remained contract-stable for two releases.
- Candidate MCP surface:
  - `project_status`
  - `intake_add`
  - `action_claim`
  - `artifact_submit`
  - `approval_decide`
  - `evidence_get`
- Success criteria:
  1. MCP exposes stable typed Kernel operations, not raw CLI passthrough.
  2. MCP never becomes a second state owner.
  3. Authentication, authorization, cancellation, audit, and version negotiation are tested.

## 7. Requirement Coverage

| Requirement | Phase |
|---|---|
| REQ-001 | Phase 3 |
| REQ-002 | Phase 3 |
| REQ-003 | Phase 4 |
| REQ-004 | Phase 1 |
| REQ-005 | Phase 1 |
| REQ-006 | Phase 3 |
| REQ-007 | Phase 4 |
| REQ-008 | Phase 2 |
| REQ-009 | Phase 2 |
| REQ-010 | Phase 2 |
| REQ-011 | Phase 1 |
| REQ-012 | Phase 3 |
| REQ-013 | Phase 1 |
| REQ-014 | Phase 6 |
| REQ-015 | Phase 6 |
| REQ-016 | Phase 6 |
| REQ-017 | Phase 3 |
| REQ-018 | Phase 0 |
| REQ-019 | Phase 4 |
| REQ-020 | Phase 7 |

Coverage result:

- Orphan requirements: 0
- Duplicate mappings: 0
- Requirements mapped: 20/20

## 8. Release Gates

No phase is considered complete until its gate passes.

| Gate | Required evidence |
|---|---|
| Baseline Gate | Fresh tests/contracts/reconcile/audit and benchmark baseline |
| Boundary Gate | No provider imports in core; Host/Executor conformance fixtures |
| Semantic Gate | Cognitive nodes cannot shell-PASS; semantic review mutation tests |
| Plugin UX Gate | Natural-language flagship flow with zero raw CLI |
| Lifecycle Gate | Install/update/rollback/uninstall preserve state |
| Factory Gate | Recovery, cancellation, sandbox, and usage evidence |
| Product Gate | 30 tasks, 5 repos, comparative benchmark thresholds |
| Portability Gate | Claude host and DeepSeek executor conformance |
| MCP Gate | Trigger condition plus stable versioned contract |

## 9. Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Plugin becomes a second state owner | Split-brain project state | Kernel remains the only writer of authoritative state |
| Codex concepts leak into core | Expensive later ports | HostAdapter boundary plus provider-leakage test |
| Plugin only hides CLI | Better packaging, unchanged product quality | Host-native execution and semantic node gates |
| Nested Agents duplicate context and cost | Slow and expensive normal tasks | Interactive Mode default; Factory Mode explicit |
| Plugin upgrade breaks daemon/runtime | Orphaned or stale background processes | Separate Kernel lifecycle, versioned runtime, no daemon in alpha |
| System Node drift breaks execution | Plugin unavailable after environment updates | Preflight, supported runtime matrix, avoid absolute Node path persistence |
| Cross-platform claim exceeds evidence | False compatibility promise | Conformance suite and per-host release status |
| DeepSeek is treated as an Agent host without one | Wrong abstraction and brittle integration | Start as ModelProvider inside generic WorkerExecutor |
| Transaction gaps corrupt state under concurrency | Partial run or merge state | Revision, lease, idempotency, transition journal |
| Skills drift across platforms | Divergent workflow behavior | Shared workflow source plus host conformance tests |

## 10. Success Metrics

| Metric | Baseline | Target | Observation window |
|---|---:|---:|---|
| Install to first governed run | Unknown | <=5 minutes | First 10 clean installs |
| Normal workflows requiring raw CLI | 100% in current V2 | <=20%, target 0% | 30 benchmark tasks |
| Interactive nested Agent launches | Current worker path required | 0 for normal tasks | 30 benchmark tasks |
| Hidden acceptance pass rate | Phase 0 baseline | no worse than V1 by >3pp | 30 benchmark tasks |
| Review P0/P1 detection | Unknown | >=90% | 20 injected defects |
| Review false-positive rate | Unknown | <=15% | 20 injected defects |
| Recovery integrity | Existing targeted tests | 100% at 10 interruption points | Per release |
| State preservation on lifecycle change | Unknown | 100% | Install/update/rollback/uninstall matrix |
| Interactive cost/latency overhead | V1 baseline | <=25% | 30 benchmark tasks |
| Second-host workflow reuse | Unknown | >=70% | Claude adapter implementation |
| Host/Executor conformance | Not defined | 100% | Every supported release |

## 11. Remaining Validation Slice

The architecture and local Codex/Claude packaging slices are implemented. The
remaining work is product validation, not another broad rewrite:

1. Freeze the current local release candidate and benchmark schema.
2. Complete the remaining 81 comparison runs across all 5 repositories.
3. Prioritize review-defect, interrupted, and parallel cases before adding more
   simple-task repetitions.
4. Track code correctness separately from durable run closure so false
   completion claims cannot score as full completion.
5. Do not claim Plugin superiority or begin public marketplace release until
   the Product Gate thresholds pass.

## 12. Change-My-Mind Conditions

Reopen this plan if:

- the confirmed target user primarily wants one-shot guidance rather than durable project operation;
- the Codex plugin cannot let the current Agent submit Kernel artifacts safely;
- the HostAdapter contract requires provider concepts in persisted Kernel schemas;
- Plugin + Kernel fails the Phase 5 comparison against V1;
- DeepSeek or another platform exposes a materially different Agent lifecycle that the current HostAdapter cannot represent without broad workflow changes.

## 13. Platform Assumptions To Revalidate

These assumptions were inspected on 2026-08-14 and must be revalidated at the
start of each platform phase:

- Codex plugins package Skills and interface metadata through a plugin manifest.
- Claude Code plugins can package native Skills and other host-specific components.
- DeepSeek exposes an OpenAI-compatible API surface, but API compatibility does
  not by itself imply a native Agent plugin host.
