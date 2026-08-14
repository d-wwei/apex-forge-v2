const MODES = ["v1-skill", "cli-kernel", "plugin-kernel"];
const HIGHER_IS_BETTER = ["completion", "recovery", "evidence"];
const LOWER_IS_BETTER = ["user_actions", "wall_ms", "cost"];

export function buildBenchmarkPlan(matrix) {
  const repositories = matrix.repositories.map(normalizeId);
  const scenarios = matrix.scenarios.map(normalizeId);
  return {
    generated_at: new Date().toISOString(),
    modes: [...MODES],
    metrics: [...HIGHER_IS_BETTER, ...LOWER_IS_BETTER, "safety"],
    tasks: repositories.flatMap((repository) =>
      scenarios.map((scenario) => ({
        task_id: `${repository}--${scenario}`,
        repository,
        scenario
      }))
    )
  };
}

export function evaluateBenchmark(tasks, results) {
  const expected = new Set(tasks.flatMap((task) => MODES.map((mode) => `${task.task_id}:${mode}`)));
  const actual = new Set(results.map((result) => `${result.task_id}:${result.mode}`));
  const missing = [...expected].filter((key) => !actual.has(key));
  if (missing.length > 0) {
    return {
      status: "BLOCKED",
      required_runs: expected.size,
      completed_runs: expected.size - missing.length,
      missing_runs: missing,
      plugin_metrics_won: 0,
      scenarios_passed: 0,
      required_scenarios: Math.ceil(new Set(tasks.map((task) => task.scenario)).size * 2 / 3),
      safety_regression: null
    };
  }

  const overall = aggregateModes(results);
  const pluginMetricsWon = countWins(overall);
  const safetyRegression = overall["plugin-kernel"].safety < Math.max(
    overall["v1-skill"].safety,
    overall["cli-kernel"].safety
  );
  const scenarioIds = [...new Set(tasks.map((task) => task.scenario))];
  const scenarioEvaluations = scenarioIds.map((scenario) => {
    const aggregates = aggregateModes(results.filter((result) => result.scenario === scenario));
    const wins = countWins(aggregates);
    const regressed = aggregates["plugin-kernel"].safety < Math.max(
      aggregates["v1-skill"].safety,
      aggregates["cli-kernel"].safety
    );
    return { scenario, wins, safety_regression: regressed, pass: wins >= 4 && !regressed };
  });
  const scenariosPassed = scenarioEvaluations.filter((item) => item.pass).length;
  const requiredScenarios = Math.ceil(scenarioIds.length * 2 / 3);

  return {
    status: pluginMetricsWon >= 4 && scenariosPassed >= requiredScenarios && !safetyRegression ? "PASS" : "FAIL",
    required_runs: expected.size,
    completed_runs: expected.size,
    missing_runs: [],
    plugin_metrics_won: pluginMetricsWon,
    scenarios_passed: scenariosPassed,
    required_scenarios: requiredScenarios,
    safety_regression: safetyRegression,
    aggregates: overall,
    scenario_evaluations: scenarioEvaluations
  };
}

function aggregateModes(results) {
  return Object.fromEntries(MODES.map((mode) => [
    mode,
    aggregate(results.filter((result) => result.mode === mode).map((result) => result.metrics))
  ]));
}

function aggregate(records) {
  const metrics = [...HIGHER_IS_BETTER, ...LOWER_IS_BETTER, "safety"];
  return Object.fromEntries(metrics.map((metric) => [
    metric,
    records.reduce((sum, record) => sum + Number(record[metric] || 0), 0) / records.length
  ]));
}

function countWins(aggregates) {
  const plugin = aggregates["plugin-kernel"];
  const alternatives = [aggregates["v1-skill"], aggregates["cli-kernel"]];
  return HIGHER_IS_BETTER.filter((metric) =>
    alternatives.every((alternative) => plugin[metric] >= alternative[metric])
    && alternatives.some((alternative) => plugin[metric] > alternative[metric])
  ).length + LOWER_IS_BETTER.filter((metric) =>
    alternatives.every((alternative) => plugin[metric] <= alternative[metric])
    && alternatives.some((alternative) => plugin[metric] < alternative[metric])
  ).length;
}

function normalizeId(value) {
  return typeof value === "string" ? value : value.id;
}
