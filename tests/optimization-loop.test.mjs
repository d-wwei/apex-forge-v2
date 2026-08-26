import assert from "node:assert/strict";
import test from "node:test";
import {
  decideOptimizationExperiment,
  evaluateOptimizationSample,
  initialOptimizationState,
  nextOptimizationState,
  validateOptimizationConfig
} from "../src/optimization/quality-cost.mjs";

const config = {
  schema_version: "v0",
  campaign_id: "test-campaign",
  quality_gates: {
    public_acceptance: 1,
    hidden_acceptance: 1,
    scope_safety: 1,
    durable_closure: 1,
    false_completion_count: 0,
    defect_detection: 1,
    false_positive_rate: 0
  },
  route_targets: {
    governed: {
      max_wall_ms: 600000,
      max_total_tokens: 600000,
      max_cost_ratio_vs_comparator: 3,
      consecutive_passes: 3
    }
  },
  score_weights: {
    uncached_input_token: 1,
    cached_input_token: 0.1,
    output_token: 3,
    wall_second: 100,
    model_call: 5000,
    retry: 10000,
    rework_rate: 20000,
    complexity: 20
  },
  decision: {
    minimum_improvement_ratio: 0.02
  },
  budgets: {
    max_experiments: 3,
    max_total_wall_minutes: 60,
    max_total_tokens: 1000000,
    max_consecutive_crashes: 2,
    max_consecutive_non_improvements: 2
  },
  immutable_paths: ["tests/optimization-loop.test.mjs"]
};

function sample(overrides = {}) {
  return {
    schema_version: "v0",
    experiment_id: "experiment-1",
    task_id: "task-1",
    route: "governed",
    status: "completed",
    commit: "abcdef0",
    metrics: {
      valid_deliveries: 1,
      quality: {
        public_acceptance: 1,
        hidden_acceptance: 1,
        scope_safety: 1,
        durable_closure: 1,
        false_completion_count: 0,
        defect_detection: 1,
        false_positive_rate: 0
      },
      efficiency: {
        wall_ms: 300000,
        model_calls: 3,
        retries: 0,
        rework_rate: 0
      },
      cost: {
        uncached_input_tokens: 100000,
        cached_input_tokens: 100000,
        output_tokens: 30000,
        tool_calls: 20
      },
      complexity: {
        changed_lines: 100,
        added_runtime_nodes: 0
      }
    },
    comparator: {
      total_tokens: 200000
    },
    ...overrides
  };
}

test("optimization config requires gates, targets, budgets, and immutable inputs", () => {
  assert.deepEqual(validateOptimizationConfig(config), []);
  assert.match(
    validateOptimizationConfig({ schema_version: "v0" }).join(";"),
    /campaign_id/
  );
});

test("quality regression is discarded regardless of cost", () => {
  const candidate = sample();
  candidate.metrics.quality.hidden_acceptance = 0.5;
  candidate.metrics.cost.uncached_input_tokens = 1;
  candidate.metrics.cost.cached_input_tokens = 1;
  candidate.metrics.cost.output_tokens = 1;
  candidate.metrics.efficiency.wall_ms = 1;

  const evaluation = evaluateOptimizationSample(config, candidate);
  const decision = decideOptimizationExperiment({ evaluation });
  assert.equal(evaluation.quality_pass, false);
  assert.equal(evaluation.quality_adjusted_delivery_cost, null);
  assert.equal(decision.decision, "discard");
});

test("quality-valid lower-cost candidate is kept", () => {
  const baseline = evaluateOptimizationSample(config, sample({
    experiment_id: "baseline"
  }));
  const improved = sample({
    experiment_id: "improved",
    metrics: {
      ...sample().metrics,
      efficiency: {
        ...sample().metrics.efficiency,
        wall_ms: 200000
      },
      cost: {
        ...sample().metrics.cost,
        uncached_input_tokens: 50000,
        cached_input_tokens: 50000,
        output_tokens: 15000
      }
    }
  });
  const evaluation = evaluateOptimizationSample(config, improved);
  const decision = decideOptimizationExperiment({
    evaluation,
    best: baseline,
    minimumImprovementRatio: 0.02
  });

  assert.equal(evaluation.quality_pass, true);
  assert.equal(evaluation.target_pass, true);
  assert.equal(decision.decision, "keep");
});

test("quality-valid candidate that is slower, costlier, and more complex is discarded", () => {
  const baseline = evaluateOptimizationSample(config, sample({
    experiment_id: "baseline"
  }));
  const regressed = sample({
    experiment_id: "regressed",
    metrics: {
      ...sample().metrics,
      efficiency: {
        ...sample().metrics.efficiency,
        wall_ms: 400000
      },
      cost: {
        ...sample().metrics.cost,
        uncached_input_tokens: 150000
      },
      complexity: {
        changed_lines: 200,
        added_runtime_nodes: 1
      }
    }
  });
  const evaluation = evaluateOptimizationSample(config, regressed);
  const decision = decideOptimizationExperiment({
    evaluation,
    best: baseline
  });

  assert.equal(decision.decision, "discard");
  assert.match(decision.reason, /Pareto-dominated/);
});

test("loop stops at bounded experiment budget", () => {
  const initial = initialOptimizationState(config, "digest", {});
  const candidate = sample();
  const evaluation = evaluateOptimizationSample(config, candidate);
  const decision = decideOptimizationExperiment({ evaluation });
  let state = initial;
  for (let index = 0; index < 3; index += 1) {
    state = nextOptimizationState(
      config,
      state,
      { ...candidate, experiment_id: `experiment-${index}` },
      { ...evaluation, experiment_id: `experiment-${index}` },
      decision
    );
  }
  assert.equal(state.status, "stopped");
  assert.ok(state.stop_reasons.includes("experiment-budget"));
});
