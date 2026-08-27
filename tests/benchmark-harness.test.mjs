import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBenchmarkPlan,
  evaluateBenchmark
} from "../src/benchmark/plugin-benchmark.mjs";
import { spawnSync } from "node:child_process";

const DIGEST = "a".repeat(64);
const HASH = "b".repeat(64);

test("plugin benchmark expands 5 repositories into 30 representative tasks", () => {
  const plan = buildBenchmarkPlan({
    repositories: ["node-cli", "js-library", "api-service", "data-pipeline", "docs-tool"],
    scenarios: ["simple", "multi-step", "bug-fix", "interrupted", "review-defect", "parallel"]
  });
  assert.equal(plan.tasks.length, 30);
  assert.equal(new Set(plan.tasks.map((task) => task.repository)).size, 5);
  assert.equal(new Set(plan.tasks.map((task) => task.scenario)).size, 6);
});

test("plugin benchmark preserves an explicit task subset", () => {
  const plan = buildBenchmarkPlan({
    repositories: [{ id: "repo", source_commit: "1234567" }],
    scenarios: ["simple", "bug-fix"]
  }, [{
    task_id: "repo--bug-fix",
    task_digest: "d".repeat(64),
    repository: "repo",
    scenario: "bug-fix"
  }]);
  assert.deepEqual(plan.tasks.map((task) => task.task_id), [
    "repo--bug-fix"
  ]);
  assert.equal(plan.tasks[0].source_commit, "1234567");
});

test("canary benchmark reports successful delivery rate and token cost by mode", () => {
  const modes = ["raw-agent", "v1-skill", "plugin-kernel"];
  const tasks = buildBenchmarkPlan(
    { repositories: ["repo"], scenarios: ["simple"] },
    [],
    modes
  ).tasks;
  const task = tasks[0];
  const results = [
    record(task, "raw-agent", ceilingMetrics({ cost: 30, durable_closure: 0 })),
    record(task, "v1-skill", ceilingMetrics({ cost: 20, durable_closure: 0 })),
    record(task, "plugin-kernel", ceilingMetrics({ cost: 40 }))
  ];
  const evaluation = evaluateBenchmark(tasks, results, { modes });
  assert.equal(
    evaluation.delivery_metrics_by_mode["raw-agent"].successful_delivery_rate,
    1
  );
  assert.equal(
    evaluation.delivery_metrics_by_mode["plugin-kernel"].tokens_per_successful_delivery,
    40
  );
  assert.equal(
    evaluation.delivery_metrics_by_mode["v1-skill"].successful_deliveries,
    1
  );
  assert.deepEqual(evaluation.durable_value_scenarios, []);
  assert.equal(evaluation.durable_value_pass, true);
});

test("delivery efficiency reports null token cost when a mode has no successful delivery", () => {
  const modes = ["raw-agent", "v1-skill", "plugin-kernel"];
  const tasks = buildBenchmarkPlan(
    { repositories: ["repo"], scenarios: ["simple"] },
    [],
    modes
  ).tasks;
  const results = [
    record(tasks[0], "raw-agent", ceilingMetrics({ completion: 0, cost: 99 })),
    record(tasks[0], "v1-skill", ceilingMetrics({ cost: 20, durable_closure: 0 })),
    record(tasks[0], "plugin-kernel", ceilingMetrics({ cost: 40 }))
  ];
  const evaluation = evaluateBenchmark(tasks, results, { modes });
  assert.equal(
    evaluation.delivery_metrics_by_mode["raw-agent"].successful_delivery_rate,
    0
  );
  assert.equal(
    evaluation.delivery_metrics_by_mode["raw-agent"].tokens_per_successful_delivery,
    null
  );
});

test("product benchmark preparation lists five pinned external repositories", () => {
  const script = new URL("../scripts/prepare-product-benchmark.mjs", import.meta.url).pathname;
  const result = spawnSync(process.execPath, [script, "--list"], {
    cwd: new URL("../", import.meta.url).pathname,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.repositories.length, 5);
  assert.ok(value.repositories.every((repository) =>
    /^[a-f0-9]{40}$/.test(repository.source_commit)
    && /^[a-f0-9]{40}$/.test(repository.source_tree)
    && typeof repository.install_command === "string"
    && repository.source_url.startsWith("https://github.com/")
  ));
  assert.equal(
    value.repositories.find((repository) => repository.id === "apex-forge-v1")
      .prepare_command,
    "bun run build"
  );
  assert.equal(
    value.repositories.find((repository) => repository.id === "understand-codebase")
      .prepare_command,
    "pnpm --filter @understand-codebase/core build"
  );
});

test("benchmark gate requires complete result coverage", () => {
  const tasks = buildBenchmarkPlan({ repositories: ["repo"], scenarios: ["simple"] }).tasks;
  const evaluation = evaluateBenchmark(tasks, []);
  assert.equal(evaluation.status, "BLOCKED");
  assert.equal(evaluation.completed_runs, 0);
  assert.equal(evaluation.missing_runs.length, 3);
});

test("benchmark rejects records without provenance", () => {
  const tasks = buildBenchmarkPlan({ repositories: ["repo"], scenarios: ["simple"] }).tasks;
  const invalid = completeResults(tasks).map(({ provenance, ...result }) => result);
  const evaluation = evaluateBenchmark(tasks, invalid);
  assert.equal(evaluation.status, "BLOCKED");
  assert.equal(evaluation.invalid_result_count, 3);
  assert.ok(evaluation.validation_errors.some((error) => error.kind === "contract"));
});

test("benchmark rejects duplicate official attempts", () => {
  const tasks = buildBenchmarkPlan({ repositories: ["repo"], scenarios: ["simple"] }).tasks;
  const results = completeResults(tasks);
  results.push(structuredClone(results[0]));
  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "BLOCKED");
  assert.ok(evaluation.validation_errors.some((error) => error.kind === "duplicate_result"));
});

test("benchmark rejects extra task records", () => {
  const tasks = buildBenchmarkPlan({ repositories: ["repo"], scenarios: ["simple"] }).tasks;
  const results = completeResults(tasks);
  results[0].task_id = "unknown--simple";
  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "BLOCKED");
  assert.ok(evaluation.validation_errors.some((error) => error.kind === "extra_task"));
});

test("benchmark rejects a mode outside the selected comparison matrix", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: ["simple"]
  }).tasks;
  const results = completeResults(tasks);
  results.push(record(tasks[0], "raw-agent", ceilingMetrics()));
  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "BLOCKED");
  assert.ok(evaluation.validation_errors.some((error) =>
    error.kind === "unexpected_mode_or_task"
  ));
});

test("benchmark rejects task digest and source commit drift", () => {
  const matrix = {
    repositories: [{ id: "repo", source_commit: "1234567" }],
    scenarios: ["simple"]
  };
  const tasks = buildBenchmarkPlan(matrix, [{
    task_id: "repo--simple",
    task_digest: "d".repeat(64)
  }]).tasks;
  const results = completeResults(tasks);
  results[0].task_digest = "e".repeat(64);
  results[1].provenance.source_commit = "7654321";
  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "BLOCKED");
  assert.ok(evaluation.validation_errors.some((error) =>
    error.kind === "task_digest_mismatch"
  ));
  assert.ok(evaluation.validation_errors.some((error) =>
    error.kind === "source_commit_mismatch"
  ));
});

test("benchmark rejects model, execution cohort, and environment drift", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: ["simple", "multi-step"]
  }).tasks;
  const results = completeResults(tasks);
  results[0].provenance.model = "different-model";
  const pluginRuns = results.filter((result) => result.mode === "plugin-kernel");
  pluginRuns[1].provenance.runner_version = "different-runner";
  pluginRuns[1].provenance.execution_config_fingerprint = "f".repeat(64);
  pluginRuns[1].provenance.environment_fingerprint = "drifted-environment";
  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "BLOCKED");
  assert.ok(evaluation.validation_errors.some((error) =>
    error.kind === "model_mismatch"
  ));
  assert.ok(evaluation.validation_errors.some((error) =>
    error.kind === "runner_version_mismatch"
  ));
  assert.ok(evaluation.validation_errors.some((error) =>
    error.kind === "execution_config_mismatch"
  ));
  assert.ok(evaluation.validation_errors.some((error) =>
    error.kind === "environment_drift"
  ));
});

test("benchmark rejects cross-arm environment drift for the same task", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: ["simple"]
  }).tasks;
  const results = completeResults(tasks);
  results.find((result) => result.mode === "plugin-kernel")
    .provenance.environment_fingerprint = "different-environment";
  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "BLOCKED");
  assert.ok(evaluation.validation_errors.some((error) =>
    error.kind === "environment_drift"
  ));
});

test("absolute gates fail closed when completion and safety are zero", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: ["simple", "multi-step", "review-defect"]
  }).tasks;
  const results = completeResults(tasks, {
    v1: {
      completion: 0,
      recovery: 0,
      evidence: 0,
      user_actions: 2,
      wall_ms: 2,
      cost: 2,
      safety: 0,
      hidden_acceptance: 0,
      defect_detection: 0,
      false_positive: 0,
      durable_closure: 0,
      false_completion_claim: false
    },
    cli: {
      completion: 0,
      recovery: 0,
      evidence: 0,
      user_actions: 2,
      wall_ms: 2,
      cost: 2,
      safety: 0,
      hidden_acceptance: 0,
      defect_detection: 0,
      false_positive: 0,
      durable_closure: 0,
      false_completion_claim: false
    },
    plugin: {
      completion: 0,
      recovery: 0.1,
      evidence: 0.1,
      user_actions: 1,
      wall_ms: 1,
      cost: 1,
      safety: 0,
      hidden_acceptance: 0,
      defect_detection: 1,
      false_positive: 0,
      durable_closure: 0,
      false_completion_claim: false
    }
  });
  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "FAIL");
  assert.equal(evaluation.plugin_metrics_won, 5);
  assert.equal(evaluation.plugin_metrics_noninferior.length, 6);
  assert.equal(evaluation.absolute_gate_pass, false);
  assert.equal(evaluation.absolute_gates.find((gate) => gate.id === "completion").status, "FAIL");
  assert.equal(evaluation.absolute_gates.find((gate) => gate.id === "safety").status, "FAIL");
});

test("benchmark gate passes only when absolute and relative gates both pass", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: [
      "simple",
      "multi-step",
      "bug-fix",
      "interrupted",
      "review-defect",
      "parallel"
    ]
  }).tasks;
  const evaluation = evaluateBenchmark(tasks, completeResults(tasks));
  assert.equal(evaluation.status, "PASS");
  assert.equal(evaluation.absolute_gate_pass, true);
  assert.equal(evaluation.relative_gate_pass, true);
  assert.ok(evaluation.plugin_metrics_noninferior.length >= 4);
  assert.ok(evaluation.plugin_metrics_improved.length >= 1);
  assert.equal(evaluation.simple_overhead_pass, true);
  assert.equal(evaluation.durable_value_pass, true);
});

test("ceiling metrics remain comparable without pretending ties are strict wins", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: [
      "simple",
      "multi-step",
      "bug-fix",
      "interrupted",
      "review-defect",
      "parallel"
    ]
  }).tasks;
  const results = completeResults(tasks, {
    v1: ceilingMetrics({
      evidence: 0.7,
      wall_ms: 100,
      cost: 100,
      durable_closure: 0
    }),
    cli: ceilingMetrics({
      evidence: 1,
      wall_ms: 300,
      cost: 300,
      durable_closure: 1
    }),
    plugin: ceilingMetrics({
      evidence: 1,
      wall_ms: 200,
      cost: 200,
      durable_closure: 1
    })
  });
  for (const result of results) {
    if (result.scenario === "simple" && result.mode === "plugin-kernel") {
      result.metrics.wall_ms = 90;
    }
  }

  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.status, "PASS");
  assert.deepEqual(
    evaluation.plugin_metrics_noninferior.sort(),
    ["completion", "evidence", "recovery", "user_actions"]
  );
  assert.deepEqual(evaluation.plugin_metrics_improved, ["evidence"]);
  assert.equal(evaluation.plugin_metrics_won, 1);
  assert.equal(evaluation.durable_value_pass, true);
});

test("relative gate requires a strict improvement beyond ceiling ties", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: [
      "simple",
      "multi-step",
      "bug-fix",
      "interrupted",
      "review-defect",
      "parallel"
    ]
  }).tasks;
  const shared = ceilingMetrics({
    evidence: 1,
    wall_ms: 100,
    cost: 100,
    durable_closure: 1
  });
  const results = completeResults(tasks, {
    v1: shared,
    cli: shared,
    plugin: shared
  });

  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.plugin_metrics_noninferior.length, 6);
  assert.deepEqual(evaluation.plugin_metrics_improved, []);
  assert.equal(evaluation.relative_gate_pass, false);
  assert.equal(evaluation.status, "FAIL");
});

test("durable value scenarios cannot pass without a closure advantage over V1", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: [
      "simple",
      "multi-step",
      "bug-fix",
      "interrupted",
      "review-defect",
      "parallel"
    ]
  }).tasks;
  const results = completeResults(tasks);
  for (const result of results) {
    if (result.mode === "v1-skill" && result.scenario === "parallel") {
      result.metrics.durable_closure = 1;
    }
  }

  const evaluation = evaluateBenchmark(tasks, results);
  const parallel = evaluation.durable_value_scenarios.find(
    (item) => item.scenario === "parallel"
  );
  assert.equal(parallel.pass, false);
  assert.equal(
    parallel.checks.find((check) => check.id === "durable_advantage_over_v1").status,
    "FAIL"
  );
  assert.equal(evaluation.relative_gate_pass, false);
});

test("benchmark fails when simple overhead exceeds 25 percent", () => {
  const tasks = buildBenchmarkPlan({
    repositories: ["repo"],
    scenarios: [
      "simple",
      "multi-step",
      "bug-fix",
      "interrupted",
      "review-defect",
      "parallel"
    ]
  }).tasks;
  const results = completeResults(tasks);
  for (const result of results) {
    if (result.scenario === "simple" && result.mode === "plugin-kernel") {
      result.metrics.wall_ms = 151;
    }
  }
  const evaluation = evaluateBenchmark(tasks, results);
  assert.equal(evaluation.simple_overhead_pass, false);
  assert.equal(evaluation.relative_gate_pass, false);
  assert.equal(evaluation.status, "FAIL");
});

function completeResults(tasks, overrides = {}) {
  return tasks.flatMap((task) => [
    record(task, "v1-skill", overrides.v1 || {
      completion: 0.96,
      user_actions: 4,
      recovery: 0.4,
      evidence: 0.6,
      wall_ms: 120,
      cost: 120,
      safety: 1,
      hidden_acceptance: 0.96,
      defect_detection: task.scenario === "review-defect" ? 0.9 : 0,
      false_positive: task.scenario === "review-defect" ? 0.1 : 0,
      durable_closure: 0,
      false_completion_claim: false
    }),
    record(task, "cli-kernel", overrides.cli || {
      completion: 0.98,
      user_actions: 6,
      recovery: 0.8,
      evidence: 0.9,
      wall_ms: 130,
      cost: 130,
      safety: 1,
      hidden_acceptance: 0.98,
      defect_detection: task.scenario === "review-defect" ? 0.95 : 0,
      false_positive: task.scenario === "review-defect" ? 0.05 : 0,
      durable_closure: 1,
      false_completion_claim: false
    }),
    record(task, "plugin-kernel", overrides.plugin || {
      completion: 1,
      user_actions: 1,
      recovery: 1,
      evidence: 1,
      wall_ms: 90,
      cost: 90,
      safety: 1,
      hidden_acceptance: 1,
      defect_detection: task.scenario === "review-defect" ? 1 : 0,
      false_positive: 0,
      durable_closure: 1,
      false_completion_claim: false
    })
  ]);
}

function ceilingMetrics(overrides = {}) {
  return {
    completion: 1,
    user_actions: 0,
    recovery: 1,
    evidence: 1,
    wall_ms: 100,
    cost: 100,
    safety: 1,
    hidden_acceptance: 1,
    defect_detection: 1,
    false_positive: 0,
    durable_closure: 1,
    false_completion_claim: false,
    ...overrides
  };
}

function record(task, mode, metrics) {
  return {
    task_id: task.task_id,
    task_digest: task.task_digest || "c".repeat(64),
    repository: task.repository,
    scenario: task.scenario,
    mode,
    candidate_digest: DIGEST,
    attempt: 1,
    metrics: structuredClone(metrics),
    provenance: {
      source_commit: "1234567",
      source_tree: "1".repeat(40),
      source_manifest_sha256: "2".repeat(64),
      runtime_hash: HASH,
      model: "fixture-model",
      provider: "fixture-provider",
      reasoning_effort: "fixture-effort",
      runner_version: "fixture-runner",
      execution_config_fingerprint: HASH,
      environment_fingerprint: "fixture-environment",
      raw_log_refs: [`logs/${task.task_id}-${mode}.jsonl`],
      artifact_refs: [`logs/${task.task_id}-${mode}.jsonl`],
      artifact_hashes: [HASH]
    },
    evidence: {
      tests: "PASS"
    }
  };
}
