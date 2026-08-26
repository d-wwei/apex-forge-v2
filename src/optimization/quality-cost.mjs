const REQUIRED_QUALITY_METRICS = [
  "public_acceptance",
  "hidden_acceptance",
  "scope_safety",
  "durable_closure",
  "false_completion_count",
  "defect_detection",
  "false_positive_rate"
];

const REQUIRED_EFFICIENCY_METRICS = [
  "wall_ms",
  "model_calls",
  "retries",
  "rework_rate"
];

const REQUIRED_COST_METRICS = [
  "uncached_input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "tool_calls"
];

export function validateOptimizationConfig(config) {
  const errors = [];
  if (config?.schema_version !== "v0") errors.push("schema_version must be v0");
  if (!config?.campaign_id) errors.push("campaign_id is required");
  if (!config?.quality_gates) errors.push("quality_gates are required");
  if (!config?.score_weights) errors.push("score_weights are required");
  if (!config?.budgets) errors.push("budgets are required");
  if (!config?.route_targets || Object.keys(config.route_targets).length === 0) {
    errors.push("route_targets are required");
  }
  if (!Array.isArray(config?.immutable_paths) || config.immutable_paths.length === 0) {
    errors.push("immutable_paths are required");
  }
  return errors;
}

export function evaluateOptimizationSample(config, sample) {
  assertSample(sample);
  const gates = config.quality_gates;
  const quality = sample.metrics.quality;
  const gateChecks = [
    minimumGate("public_acceptance", quality.public_acceptance, gates.public_acceptance),
    minimumGate("hidden_acceptance", quality.hidden_acceptance, gates.hidden_acceptance),
    minimumGate("scope_safety", quality.scope_safety, gates.scope_safety),
    minimumGate("durable_closure", quality.durable_closure, gates.durable_closure),
    maximumGate(
      "false_completion_count",
      quality.false_completion_count,
      gates.false_completion_count
    ),
    minimumGate("defect_detection", quality.defect_detection, gates.defect_detection),
    maximumGate(
      "false_positive_rate",
      quality.false_positive_rate,
      gates.false_positive_rate
    )
  ];
  const qualityPass = gateChecks.every((gate) => gate.status === "PASS");
  const weightedCost = qualityPass
    ? qualityAdjustedDeliveryCost(config, sample)
    : null;
  const targetChecks = evaluateRouteTargets(config, sample);

  return {
    experiment_id: sample.experiment_id,
    route: sample.route,
    quality_pass: qualityPass,
    hard_gates: gateChecks,
    target_pass: qualityPass
      && targetChecks.length > 0
      && targetChecks.every((target) => target.status === "PASS"),
    target_checks: targetChecks,
    quality_adjusted_delivery_cost: weightedCost,
    total_tokens: totalTokens(sample.metrics.cost),
    wall_ms: sample.metrics.efficiency.wall_ms,
    complexity: complexityScore(sample.metrics.complexity),
    status: qualityPass ? "ELIGIBLE" : "QUALITY_REJECTED"
  };
}

export function decideOptimizationExperiment({
  evaluation,
  best = null,
  minimumImprovementRatio = 0.02
}) {
  if (!evaluation.quality_pass) {
    return {
      decision: "discard",
      reason: "quality gate failed"
    };
  }
  if (!best?.quality_pass || best.quality_adjusted_delivery_cost == null) {
    return {
      decision: "keep",
      reason: "first quality-valid candidate"
    };
  }
  if (dominates(evaluation, best)) {
    return {
      decision: "keep",
      reason: "candidate is Pareto-better on time, tokens, and complexity"
    };
  }
  if (dominates(best, evaluation)) {
    return {
      decision: "discard",
      reason: "candidate is Pareto-dominated by the current best"
    };
  }
  const threshold = best.quality_adjusted_delivery_cost
    * (1 - minimumImprovementRatio);
  if (evaluation.quality_adjusted_delivery_cost < threshold) {
    return {
      decision: "keep",
      reason: "quality-adjusted delivery cost improved"
    };
  }
  if (
    evaluation.quality_adjusted_delivery_cost
      <= best.quality_adjusted_delivery_cost
    && evaluation.complexity < best.complexity
  ) {
    return {
      decision: "keep",
      reason: "equal score with lower implementation complexity"
    };
  }
  return {
    decision: "discard",
    reason: "no material score or simplicity improvement"
  };
}

export function nextOptimizationState(config, state, sample, evaluation, decision) {
  const tokens = totalTokens(sample.metrics.cost);
  const next = structuredClone(state);
  next.updated_at = new Date().toISOString();
  next.experiment_count += 1;
  next.total_wall_ms += sample.metrics.efficiency.wall_ms;
  next.total_tokens += tokens;
  next.last_experiment_id = sample.experiment_id;
  next.consecutive_crashes = sample.status === "crash"
    ? next.consecutive_crashes + 1
    : 0;
  next.consecutive_non_improvements = decision.decision === "keep"
    ? 0
    : next.consecutive_non_improvements + 1;
  next.consecutive_target_passes = evaluation.target_pass
    ? next.consecutive_target_passes + 1
    : 0;

  if (decision.decision === "keep") {
    next.best = {
      experiment_id: sample.experiment_id,
      commit: sample.commit,
      ...evaluation
    };
  }

  const stopReasons = budgetStopReasons(config, next);
  next.stop_reasons = [...new Set(stopReasons)];
  next.status = next.stop_reasons.length > 0 ? "stopped" : "running";
  return next;
}

export function initialOptimizationState(config, configDigest, immutableDigests) {
  const timestamp = new Date().toISOString();
  return {
    schema_version: "v0",
    campaign_id: config.campaign_id,
    status: "running",
    config_digest: configDigest,
    immutable_digests: immutableDigests,
    experiment_count: 0,
    total_wall_ms: 0,
    total_tokens: 0,
    consecutive_crashes: 0,
    consecutive_non_improvements: 0,
    consecutive_target_passes: 0,
    last_experiment_id: null,
    best: null,
    stop_reasons: [],
    created_at: timestamp,
    updated_at: timestamp
  };
}

function qualityAdjustedDeliveryCost(config, sample) {
  const weights = config.score_weights;
  const cost = sample.metrics.cost;
  const efficiency = sample.metrics.efficiency;
  const complexity = sample.metrics.complexity;
  const deliveries = Math.max(1, Number(sample.metrics.valid_deliveries || 1));
  return round((
    cost.uncached_input_tokens * weights.uncached_input_token
    + cost.cached_input_tokens * weights.cached_input_token
    + cost.output_tokens * weights.output_token
    + (efficiency.wall_ms / 1000) * weights.wall_second
    + efficiency.model_calls * weights.model_call
    + efficiency.retries * weights.retry
    + efficiency.rework_rate * weights.rework_rate
    + complexityScore(complexity) * weights.complexity
  ) / deliveries);
}

function evaluateRouteTargets(config, sample) {
  const target = config.route_targets[sample.route];
  if (!target) return [];
  const checks = [
    maximumGate("wall_ms", sample.metrics.efficiency.wall_ms, target.max_wall_ms),
    maximumGate("total_tokens", totalTokens(sample.metrics.cost), target.max_total_tokens)
  ];
  if (target.max_cost_ratio_vs_comparator != null) {
    const comparatorTokens = Number(sample.comparator?.total_tokens);
    checks.push(maximumGate(
      "cost_ratio_vs_comparator",
      comparatorTokens > 0
        ? totalTokens(sample.metrics.cost) / comparatorTokens
        : Number.POSITIVE_INFINITY,
      target.max_cost_ratio_vs_comparator
    ));
  }
  return checks;
}

function budgetStopReasons(config, state) {
  const budgets = config.budgets;
  const reasons = [];
  if (state.experiment_count >= budgets.max_experiments) {
    reasons.push("experiment-budget");
  }
  if (state.total_wall_ms >= budgets.max_total_wall_minutes * 60 * 1000) {
    reasons.push("wall-time-budget");
  }
  if (state.total_tokens >= budgets.max_total_tokens) {
    reasons.push("token-budget");
  }
  if (state.consecutive_crashes >= budgets.max_consecutive_crashes) {
    reasons.push("repeated-crashes");
  }
  if (
    state.consecutive_non_improvements
    >= budgets.max_consecutive_non_improvements
  ) {
    reasons.push("plateau");
  }
  return reasons;
}

function assertSample(sample) {
  if (!sample?.experiment_id) throw new Error("experiment_id is required");
  if (!sample?.route) throw new Error("route is required");
  for (const metric of REQUIRED_QUALITY_METRICS) {
    requireNumber(sample.metrics?.quality?.[metric], `metrics.quality.${metric}`);
  }
  for (const metric of REQUIRED_EFFICIENCY_METRICS) {
    requireNumber(
      sample.metrics?.efficiency?.[metric],
      `metrics.efficiency.${metric}`
    );
  }
  for (const metric of REQUIRED_COST_METRICS) {
    requireNumber(sample.metrics?.cost?.[metric], `metrics.cost.${metric}`);
  }
}

function minimumGate(id, actual, expected) {
  return {
    id,
    actual,
    expected,
    status: actual >= expected ? "PASS" : "FAIL"
  };
}

function maximumGate(id, actual, expected) {
  return {
    id,
    actual,
    expected,
    status: actual <= expected ? "PASS" : "FAIL"
  };
}

function totalTokens(cost) {
  return Number(cost.uncached_input_tokens)
    + Number(cost.cached_input_tokens)
    + Number(cost.output_tokens);
}

function complexityScore(complexity = {}) {
  return Number(complexity.changed_lines || 0)
    + Number(complexity.added_runtime_nodes || 0) * 100;
}

function dominates(left, right) {
  const leftValues = [
    left.wall_ms,
    left.total_tokens,
    left.complexity
  ];
  const rightValues = [
    right.wall_ms,
    right.total_tokens,
    right.complexity
  ];
  return leftValues.every((value, index) => value <= rightValues[index])
    && leftValues.some((value, index) => value < rightValues[index]);
}

function requireNumber(value, name) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`${name} must be a finite number`);
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
