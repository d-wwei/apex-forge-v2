# Apex Forge Quality-Cost Optimization Loop

## Objective

Optimize Apex Forge delivery routes without trading away correctness, safety,
or durable completion. The first campaign targets the unstable and expensive
`governed` route. `quick` and `disciplined` remain regression guards.

## Decision Rule

Quality is a hard gate, not a score component. An experiment is discarded when
any required public acceptance, hidden acceptance, scope safety, defect
detection, or durable closure check fails, or when it makes a false completion
claim.

Only quality-valid candidates are ranked by quality-adjusted delivery cost:

```text
uncached input
+ discounted cached input
+ weighted output
+ wall-time penalty
+ model-call, retry, rework, and complexity penalties
```

The exact weights and route targets are frozen in
`benchmarks/optimization-loop/config.json`.

## Experiment Protocol

1. Work only on a dedicated non-protected Git branch/worktree.
2. Freeze the evaluator, task definitions, hidden checks, and metric config by
   content digest when the campaign starts.
3. Change one causal variable per experiment.
4. Run focused deterministic tests before any model benchmark.
5. Run timing-sensitive benchmark arms strictly serially.
6. Record every experiment, including crashes and discarded candidates, in the
   append-only `.apex-loop/history.jsonl`.
7. Keep only a quality-valid candidate with a material score improvement, or an
   equal score with lower implementation complexity.
8. After three kept changes, run a Raw/V1/V2 cross-arm check.
9. Require the route target on distinct tasks for the configured consecutive
   pass count before declaring the campaign complete.

## Safety Stops

The loop stops instead of running forever when any configured limit is reached:

- experiment count;
- aggregate wall time;
- aggregate Token use;
- consecutive crashes;
- consecutive non-improvements;
- minimum free disk headroom;
- evaluator/config digest drift.

The loop never runs `git reset --hard`. Discarded worktrees are removed only
after their experiment record and evidence hashes are durable.

## Commands

```bash
npm run optimization:check
npm run optimization:start
npm run optimization:status
node scripts/optimization-loop.mjs next
node scripts/optimization-loop.mjs record --sample <experiment-result.json>
```

`optimization:start` initializes the bounded campaign and records the frozen R1
Governed baseline. It does not launch an unbounded background process.

## Initial Hypothesis Order

1. Move Governed orchestration decisions into the deterministic controller.
2. Load capability protocols only for the node that consumes them.
3. Route context, risk, and test work to the cheap model tier.
4. Retry only the failed worker or barrier.
5. Consolidate deterministic verification, candidate assembly, and closeout.

## Release Proof

Pilot improvements are not release claims. Final proof requires a fresh,
candidate-bound, strictly serial benchmark with Raw Agent, V1, and V2 arms,
followed by full tests, contracts, strict validation, plugin validation, and
durable reconcile.
