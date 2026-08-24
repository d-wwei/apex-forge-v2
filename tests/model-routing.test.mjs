import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultExecutionPolicy,
  defaultRetryPolicy
} from "../src/core/policy-defaults.mjs";
import {
  resolveModelSelection
} from "../src/core/model-routing.mjs";
import { createWorkerForPlanNode, workerDir } from "../src/core/worker.mjs";
import { executeWorkerExecutor } from "../src/core/worker-execution.mjs";
import { buildWorkerSummary } from "../src/core/worker-results.mjs";
import {
  initializeWorkerSandbox,
  retryWorkerInternal
} from "../src/commands/worker.mjs";
import { writeJson } from "../src/lib/common.mjs";

const timestamp = "2026-08-24T00:00:00.000Z";

test("model routing maps agent tiers to Codex models and keeps deterministic nodes model-free", () => {
  const policy = defaultExecutionPolicy(timestamp);

  assert.deepEqual(
    resolveModelSelection({
      planNode: { execution_class: "workspace_patch", model_tier: "cheap" },
      executionPolicy: policy,
      adapter: "codex"
    }),
    {
      initial_model_tier: "cheap",
      model_tier: "cheap",
      model_id: "gpt-5.6-luna",
      model_reason: ["plan_node=cheap"],
      retry_action: "initial"
    }
  );

  const standard = resolveModelSelection({
    planNode: { execution_class: "cognitive" },
    executionPolicy: policy,
    adapter: "codex"
  });
  assert.equal(standard.model_tier, "standard");
  assert.equal(standard.model_id, "gpt-5.6-terra");

  const deterministic = resolveModelSelection({
    planNode: { execution_class: "deterministic_check" },
    executionPolicy: policy,
    adapter: "shell"
  });
  assert.equal(deterministic.model_tier, "deterministic");
  assert.equal(deterministic.model_id, null);
});

test("CLI model override can raise but cannot lower the node minimum tier", () => {
  const policy = defaultExecutionPolicy(timestamp);
  assert.throws(() => resolveModelSelection({
    planNode: { execution_class: "workspace_patch", model_tier: "strong" },
    executionPolicy: policy,
    adapter: "codex",
    requestedModel: "gpt-5.6-luna"
  }), /不能降低节点最低模型档位/);

  const raised = resolveModelSelection({
    planNode: { execution_class: "workspace_patch", model_tier: "cheap" },
    executionPolicy: policy,
    adapter: "codex",
    requestedModel: "gpt-5.6-sol"
  });
  assert.equal(raised.model_tier, "strong");
  assert.equal(raised.model_id, "gpt-5.6-sol");

  assert.throws(() => resolveModelSelection({
    planNode: { execution_class: "workspace_patch", model_tier: "standard" },
    executionPolicy: policy,
    adapter: "codex",
    requestedModel: "unclassified-model"
  }), /无法判定.*模型档位/);
});

test("failure history applies the registered retry and escalation rules", () => {
  const policy = defaultExecutionPolicy(timestamp);
  const base = {
    planNode: { execution_class: "workspace_patch", model_tier: "cheap" },
    executionPolicy: policy,
    adapter: "codex",
    worker: {
      initial_model_tier: "cheap",
      model_tier: "cheap",
      model_id: "gpt-5.6-luna"
    }
  };

  const immediate = resolveModelSelection({
    ...base,
    priorResults: [failed("agent_reported_failure", "cheap")]
  });
  assert.equal(immediate.model_tier, "standard");
  assert.equal(immediate.retry_action, "escalate");

  const firstContractFailure = resolveModelSelection({
    ...base,
    priorResults: [failed("contract_error", "cheap")]
  });
  assert.equal(firstContractFailure.model_tier, "cheap");
  assert.equal(firstContractFailure.retry_action, "same_tier_retry");

  const secondContractFailure = resolveModelSelection({
    ...base,
    priorResults: [
      failed("contract_error", "cheap"),
      failed("timeout", "cheap")
    ]
  });
  assert.equal(secondContractFailure.model_tier, "standard");
  assert.equal(secondContractFailure.retry_action, "escalate");

  const adapterFailure = resolveModelSelection({
    ...base,
    priorResults: [failed("execution_error", "cheap")]
  });
  assert.equal(adapterFailure.model_tier, "cheap");
  assert.equal(adapterFailure.retry_action, "adapter_fallback");

  const blocked = resolveModelSelection({
    ...base,
    priorResults: [failed("scope_violation", "cheap")]
  });
  assert.equal(blocked.model_tier, "cheap");
  assert.equal(blocked.retry_action, "blocked");
});

test("worker summary preserves the actual tier and model for every attempt", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-model-summary-"));
  const root = join(project, ".apex-v2");
  const worker = {
    worker_id: "worker-model",
    run_id: "run-model",
    plan_node_id: "delivery-implementation",
    status: "blocked",
    initial_model_tier: "cheap",
    model_tier: "standard",
    model_id: "gpt-5.6-terra"
  };
  const dir = join(root, "runs", worker.run_id, "workers", worker.worker_id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "adapter-result-1.json"), adapterResult({
    result_id: "adapter-1",
    model_tier: "cheap",
    requested_model: "gpt-5.6-luna",
    failure_kind: "no_patch",
    created_at: "2026-08-24T00:00:01.000Z"
  }));
  writeJson(join(dir, "adapter-result-2.json"), adapterResult({
    result_id: "adapter-2",
    model_tier: "standard",
    requested_model: "gpt-5.6-terra",
    failure_kind: "contract_error",
    created_at: "2026-08-24T00:00:02.000Z"
  }));

  const summary = buildWorkerSummary(root, worker);
  assert.equal(summary.initial_model_tier, "cheap");
  assert.equal(summary.final_model_tier, "standard");
  assert.equal(summary.final_model_id, "gpt-5.6-terra");
  assert.deepEqual(summary.models, ["gpt-5.6-luna", "gpt-5.6-terra"]);
  assert.deepEqual(
    summary.attempts.map((attempt) => [
      attempt.model_tier,
      attempt.requested_model
    ]),
    [
      ["cheap", "gpt-5.6-luna"],
      ["standard", "gpt-5.6-terra"]
    ]
  );
});

test("explicit node tier persists through Worker, Route, AdapterResult, and Summary", () => {
  const { project, root, run, planNode } = modelExecutionFixture();
  const created = createWorkerForPlanNode(root, run, planNode);
  assert.equal(created.initial_model_tier, "cheap");
  assert.equal(created.model_tier, "cheap");
  assert.equal(created.model_id, "gpt-5.6-luna");

  const executable = fakeCodex(project, {
    name: "cheap",
    expectedModel: "gpt-5.6-luna"
  });
  const initialized = initializeWorkerSandbox(root, created, "scratch").worker;
  const result = executeWorkerExecutor(root, initialized, planNode, {
    adapter: "codex",
    command: executable,
    timeoutMs: 10000
  });
  assert.equal(
    result.adapterResult.status,
    "PASS",
    JSON.stringify(result.adapterResult, null, 2)
  );
  assert.equal(result.adapterResult.model_tier, "cheap");
  assert.equal(result.adapterResult.requested_model, "gpt-5.6-luna");

  const dir = workerDir(root, run.run_id, created.worker_id);
  const persistedWorker = JSON.parse(readFileSync(join(dir, "worker.json"), "utf8"));
  const persistedRoute = JSON.parse(readFileSync(join(dir, "execution-route.json"), "utf8"));
  assert.equal(persistedWorker.model_tier, "cheap");
  assert.equal(persistedWorker.model_id, "gpt-5.6-luna");
  assert.equal(persistedRoute.model_tier, "cheap");
  assert.equal(persistedRoute.model_id, "gpt-5.6-luna");

  const summary = buildWorkerSummary(root, persistedWorker);
  assert.equal(summary.final_model_tier, "cheap");
  assert.equal(summary.final_model_id, "gpt-5.6-luna");
  assert.deepEqual(summary.models, ["gpt-5.6-luna"]);
});

test("no_patch retry advances the persisted worker from standard to strong", () => {
  const { project, root, run, planNode } = modelExecutionFixture({
    modelTier: "standard"
  });
  const noPatch = fakeCodex(project, {
    name: "no-patch",
    expectedModel: "gpt-5.6-terra",
    noPatch: true
  });
  const completed = fakeCodex(project, {
    name: "strong",
    expectedModel: "gpt-5.6-sol"
  });
  const created = createWorkerForPlanNode(root, run, planNode);
  let active = initializeWorkerSandbox(root, created, "scratch").worker;
  const failed = executeWorkerExecutor(root, active, planNode, {
    adapter: "codex",
    command: noPatch,
    timeoutMs: 10000
  });
  assert.equal(failed.adapterResult.failure_kind, "no_patch");
  assert.equal(failed.adapterResult.model_tier, "standard");

  const blocked = JSON.parse(readFileSync(
    join(workerDir(root, run.run_id, created.worker_id), "worker.json"),
    "utf8"
  ));
  const retried = retryWorkerInternal(root, blocked, "test");
  assert.equal(retried.worker.status, "active");
  active = initializeWorkerSandbox(root, retried.worker, "scratch").worker;
  const succeeded = executeWorkerExecutor(root, active, planNode, {
    adapter: "codex",
    command: completed,
    timeoutMs: 10000
  });

  assert.equal(succeeded.adapterResult.status, "PASS");
  assert.equal(succeeded.adapterResult.model_tier, "strong");
  assert.equal(succeeded.adapterResult.requested_model, "gpt-5.6-sol");
  const persisted = JSON.parse(readFileSync(
    join(workerDir(root, run.run_id, created.worker_id), "worker.json"),
    "utf8"
  ));
  assert.equal(persisted.model_tier, "strong");
  assert.equal(persisted.model_id, "gpt-5.6-sol");
});

test("delegated cognitive worker requires and persists typed semantic evidence", () => {
  const { project, root, run } = modelExecutionFixture();
  const planNode = {
    id: "delivery-context",
    execution_class: "cognitive",
    preferred_mode: "interactive",
    delegation: {
      eligible: true,
      default: true,
      parallel: true,
      main_agent_required: false
    },
    model_tier: "cheap",
    method_pack_id: "governed",
    risk: "medium",
    objective: "Identify the bounded implementation context.",
    deliverables: ["context evidence"],
    required_evidence: ["source refs"],
    capability_bindings: [],
    capability_enforcement: "shadow",
    read_scope: ["src/value.mjs"],
    write_scope: [".apex-v2/runs/run-model/workers/context/"],
    verification: ["node --check src/value.mjs"],
    output_contract: "evidence"
  };
  const created = createWorkerForPlanNode(root, run, planNode);
  assert.equal(created.preferred_mode, "factory");
  const executable = fakeCognitiveCodex(project, {
    expectedModel: "gpt-5.6-luna",
    objective: planNode.objective
  });
  const initialized = initializeWorkerSandbox(root, created, "scratch").worker;
  const result = executeWorkerExecutor(root, initialized, planNode, {
    adapter: "codex",
    command: executable,
    timeoutMs: 10000
  });
  assert.equal(
    result.adapterResult.status,
    "PASS",
    JSON.stringify(result.adapterResult, null, 2)
  );
  assert.equal(
    existsSync(join(
      workerDir(root, run.run_id, created.worker_id),
      "cognitive-evidence.json"
    )),
    true
  );
});

function failed(failureKind, modelTier) {
  return {
    status: "FAIL",
    failure_kind: failureKind,
    model_tier: modelTier
  };
}

function adapterResult(overrides) {
  return {
    schema_version: "v0",
    result_id: overrides.result_id,
    worker_id: "worker-model",
    run_id: "run-model",
    plan_node_id: "delivery-implementation",
    adapter: "codex",
    status: "FAIL",
    failure_kind: overrides.failure_kind,
    model_tier: overrides.model_tier,
    requested_model: overrides.requested_model,
    reported_model: overrides.requested_model,
    summary: overrides.failure_kind,
    created_at: overrides.created_at
  };
}

function modelExecutionFixture(options = {}) {
  const project = mkdtempSync(join(tmpdir(), "apex-model-execution-"));
  const root = join(project, ".apex-v2");
  const run = {
    schema_version: "v0",
    run_id: "run-model",
    roadmap_node_id: "roadmap-model",
    status: "active",
    context_snapshot: {
      knowledge_version: 0,
      files: []
    },
    nodes: [{
      id: "execute",
      status: "active",
      started_at: timestamp,
      completed_at: null,
      gate: null,
      evidence_refs: []
    }],
    gate: {
      status: "ESCALATE",
      reason: "fixture",
      blocking: []
    },
    created_at: timestamp,
    updated_at: timestamp
  };
  const planNode = {
    id: "delivery-implementation",
    execution_class: "workspace_patch",
    preferred_mode: "factory",
    adapter: "codex",
    model_tier: options.modelTier || "cheap",
    method_pack_id: "quick",
    risk: "low",
    objective: "Update the fixture source.",
    deliverables: ["src/demo.mjs"],
    required_evidence: [],
    capability_bindings: [],
    capability_enforcement: "shadow",
    read_scope: ["src/"],
    write_scope: ["src/"],
    verification: ["node --check src/demo.mjs"],
    output_contract: "patch"
  };

  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(root, "runs", run.run_id), { recursive: true });
  mkdirSync(join(root, "policies"), { recursive: true });
  writeFileSync(join(project, "src", "demo.mjs"), "export const value = 1;\n");
  writeJson(join(root, "project.json"), {
    schema_version: "v0",
    format_version: 1,
    revision: 0,
    project_id: "project-model",
    project_name: "Model routing fixture",
    created_at: timestamp,
    updated_at: timestamp,
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [run.run_id],
    wip_limits: {
      active_runs: 1,
      parallel_workers: 1
    }
  });
  writeJson(join(root, "policies", "execution.json"), defaultExecutionPolicy(timestamp));
  writeJson(join(root, "policies", "retry.json"), defaultRetryPolicy(timestamp));
  writeJson(join(root, "runs", run.run_id, "run.json"), run);
  return { project, root, run, planNode };
}

function fakeCodex(project, options = {}) {
  const path = join(project, `fake-codex-model-${options.name || "default"}.mjs`);
  writeFileSync(path, `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.argv.includes("--version")) {
  console.log("fake-codex 1.0.0");
  process.exit(0);
}
const workspace = process.argv[process.argv.indexOf("-C") + 1];
const output = process.argv[process.argv.indexOf("-o") + 1];
const model = process.argv[process.argv.indexOf("-m") + 1];
if (model !== ${JSON.stringify(options.expectedModel || "gpt-5.6-luna")}) process.exit(9);
readFileSync(0, "utf8");
const target = join(workspace, "src", "demo.mjs");
mkdirSync(dirname(target), { recursive: true });
${options.noPatch ? "" : 'writeFileSync(target, "export const value = 2;\\\\n");'}
writeFileSync(output, JSON.stringify({
  verdict: "pass",
  summary: "updated fixture",
  tests: [],
  risks: [],
  evidence_refs: []
}));
`);
  chmodSync(path, 0o755);
  return path;
}

function fakeCognitiveCodex(project, options) {
  const path = join(project, `fake-cognitive-model-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(path, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

if (process.argv.includes("--version")) {
  console.log("fake-codex 1.0.0");
  process.exit(0);
}
const output = process.argv[process.argv.indexOf("-o") + 1];
const model = process.argv[process.argv.indexOf("-m") + 1];
if (model !== ${JSON.stringify(options.expectedModel)}) process.exit(9);
readFileSync(0, "utf8");
writeFileSync(output, JSON.stringify({
  verdict: "pass",
  summary: "context collected",
  tests: [],
  risks: [],
  evidence_refs: ["src/value.mjs"],
  semantic_evidence: {
    schema_version: "v0",
    evidence_type: "context",
    objective: ${JSON.stringify(options.objective)},
    source_refs: ["src/value.mjs"],
    claims: ["The implementation scope is limited to src/value.mjs."],
    uncertainties: [],
    acceptance_mapping: [{
      criterion: "Identify the bounded implementation context.",
      evidence_ref: "src/value.mjs",
      status: "supported"
    }],
    affected_files: ["src/value.mjs"],
    constraints: ["write scope is bounded"],
    unknowns: [],
    created_at: "2026-08-24T00:00:00.000Z"
  }
}));
`);
  chmodSync(path, 0o755);
  return path;
}
