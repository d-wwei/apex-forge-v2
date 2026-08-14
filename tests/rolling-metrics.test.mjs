import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProjectMetrics } from "../src/core/metrics.mjs";
import { writeJson } from "../src/lib/common.mjs";

function rootFixture() {
  const project = mkdtempSync(join(tmpdir(), "apex-rolling-metrics-"));
  const root = join(project, ".apex-v2");
  mkdirSync(join(root, "runs"), { recursive: true });
  mkdirSync(join(root, "risks"), { recursive: true });
  mkdirSync(join(root, "policies"), { recursive: true });
  writeFileSync(join(root, "events.jsonl"), "");
  writeJson(join(root, "risks", "register.json"), []);
  writeJson(join(root, "policies", "quality.json"), {
    schema_version: "v0",
    updated_at: new Date().toISOString(),
    block_new_runs_on_failure: true,
    block_new_runs_on_smoke_failure: true,
    adapter_smoke_max_age_hours: 24,
    adapter_smoke_auto_refresh: true,
    adapter_smoke_refresh_timeout_ms: 180000,
    rolling_window_days: 7,
    rolling_run_count: 20,
    thresholds: {
      max_open_risks: 0,
      max_verification_failures: 0,
      max_adapter_failure_rate: 0.25,
      max_cycle_regression_percent: 50
    }
  });
  return root;
}

function addRun(root, index, createdAt, adapterStatus) {
  const runId = `run-${index}`;
  const runDir = join(root, "runs", runId);
  const workerDir = join(runDir, "workers", `worker-${index}`);
  mkdirSync(workerDir, { recursive: true });
  writeJson(join(runDir, "run.json"), {
    schema_version: "v0",
    run_id: runId,
    roadmap_node_id: `roadmap-${index}`,
    status: "done",
    created_at: createdAt,
    updated_at: new Date(Date.parse(createdAt) + 1000).toISOString(),
    context_snapshot: {},
    current_node_id: "learn",
    nodes: [],
    carry_forward: []
  });
  writeJson(join(workerDir, `adapter-result-${index}.json`), {
    schema_version: "v0",
    result_id: `adapter-${index}`,
    worker_id: `worker-${index}`,
    run_id: runId,
    plan_node_id: "implementation",
    adapter: "codex",
    adapter_version: "fixture",
    session_id: null,
    executable: "fixture",
    status: adapterStatus,
    failure_kind: adapterStatus === "FAIL" ? "execution_error" : null,
    command: "fixture",
    summary: "fixture",
    exit_code: adapterStatus === "PASS" ? 0 : 1,
    duration_ms: 1,
    stdout_tail: "",
    stderr_tail: "",
    changed_files: [],
    out_of_scope_files: [],
    unsupported_files: [],
    refs: [],
    created_at: createdAt
  });
}

test("rolling window detects recent failure hidden by lifetime history", () => {
  const root = rootFixture();
  const old = "2026-07-01T00:00:00.000Z";
  for (let index = 0; index < 25; index += 1) addRun(root, index, old, "PASS");
  addRun(root, 25, new Date(Date.now() - 2 * 3600000).toISOString(), "FAIL");
  addRun(root, 26, new Date(Date.now() - 3600000).toISOString(), "FAIL");

  const metrics = buildProjectMetrics(root);
  assert.equal(metrics.execution.adapter_pass, 25);
  assert.equal(metrics.execution.adapter_fail, 2);
  assert.equal(metrics.window.execution.adapter_pass, 0);
  assert.equal(metrics.window.execution.adapter_fail, 2);
  assert.equal(metrics.window.execution.adapter_failure_rate, 1);
  assert.equal(metrics.evaluation.status, "FAIL");
  assert.ok(metrics.evaluation.failures.includes("adapter-failure-rate"));
});
