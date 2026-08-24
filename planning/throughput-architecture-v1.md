# Apex Forge Throughput Architecture V1

## Objective

Move governance out of the per-worker hot path without removing scope,
evidence, verification, recovery, or merge authority.

## Execution Shape

Governed delivery keeps its engineering responsibilities but exposes only three
synchronization barriers:

1. `delivery-plan`
   - context and risk analysis run in parallel;
   - the coordinator reduces their evidence into the bounded implementation
     plan at the stage barrier.
2. `delivery-candidate`
   - implementation and tests run in parallel when write scopes do not overlap;
   - verification is deterministic against the candidate assembled from both
     patches.
3. `delivery-readiness`
   - an independent review checks the verified candidate;
   - integration remains coordinator-owned;
   - learning proposals are queued after integration and do not block delivery.

## Model Tiers

Plan nodes declare a portable model tier instead of a provider-specific model:

| Tier | Default work |
| --- | --- |
| `cheap` | context, risk, tests, documentation, first-pass review |
| `standard` | bounded implementation |
| `strong` | critical implementation, conflict resolution, final high-risk review |
| `deterministic` | shell verification and mechanical gates |

Execution policy maps tiers to adapter-specific models. The initial Codex
mapping uses `gpt-5.6-luna` for `cheap` and `gpt-5.6-sol` for `strong`.
Adapters without an explicit mapping retain their configured default model.

## Delegation

Each PlanGraph node records:

- whether delegation is eligible and enabled by default;
- whether sibling work in the same stage may run concurrently;
- the requested and fallback model tiers;
- whether final main-agent approval is required.

The main Agent retains:

- final plan synthesis;
- cross-worker conflict resolution;
- security and permission decisions;
- merge approval and release verdict.

## Scheduler

`project tick --run-agents` repeatedly dispatches, executes, collects, unlocks,
and refills ready work up to project and policy WIP limits. Each wave executes
eligible workers concurrently, while a scheduler lease prevents two
coordinators from dispatching the same project at once. Each child also holds a
worker execution lease and fencing token before it may commit.

Failure remains worker-local:

- retry resets only that worker sandbox;
- a cheap-tier retry may promote to its fallback tier;
- unrelated workers and completed patches remain intact.

## Completion

An ActionWorkspace-local PASS is never delivery. Completion requires:

- patch status `merged`;
- `integration-report.json` status `MERGED`;
- applied file content matching patch operations;
- public acceptance passing in the project root;
- no active run remaining.

Learning proposal and durable apply-job creation are synchronous. The `learn`
node passes once they are queued, so delivery closes immediately. Applying the
approved job and producing its receipt is asynchronous and never reopens or
delays the delivery.

## Acceptance

- Existing persisted plans without stage/model metadata still validate.
- New Governed plans expose exactly three ordered stage IDs.
- Context/risk and implementation/tests are independently dispatchable.
- Cheap delegated work resolves to Luna for Codex by default.
- Strong work resolves to SOL for Codex by default.
- Parallel execution starts more than one independent worker before either
  finishes.
- A failed worker can retry or promote without resetting sibling workers.
- Full tests, plugin validation, capability benchmark, and release candidate
  verification pass before publication.

## Implementation Evidence

Status on 2026-08-24: `IMPLEMENTED_AND_VERIFIED`.

- `npm test`: 630/630 PASS.
- `npm run benchmark:throughput`: 11/11 PASS.
- Context and risk fake workers have overlapping execution windows.
- A failed risk worker does not cancel its context sibling.
- Worker claim exclusivity and expired-lease recovery pass.
- Learning closes the run at proposal/job queue time; approved jobs later create
  receipts and keep reconcile `CONSISTENT`.
- Codex and Claude plugin validation and installed-runtime provenance pass.

The historical 90-run Product Benchmark remains bound to an older release
candidate. It is not evidence that this version has already reduced real model
tokens or end-to-end wall time.
