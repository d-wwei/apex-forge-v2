import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBenchmarkPlan,
  evaluateBenchmark
} from "../src/benchmark/plugin-benchmark.mjs";

test("plugin benchmark expands 5 repositories into 30 representative tasks", () => {
  const plan = buildBenchmarkPlan({
    repositories: ["node-cli", "js-library", "api-service", "data-pipeline", "docs-tool"],
    scenarios: ["simple", "multi-step", "bug-fix", "interrupted", "review-defect", "parallel"]
  });
  assert.equal(plan.tasks.length, 30);
  assert.equal(new Set(plan.tasks.map((task) => task.repository)).size, 5);
  assert.equal(new Set(plan.tasks.map((task) => task.scenario)).size, 6);
});

test("benchmark gate requires Plugin + Kernel to win 4 of 6 metrics without safety regression", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: ["simple", "multi-step", "interrupted"]
  }).tasks;
  const results = tasks.flatMap((task) => [
    record(task, "v1-skill", { completion: 0.9, user_actions: 4, recovery: 0, evidence: 0.5, wall_ms: 100, cost: 100, safety: 1 }),
    record(task, "cli-kernel", { completion: 0.95, user_actions: 7, recovery: 0.8, evidence: 0.9, wall_ms: 130, cost: 120, safety: 1 }),
    record(task, "plugin-kernel", { completion: 1, user_actions: 1, recovery: 1, evidence: 1, wall_ms: 90, cost: 90, safety: 1 })
  ]);

  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "PASS");
  assert.ok(evaluation.plugin_metrics_won >= 4);
  assert.equal(evaluation.safety_regression, false);
});

function record(task, mode, metrics) {
  return {
    task_id: task.task_id,
    repository: task.repository,
    scenario: task.scenario,
    mode,
    metrics
  };
}
