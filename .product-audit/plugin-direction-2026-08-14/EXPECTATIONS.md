# Apex Forge V2 Plugin Direction Expectations

- Audit Date: 2026-08-14
- Audit Goal: architecture-review / product-direction
- Project Type: CLI orchestration kernel with Codex plugin candidate
- Commitment Scope: provisional
- Total Expectations: 13
- Automated Coverage Target: 100%

### E-201: Natural-language primary entry

- **Commitment ID**: C-002, C-004, C-005
- **Confirmation Status**: provisional
- **Expectation**: V2 exposes a Codex plugin manifest and at least five focused Skills so users do not need raw CLI commands for the primary journey.
- **Measurement**: Count `.codex-plugin/plugin.json` and `skills/*/SKILL.md`.
- **Threshold**: PASS: manifest exists and skill count >=5; WARN: only one condition; FAIL: neither.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Compare workflow coverage across intake, plan, execute, review, ship, and status.
  - trend_query: Compare user steps before and after plugin prototype.
  - ratio_check: supported primary journeys vs raw CLI-only journeys.
  - causal_upstream: []
  - causal_downstream: [E-202, E-501]

### E-202: One-step first value

- **Commitment ID**: C-002, C-004
- **Confirmation Status**: provisional
- **Expectation**: A new Codex user can start the flagship workflow with one natural-language request and no more than one explicit setup action.
- **Measurement**: Inspect plugin starter prompts, onboarding docs, and executable acceptance tests.
- **Threshold**: PASS: starter prompt plus tested one-action setup; WARN: documented but untested; FAIL: multi-command CLI is the only path.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Count required user actions by workflow stage.
  - trend_query: Median time-to-first-value across prototype trials.
  - ratio_check: successful first-run trials vs total trials.
  - causal_upstream: [E-201]
  - causal_downstream: [E-403]

### E-203: Explicit target user and flagship scenario

- **Commitment ID**: C-005, C-009
- **Confirmation Status**: provisional
- **Expectation**: Product docs identify one initial target user, one flagship scenario, and measurable success criteria.
- **Measurement**: Search product docs for target user, flagship scenario, baseline, target, and observation window.
- **Threshold**: PASS: all five elements; WARN: target user and scenario but incomplete metrics; FAIL: absent.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Map features to the flagship journey.
  - trend_query: Track trial success over the first ten dogfood runs.
  - ratio_check: roadmap items serving flagship scenario vs total roadmap items.
  - causal_upstream: []
  - causal_downstream: [E-202, E-403]

### E-301: Durable Kernel value is preserved

- **Commitment ID**: C-001, C-002, C-007
- **Confirmation Status**: provisional
- **Expectation**: Plugin productization retains persisted project state, contracts, event log, recovery, staged verification, and governed integration.
- **Measurement**: Inspect Kernel modules, schemas, tests, and `.apex-v2` state model.
- **Threshold**: PASS: Kernel, schemas, tests, and durable state all exist; WARN: one layer missing; FAIL: plugin direction replaces Kernel with instructions only.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Map durable capabilities to code and tests.
  - trend_query: Kernel regression count across plugin changes.
  - ratio_check: durable capabilities preserved vs baseline capabilities.
  - causal_upstream: []
  - causal_downstream: [E-303, E-304, E-402]

### E-302: Provider-neutral Kernel boundary

- **Commitment ID**: C-003
- **Confirmation Status**: provisional
- **Expectation**: Core orchestration does not directly import a provider-specific adapter and provider-specific references are confined to adapter or host-integration boundaries.
- **Measurement**: Search `src/core` for provider imports and provider-specific policy.
- **Threshold**: PASS: zero direct provider adapter imports and <=3 unavoidable provider references; WARN: <=8 references with no direct import; FAIL: direct import or >8 references.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Provider references grouped by core, commands, and adapters.
  - trend_query: Provider leakage count per refactor.
  - ratio_check: provider-neutral core modules vs provider-coupled core modules.
  - causal_upstream: []
  - causal_downstream: [E-303, E-502]

### E-303: Host and worker adapters are separate contracts

- **Commitment ID**: C-003, C-006, C-007
- **Confirmation Status**: provisional
- **Expectation**: Architecture explicitly distinguishes host integration from worker execution and defines typed contracts for both.
- **Measurement**: Search docs, schemas, and source for host-adapter and worker-adapter contracts.
- **Threshold**: PASS: both contracts implemented and tested; WARN: documented only; FAIL: not distinguished.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Contract coverage by host and worker operation.
  - trend_query: Adapter conformance results over releases.
  - ratio_check: adapters passing conformance vs adapters registered.
  - causal_upstream: [E-301, E-302]
  - causal_downstream: [E-304, E-402, E-502]

### E-304: Interactive host execution path

- **Commitment ID**: C-002, C-006
- **Confirmation Status**: provisional
- **Expectation**: The current Codex Agent can claim and complete a Kernel worker without launching another coding-agent process.
- **Measurement**: Inspect host adapter implementation and end-to-end tests.
- **Threshold**: PASS: implemented and tested; WARN: contract/prototype only; FAIL: external CLI worker is the only agent path.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Interactive vs factory runs by task size.
  - trend_query: Completion rate and latency by execution mode.
  - ratio_check: host-executed runs vs nested-agent runs for interactive tasks.
  - causal_upstream: [E-301, E-303]
  - causal_downstream: [E-402, E-403]

### E-401: Cognitive nodes use cognitive evidence

- **Commitment ID**: C-008
- **Confirmation Status**: provisional
- **Expectation**: Context, risk, design, and review nodes cannot pass solely from a generic shell command.
- **Measurement**: Inspect PlanGraph adapters and shell worker completion semantics.
- **Threshold**: PASS: all cognitive nodes require Agent/human structured artifacts; WARN: one cognitive node uses shell-only; FAIL: two or more do.
- **Severity**: CRITICAL
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Plan nodes grouped by adapter and output contract.
  - trend_query: False-PASS benchmark rate over releases.
  - ratio_check: cognitive nodes with semantic evidence vs total cognitive nodes.
  - causal_upstream: []
  - causal_downstream: [E-403]

### E-402: Nested Agent execution is opt-in

- **Commitment ID**: C-006, C-007
- **Confirmation Status**: provisional
- **Expectation**: Interactive mode uses the host Agent by default; external Agent workers are selected only for durable, parallel, or background execution.
- **Measurement**: Inspect mode selection policy, defaults, docs, and tests.
- **Threshold**: PASS: explicit tested mode router; WARN: modes documented but untested; FAIL: nested external Agent is the only/default path.
- **Severity**: HIGH
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Mode selection by complexity and duration.
  - trend_query: Cost and latency per completed task by mode.
  - ratio_check: nested launches avoided vs eligible interactive tasks.
  - causal_upstream: [E-301, E-303, E-304]
  - causal_downstream: [E-403]

### E-403: Comparative product benchmark

- **Commitment ID**: C-009
- **Confirmation Status**: provisional
- **Expectation**: Codex-first Plugin + Kernel beats V1 Skill-only and CLI-only Kernel on representative tasks.
- **Measurement**: Run at least three benchmark scenarios and compare completion, user actions, recovery, evidence quality, latency, and token/cost.
- **Threshold**: PASS: plugin+kernel wins >=4 of 6 metrics in >=2 of 3 scenarios with no safety regression; WARN: partial benchmark; FAIL: no comparative benchmark.
- **Severity**: HIGH
- **Metric Type**: incremental
- **Deep Dive Metadata**:
  - distribution_query: Results by simple, multi-step, and interrupted scenario.
  - trend_query: Benchmark results across prototype iterations.
  - ratio_check: metrics won by plugin+kernel vs alternatives.
  - causal_upstream: [E-202, E-203, E-304, E-401, E-402]
  - causal_downstream: [E-501]

### E-501: Codex plugin packaging readiness

- **Commitment ID**: C-005
- **Confirmation Status**: provisional
- **Expectation**: A valid non-placeholder Codex plugin manifest, semver version, Skills directory, and validation path exist.
- **Measurement**: Inspect manifest and run the installed plugin validator.
- **Threshold**: PASS: all present and validator passes; WARN: files present but validator blocked; FAIL: package absent.
- **Severity**: HIGH
- **Condition**: local Codex/Node runtime healthy -> HIGH; runtime broken -> HIGH with external-boundary note
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Plugin components and validation coverage.
  - trend_query: Install/update success rate across local iterations.
  - ratio_check: validated plugin versions vs attempted versions.
  - causal_upstream: [E-201, E-403]
  - causal_downstream: []

### E-502: Cross-platform option value

- **Commitment ID**: C-003, C-007
- **Confirmation Status**: provisional
- **Expectation**: Shared contracts and Kernel do not depend on Codex plugin semantics, allowing later host adapters without workflow rewrites.
- **Measurement**: Inspect boundaries and provider leakage; verify at least one mock non-Codex host conformance test.
- **Threshold**: PASS: host-neutral contract plus mock conformance test; WARN: architecture boundary documented; FAIL: Codex semantics enter Kernel contracts.
- **Severity**: MEDIUM
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Shared vs platform-specific files.
  - trend_query: Porting effort for each host adapter.
  - ratio_check: shared implementation lines vs host-specific lines.
  - causal_upstream: [E-302, E-303]
  - causal_downstream: []

### E-503: MCP/service scope is evidence-gated

- **Commitment ID**: C-010
- **Confirmation Status**: provisional
- **Expectation**: MCP or a standalone service is deferred until Skills plus a local bridge fail a measured use case.
- **Measurement**: Inspect architecture decision and roadmap sequencing.
- **Threshold**: PASS: explicit defer/trigger criteria; WARN: no MCP implementation but no decision criteria; FAIL: service/MCP is mandatory before plugin dogfood.
- **Severity**: MEDIUM
- **Metric Type**: snapshot
- **Deep Dive Metadata**:
  - distribution_query: Required capabilities served by Skill/script vs MCP/service.
  - trend_query: Unserved use cases during plugin dogfood.
  - ratio_check: MCP-only capabilities vs total flagship capabilities.
  - causal_upstream: [E-203]
  - causal_downstream: [E-501]
