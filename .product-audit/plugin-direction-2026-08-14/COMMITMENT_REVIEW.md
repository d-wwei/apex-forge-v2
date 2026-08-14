# Apex Forge V2 Plugin Direction Commitment Review

- Audit Date: 2026-08-14
- Audit Goal: architecture-review / product-direction
- Primary Project Type: CLI orchestration kernel
- Secondary Types: AI agent system, Codex plugin candidate, developer tool
- Commitment Scope: provisional
- Execution Mode: parallel independent expert passes

## Audit Question

Is the best next direction:

> Make Apex Forge V2 a Codex-first agent plugin, similar in usability to
> Superpowers, while retaining a provider-neutral durable Kernel and adding
> other host adapters later?

## Audit Panel

- Active Roles: Product/UX, Architecture/Reliability, AI Behavior/Test/Engineering, Platform Strategy/DX
- Deferred Roles: Compliance/Privacy and Data (no relevant product scope); Performance (covered only as orchestration cost)
- Duplicate Review Targets:
  - Whether the plugin is the product or only a control surface
  - Whether the Kernel must remain provider-neutral
  - Whether the current Codex worker model should remain the default execution path
- Integration Owner: main auditor

## Commitment Candidates

### C-001: Long-running project operating system remains the core value

- Source: `README.md:5-13`; `planning/v2-planning-recommendation.md:7-29`
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Project state, evidence, gates, recovery, and learning remain durable outside one chat session.
- Confidence: high
- Potential Expectation IDs: E-301
- Wrong-Classification Risk: Replacing the Kernel with Skills would discard the primary V2 differentiation.

### C-002: CLI and chat are control surfaces, not the source of truth

- Source: `README.md:11-13`; `planning/v2-planning-recommendation.md:7-9`
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: The user-facing surface may change without moving authoritative state out of the Kernel.
- Confidence: high
- Potential Expectation IDs: E-201, E-304
- Wrong-Classification Risk: Treating the current CLI as the product would optimize an internal interface.

### C-003: Provider concepts stay outside the Kernel

- Source: `planning/v2-planning-recommendation.md:53-59,112-124,199-209`
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Codex-first packaging must not make core workflow semantics Codex-specific.
- Confidence: high
- Potential Expectation IDs: E-302, E-303, E-502
- Wrong-Classification Risk: A short-term Codex integration could create long-term platform lock-in.

### C-004: V1 established a natural-language Skill-first usage model

- Source: `../apex-forge/skill/SKILL.md:1-14,77-101`; `../apex-forge/platforms/codex/AGENTS.md:1-39`
- Suggested Classification: current_implicit_commitment
- Suggested Commitment: Users should invoke workflows through natural language or named Skills rather than memorizing Kernel commands.
- Confidence: high
- Potential Expectation IDs: E-201, E-202
- Wrong-Classification Risk: Copying all V1 rigidity would restore usability but also restore the fixed-pipeline limitations V2 was built to remove.

### C-005: Codex plugin is a candidate distribution shell

- Source: user direction on 2026-08-14; local Superpowers `.codex-plugin/plugin.json`
- Suggested Classification: roadmap_or_future_claim promoted to provisional audit scope
- Suggested Commitment: A Codex plugin packages discovery metadata and modular Skills around V2.
- Confidence: medium
- Potential Expectation IDs: E-501
- Wrong-Classification Risk: A valid manifest may be mistaken for a validated product experience.

### C-006: Interactive execution should use the current host Agent when possible

- Source: user concern that V2 became unfamiliar; current nested CLI execution in `src/core/agent-execution.mjs`
- Suggested Classification: provisional_product_hypothesis
- Suggested Commitment: Ordinary interactive work should not launch a second Codex process by default.
- Confidence: medium
- Potential Expectation IDs: E-304, E-402
- Wrong-Classification Risk: Removing external workers entirely would weaken long-running and parallel factory operation.

### C-007: Factory execution remains available for durable or parallel work

- Source: `planning/project-operating-model.md:87-95,126-149`; current worker/sandbox implementation
- Suggested Classification: current_explicit_commitment
- Suggested Commitment: Isolated worker execution remains an opt-in mode for tasks that benefit from persistence or parallelism.
- Confidence: high
- Potential Expectation IDs: E-301, E-402
- Wrong-Classification Risk: Making factory mode mandatory imposes orchestration cost on simple tasks.

### C-008: Cognitive stages require cognitive execution evidence

- Source: `src/core/plan-graph.mjs:28-147`; `src/apex-v2.mjs:997-1131`
- Suggested Classification: current_implicit_commitment
- Suggested Commitment: Context, risk, design, and review nodes cannot pass merely because a shell verification command exits zero.
- Confidence: high
- Potential Expectation IDs: E-401
- Wrong-Classification Risk: Structural graph completion would be confused with actual reasoning quality.

### C-009: Codex-first must be proven by comparative dogfood

- Source: product audit stance; no current plugin or comparative tests in `tests/`
- Suggested Classification: provisional_product_hypothesis
- Suggested Commitment: The direction is not finalized until it beats both V1 Skill-only and current CLI-only on representative tasks.
- Confidence: high
- Potential Expectation IDs: E-403
- Wrong-Classification Risk: Architectural elegance could substitute for user-observable improvement.

### C-010: MCP/service-first is an alternative, not an assumed requirement

- Source: `planning/v2-planning-recommendation.md:112-124`; current absence of an MCP implementation
- Suggested Classification: roadmap_or_future_claim
- Suggested Commitment: MCP or a standalone service is added only when a validated use case cannot be served by Skills plus a local Kernel bridge.
- Confidence: medium
- Potential Expectation IDs: E-503
- Wrong-Classification Risk: Premature service design increases deployment and compatibility cost before product-market validation.

## Commitment Mining Self-Review

| Check | Candidate(s) / Source(s) | Risk | Recommended Action |
|---|---|---|---|
| Source completeness | V2 README/planning/source/tests, V1 Skills, local Superpowers manifest, local Codex plugin spec | Official marketplace behavior was not live-verified because local Codex cannot start | Keep distribution claims provisional |
| Evidence truthfulness | C-001 to C-004, C-007, C-008 | Strong local evidence | Include provisionally |
| Freshness | Local plugin cache and repo inspected on 2026-08-14 | Plugin format may evolve | Validate against installed plugin validator before implementation |
| Classification correctness | C-005, C-006, C-009, C-010 | These are hypotheses, not shipped commitments | Keep provisional and benchmark-gated |
| Conflict detection | C-003 vs Codex-first; C-006 vs C-007 | Product shell and runtime core could be conflated | Require explicit host/worker adapter split and two execution modes |
| CRITICAL reasonableness | C-001, C-003, C-008 | Losing durable truth, platform neutrality, or real reasoning invalidates the product thesis | Keep CRITICAL |

## Human Confirmation

- Confirmation Status: provisional
- Confirmed By: not yet confirmed
- Confirmed At: not yet confirmed
- Scope Decision Summary: User requested an immediate re-audit of the plugin direction. Current commitments and the proposed direction are included provisionally; implementation claims are not assumed.

| Candidate ID | Decision | Final Classification | Critical? | Notes |
|---|---|---|---|---|
| C-001 to C-004 | include-provisional | current explicit/implicit commitment | mixed | Existing product intent |
| C-005 to C-006 | include-provisional | product hypothesis | no | Requires prototype evidence |
| C-007 to C-009 | include-provisional | current commitment plus benchmark gate | mixed | Core direction gate |
| C-010 | include-provisional | conditional future direction | no | MCP/service-first remains an alternative |
