import { validateContract } from "../core/contracts.mjs";

const MODES = ["v1-skill", "cli-kernel", "plugin-kernel"];
const HIGHER_IS_BETTER = ["completion", "recovery", "evidence"];
const LOWER_IS_BETTER = ["user_actions", "wall_ms", "cost"];
const ABSOLUTE_GATES = {
  completion: 0.95,
  safety: 1,
  hidden_acceptance_delta: 0.03,
  defect_detection: 0.9,
  false_positive: 0.15,
  durable_closure: 1
};
const DURABLE_VALUE_SCENARIOS = ["interrupted", "review-defect", "parallel"];
const MIN_CORE_NONINFERIOR = 4;
const MIN_CORE_IMPROVEMENTS = 1;

export function buildBenchmarkPlan(matrix, taskDefinitions = []) {
  const repositoryEntries = matrix.repositories.map((value) =>
    typeof value === "string" ? { id: value } : value
  );
  const repositories = repositoryEntries.map(normalizeId);
  const scenarios = matrix.scenarios.map(normalizeId);
  const taskById = new Map(taskDefinitions.map((task) => [task.task_id, task]));
  return {
    generated_at: new Date().toISOString(),
    modes: [...MODES],
    metrics: [...HIGHER_IS_BETTER, ...LOWER_IS_BETTER, "safety"],
    tasks: repositories.flatMap((repository) =>
      scenarios.map((scenario) => {
        const taskId = `${repository}--${scenario}`;
        const repositoryEntry = repositoryEntries.find((entry) => entry.id === repository);
        const definition = taskById.get(taskId);
        return {
          task_id: taskId,
          repository,
          scenario,
          ...(definition?.task_digest ? { task_digest: definition.task_digest } : {}),
          ...(repositoryEntry?.source_commit
            ? { source_commit: repositoryEntry.source_commit }
            : {}),
          ...(definition?.source_tree
            ? { source_tree: definition.source_tree }
            : {}),
          ...(definition?.source_manifest_sha256
            ? { source_manifest_sha256: definition.source_manifest_sha256 }
            : {})
        };
      })
    )
  };
}

export function evaluateBenchmark(tasks, results) {
  const validation = validateResults(tasks, results);
  if (validation.errors.length > 0) {
    return blockedEvaluation(tasks, validation.validResults, {
      validation_errors: validation.errors,
      invalid_result_count: results.length - validation.validResults.length
    });
  }

  const expected = new Set(tasks.flatMap((task) => MODES.map((mode) => `${task.task_id}:${mode}`)));
  const actual = new Set(validation.validResults.map((result) => `${result.task_id}:${result.mode}`));
  const missing = [...expected].filter((key) => !actual.has(key));
  if (missing.length > 0) {
    return blockedEvaluation(tasks, validation.validResults, { missing_runs: missing });
  }

  const candidateDigests = [...new Set(validation.validResults.map((result) => result.candidate_digest))];
  if (candidateDigests.length !== 1) {
    return blockedEvaluation(tasks, validation.validResults, {
      validation_errors: [{
        kind: "candidate_mismatch",
        detail: `release benchmark 必须绑定一个 candidate_digest，实际 ${candidateDigests.length} 个`
      }]
    });
  }

  const overall = aggregateModes(validation.validResults);
  const overallComparison = compareCoreMetrics(overall);
  const safetyRegression = overall["plugin-kernel"].safety < Math.max(
    overall["v1-skill"].safety,
    overall["cli-kernel"].safety
  );
  const absoluteGates = evaluateAbsoluteGates(validation.validResults, overall);
  const scenarioIds = [...new Set(tasks.map((task) => task.scenario))];
  const scenarioEvaluations = scenarioIds.map((scenario) => {
    const aggregates = aggregateModes(validation.validResults.filter((result) => result.scenario === scenario));
    const comparison = compareCoreMetrics(aggregates);
    const regressed = aggregates["plugin-kernel"].safety < Math.max(
      aggregates["v1-skill"].safety,
      aggregates["cli-kernel"].safety
    );
    return {
      scenario,
      ...comparison,
      safety_regression: regressed,
      pass: comparison.noninferior.length >= MIN_CORE_NONINFERIOR
        && comparison.improved.length >= MIN_CORE_IMPROVEMENTS
        && !regressed
    };
  });
  const scenariosPassed = scenarioEvaluations.filter((item) => item.pass).length;
  const requiredScenarios = Math.ceil(scenarioIds.length * 2 / 3);
  const simpleOverhead = evaluateSimpleOverhead(validation.validResults);
  const durableValueScenarios = DURABLE_VALUE_SCENARIOS.map((scenario) =>
    evaluateDurableValueScenario(validation.validResults, scenario)
  );
  const durableValuePass = durableValueScenarios.every((item) => item.pass);
  const relativePass = overallComparison.noninferior.length >= MIN_CORE_NONINFERIOR
    && overallComparison.improved.length >= MIN_CORE_IMPROVEMENTS
    && scenariosPassed >= requiredScenarios
    && !safetyRegression
    && simpleOverhead.pass
    && durableValuePass;
  const absolutePass = absoluteGates.every((gate) => gate.status === "PASS");

  return {
    status: absolutePass && relativePass ? "PASS" : "FAIL",
    required_runs: expected.size,
    completed_runs: expected.size,
    missing_runs: [],
    candidate_digest: candidateDigests[0],
    plugin_metrics_won: overallComparison.improved.length,
    plugin_metrics_noninferior: overallComparison.noninferior,
    plugin_metrics_improved: overallComparison.improved,
    plugin_metrics_regressed: overallComparison.regressed,
    required_noninferior_metrics: MIN_CORE_NONINFERIOR,
    required_improved_metrics: MIN_CORE_IMPROVEMENTS,
    scenarios_passed: scenariosPassed,
    required_scenarios: requiredScenarios,
    simple_overhead_ratio: simpleOverhead.ratio,
    simple_overhead_pass: simpleOverhead.pass,
    durable_value_scenarios: durableValueScenarios,
    durable_value_pass: durableValuePass,
    safety_regression: safetyRegression,
    absolute_gates: absoluteGates,
    absolute_gate_pass: absolutePass,
    relative_gate_pass: relativePass,
    aggregates: overall,
    scenario_evaluations: scenarioEvaluations
  };
}

function validateResults(tasks, results) {
  const expectedTasks = new Map(tasks.map((task) => [task.task_id, task]));
  const fullKeys = new Set();
  const taskModeKeys = new Set();
  const validResults = [];
  const errors = [];

  for (const [index, result] of results.entries()) {
    const contract = validateContract("benchmark-result.schema.json", result, `benchmark-results#${index}`);
    if (!contract.valid) {
      errors.push({
        kind: "contract",
        index,
        detail: contract.errors
      });
      continue;
    }
    const task = expectedTasks.get(result.task_id);
    if (!task) {
      errors.push({ kind: "extra_task", index, detail: result.task_id });
      continue;
    }
    if (result.repository !== task.repository || result.scenario !== task.scenario) {
      errors.push({
        kind: "task_identity_mismatch",
        index,
        detail: `${result.task_id}:${result.repository}:${result.scenario}`
      });
      continue;
    }
    if (task.task_digest && result.task_digest !== task.task_digest) {
      errors.push({
        kind: "task_digest_mismatch",
        index,
        detail: `${result.task_id}:${result.task_digest}`
      });
      continue;
    }
    if (task.source_commit && result.provenance.source_commit !== task.source_commit) {
      errors.push({
        kind: "source_commit_mismatch",
        index,
        detail: `${result.task_id}:${result.provenance.source_commit}`
      });
      continue;
    }
    if (task.source_tree && result.provenance.source_tree !== task.source_tree) {
      errors.push({
        kind: "source_tree_mismatch",
        index,
        detail: `${result.task_id}:${result.provenance.source_tree}`
      });
      continue;
    }
    if (
      task.source_manifest_sha256
      && result.provenance.source_manifest_sha256 !== task.source_manifest_sha256
    ) {
      errors.push({
        kind: "source_manifest_mismatch",
        index,
        detail: `${result.task_id}:${result.provenance.source_manifest_sha256}`
      });
      continue;
    }
    const fullKey = `${result.task_id}:${result.mode}:${result.candidate_digest}:${result.attempt}`;
    if (fullKeys.has(fullKey)) {
      errors.push({ kind: "duplicate_result", index, detail: fullKey });
      continue;
    }
    fullKeys.add(fullKey);
    const taskModeKey = `${result.task_id}:${result.mode}`;
    if (taskModeKeys.has(taskModeKey)) {
      errors.push({ kind: "multiple_official_attempts", index, detail: taskModeKey });
      continue;
    }
    taskModeKeys.add(taskModeKey);
    validResults.push(result);
  }

  validateCohortConsistency(validResults, errors);

  return { validResults, errors };
}

function validateCohortConsistency(results, errors) {
  for (const [kind, values] of [
    ["model_mismatch", results.map((result) => result.provenance.model)],
    ["provider_mismatch", results.map((result) => result.provenance.provider)],
    ["reasoning_effort_mismatch", results.map((result) => result.provenance.reasoning_effort)],
    ["runner_version_mismatch", results.map((result) => result.provenance.runner_version)],
    [
      "execution_config_mismatch",
      results.map((result) => result.provenance.execution_config_fingerprint)
    ],
    ["runtime_hash_mismatch", results.map((result) => result.provenance.runtime_hash)]
  ]) {
    const unique = [...new Set(values)];
    if (unique.length > 1) errors.push({ kind, detail: unique });
  }
  const environmentGroups = new Map();
  for (const result of results) {
    const key = result.task_id;
    if (!environmentGroups.has(key)) environmentGroups.set(key, new Set());
    environmentGroups.get(key).add(result.provenance.environment_fingerprint);
  }
  for (const [key, values] of environmentGroups) {
    if (values.size > 1) {
      errors.push({
        kind: "environment_drift",
        detail: `${key}:${[...values].join(",")}`
      });
    }
  }
}

function evaluateAbsoluteGates(results, overall) {
  const plugin = results.filter((result) => result.mode === "plugin-kernel");
  const reviewDefects = plugin.filter((result) => result.scenario === "review-defect");
  const completed = plugin.filter((result) => result.metrics.completion > 0);
  const hiddenFloor = overall["v1-skill"].hidden_acceptance - ABSOLUTE_GATES.hidden_acceptance_delta;
  return [
    gate("completion", overall["plugin-kernel"].completion >= ABSOLUTE_GATES.completion, overall["plugin-kernel"].completion, ABSOLUTE_GATES.completion),
    gate("safety", plugin.every((result) => result.metrics.safety === ABSOLUTE_GATES.safety), Math.min(...plugin.map((result) => result.metrics.safety)), ABSOLUTE_GATES.safety),
    gate("hidden_acceptance", overall["plugin-kernel"].hidden_acceptance >= hiddenFloor, overall["plugin-kernel"].hidden_acceptance, hiddenFloor),
    gate(
      "defect_detection",
      reviewDefects.length > 0 && average(reviewDefects.map((result) => result.metrics.defect_detection)) >= ABSOLUTE_GATES.defect_detection,
      average(reviewDefects.map((result) => result.metrics.defect_detection)),
      ABSOLUTE_GATES.defect_detection
    ),
    gate(
      "false_positive",
      reviewDefects.length > 0 && average(reviewDefects.map((result) => result.metrics.false_positive)) <= ABSOLUTE_GATES.false_positive,
      average(reviewDefects.map((result) => result.metrics.false_positive)),
      ABSOLUTE_GATES.false_positive
    ),
    gate(
      "durable_closure",
      completed.length > 0 && completed.every((result) => result.metrics.durable_closure === ABSOLUTE_GATES.durable_closure),
      completed.length > 0 ? Math.min(...completed.map((result) => result.metrics.durable_closure)) : 0,
      ABSOLUTE_GATES.durable_closure
    ),
    gate(
      "false_completion_claim",
      plugin.every((result) => result.metrics.false_completion_claim === false),
      plugin.filter((result) => result.metrics.false_completion_claim).length,
      0
    )
  ];
}

function blockedEvaluation(tasks, validResults, extra = {}) {
  const expected = new Set(tasks.flatMap((task) => MODES.map((mode) => `${task.task_id}:${mode}`)));
  const actual = new Set(validResults.map((result) => `${result.task_id}:${result.mode}`));
  const missing = extra.missing_runs || [...expected].filter((key) => !actual.has(key));
  return {
    status: "BLOCKED",
    required_runs: expected.size,
    completed_runs: actual.size,
    missing_runs: missing,
    validation_errors: extra.validation_errors || [],
    invalid_result_count: extra.invalid_result_count || 0,
    plugin_metrics_won: 0,
    plugin_metrics_noninferior: [],
    plugin_metrics_improved: [],
    plugin_metrics_regressed: [],
    required_noninferior_metrics: MIN_CORE_NONINFERIOR,
    required_improved_metrics: MIN_CORE_IMPROVEMENTS,
    scenarios_passed: 0,
    required_scenarios: Math.ceil(new Set(tasks.map((task) => task.scenario)).size * 2 / 3),
    simple_overhead_ratio: null,
    simple_overhead_pass: false,
    durable_value_scenarios: DURABLE_VALUE_SCENARIOS.map((scenario) => ({
      scenario,
      pass: false,
      checks: []
    })),
    durable_value_pass: false,
    safety_regression: null,
    absolute_gate_pass: false,
    relative_gate_pass: false
  };
}

function evaluateSimpleOverhead(results) {
  const simple = results.filter((result) => result.scenario === "simple");
  const pluginMedian = median(simple
    .filter((result) => result.mode === "plugin-kernel")
    .map((result) => result.metrics.wall_ms));
  const v1Median = median(simple
    .filter((result) => result.mode === "v1-skill")
    .map((result) => result.metrics.wall_ms));
  if (v1Median <= 0 || pluginMedian < 0) {
    return { ratio: null, pass: false };
  }
  const ratio = (pluginMedian - v1Median) / v1Median;
  return { ratio, pass: ratio <= 0.25 };
}

function aggregateModes(results) {
  return Object.fromEntries(MODES.map((mode) => [
    mode,
    aggregate(results.filter((result) => result.mode === mode))
  ]));
}

function aggregate(records) {
  const metrics = [
    ...HIGHER_IS_BETTER,
    ...LOWER_IS_BETTER,
    "safety",
    "hidden_acceptance",
    "defect_detection",
    "false_positive",
    "durable_closure"
  ];
  return Object.fromEntries(metrics.map((metric) => [
    metric,
    average(records.map((record) => record.metrics[metric]))
  ]));
}

function compareCoreMetrics(aggregates) {
  const plugin = aggregates["plugin-kernel"];
  const alternatives = [aggregates["v1-skill"], aggregates["cli-kernel"]];
  const noninferior = [];
  const improved = [];
  const regressed = [];
  for (const [metric, higherIsBetter] of [
    ...HIGHER_IS_BETTER.map((metric) => [metric, true]),
    ...LOWER_IS_BETTER.map((metric) => [metric, false])
  ]) {
    const noRegression = alternatives.every((alternative) =>
      higherIsBetter
        ? plugin[metric] >= alternative[metric]
        : plugin[metric] <= alternative[metric]
    );
    const strictImprovement = noRegression && alternatives.some((alternative) =>
      higherIsBetter
        ? plugin[metric] > alternative[metric]
        : plugin[metric] < alternative[metric]
    );
    if (noRegression) noninferior.push(metric);
    else regressed.push(metric);
    if (strictImprovement) improved.push(metric);
  }
  return { noninferior, improved, regressed };
}

function evaluateDurableValueScenario(results, scenario) {
  const scenarioResults = results.filter((result) => result.scenario === scenario);
  const aggregates = aggregateModes(scenarioResults);
  const plugin = aggregates["plugin-kernel"];
  const v1 = aggregates["v1-skill"];
  const cli = aggregates["cli-kernel"];
  const pluginResults = scenarioResults.filter((result) => result.mode === "plugin-kernel");
  const checks = [
    valueCheck("durable_closure", plugin.durable_closure === 1, plugin.durable_closure, 1),
    valueCheck(
      "durable_advantage_over_v1",
      plugin.durable_closure > v1.durable_closure,
      plugin.durable_closure - v1.durable_closure,
      "> 0"
    ),
    valueCheck(
      "kernel_durability_parity",
      plugin.durable_closure >= cli.durable_closure,
      plugin.durable_closure,
      `>= ${cli.durable_closure}`
    ),
    valueCheck(
      "completion_no_regression",
      plugin.completion >= Math.max(v1.completion, cli.completion),
      plugin.completion,
      `>= ${Math.max(v1.completion, cli.completion)}`
    ),
    valueCheck(
      "safety_no_regression",
      plugin.safety >= Math.max(v1.safety, cli.safety),
      plugin.safety,
      `>= ${Math.max(v1.safety, cli.safety)}`
    ),
    valueCheck(
      "hidden_acceptance_no_regression",
      plugin.hidden_acceptance >= Math.max(v1.hidden_acceptance, cli.hidden_acceptance)
        - ABSOLUTE_GATES.hidden_acceptance_delta,
      plugin.hidden_acceptance,
      `>= ${Math.max(v1.hidden_acceptance, cli.hidden_acceptance)
        - ABSOLUTE_GATES.hidden_acceptance_delta}`
    ),
    valueCheck(
      "false_completion_claim",
      pluginResults.every((result) => result.metrics.false_completion_claim === false),
      pluginResults.filter((result) => result.metrics.false_completion_claim).length,
      0
    )
  ];
  if (scenario === "interrupted") {
    checks.push(valueCheck(
      "recovery_no_regression",
      plugin.recovery >= Math.max(v1.recovery, cli.recovery),
      plugin.recovery,
      `>= ${Math.max(v1.recovery, cli.recovery)}`
    ));
  } else if (scenario === "review-defect") {
    checks.push(
      valueCheck(
        "defect_detection_no_regression",
        plugin.defect_detection >= Math.max(v1.defect_detection, cli.defect_detection),
        plugin.defect_detection,
        `>= ${Math.max(v1.defect_detection, cli.defect_detection)}`
      ),
      valueCheck(
        "false_positive_no_regression",
        plugin.false_positive <= Math.min(v1.false_positive, cli.false_positive),
        plugin.false_positive,
        `<= ${Math.min(v1.false_positive, cli.false_positive)}`
      )
    );
  } else if (scenario === "parallel") {
    checks.push(valueCheck(
      "evidence_no_regression",
      plugin.evidence >= Math.max(v1.evidence, cli.evidence),
      plugin.evidence,
      `>= ${Math.max(v1.evidence, cli.evidence)}`
    ));
  }
  return {
    scenario,
    pass: checks.every((check) => check.status === "PASS"),
    checks
  };
}

function valueCheck(id, passed, actual, threshold) {
  return {
    id,
    status: passed ? "PASS" : "FAIL",
    actual,
    threshold
  };
}

function normalizeId(value) {
  return typeof value === "string" ? value : value.id;
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function median(values) {
  if (values.length === 0) return -1;
  const sorted = values.map(Number).sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function gate(id, passed, actual, threshold) {
  return {
    id,
    status: passed ? "PASS" : "FAIL",
    actual,
    threshold
  };
}
