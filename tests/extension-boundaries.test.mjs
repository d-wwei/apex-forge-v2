import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assertHostAdapter
} from "../src/contracts/host-adapter.mjs";
import {
  createWorkerExecutorRegistry
} from "../src/executors/registry.mjs";
import {
  normalizeExecutionCapabilities
} from "../src/contracts/execution-capability.mjs";
import { validateContract } from "../src/core/contracts.mjs";
import { resolveWorkerAssignment } from "../src/core/worker.mjs";

test("HostAdapter contract accepts a platform-native host without owning Kernel state", () => {
  const adapter = assertHostAdapter({
    id: "codex-host",
    describeHost: () => ({ id: "codex-host", capabilities: ["interactive"] }),
    openProject: () => ({}),
    claimAction: () => ({}),
    submitArtifact: () => ({}),
    requestApproval: () => ({}),
    reportProgress: () => ({}),
    cancelAction: () => ({})
  });

  assert.equal(adapter.id, "codex-host");
  assert.equal("projectState" in adapter, false);
});

test("WorkerExecutor registry resolves arbitrary providers by capability", () => {
  const registry = createWorkerExecutorRegistry([
    {
      id: "deepseek-runner",
      inspect: () => ({
        available: true,
        version: "fixture",
        capabilities: ["workspace_write", "structured_output", "tool_use"]
      }),
      execute: () => ({ exit_code: 0 }),
      resume: () => ({ exit_code: 0 }),
      cancel: () => ({ cancelled: true }),
      collectUsage: () => ({})
    },
    {
      id: "read-only-runner",
      inspect: () => ({
        available: true,
        version: "fixture",
        capabilities: ["structured_output"]
      }),
      execute: () => ({ exit_code: 0 }),
      resume: () => ({ exit_code: 0 }),
      cancel: () => ({ cancelled: true }),
      collectUsage: () => ({})
    }
  ]);

  const resolved = registry.resolve({
    preferred: "read-only-runner",
    fallbackOrder: ["deepseek-runner"],
    allowed: ["read-only-runner", "deepseek-runner"],
    requiredCapabilities: ["workspace_write", "structured_output"]
  });

  assert.equal(resolved.id, "deepseek-runner");
  assert.equal(resolved.fallback, true);
  assert.deepEqual(
    normalizeExecutionCapabilities(["tool_use", "workspace_write", "tool_use"]),
    ["tool_use", "workspace_write"]
  );
});

test("worker and execution policy contracts accept non-enumerated executor ids", () => {
  const worker = {
    schema_version: "v0",
    worker_id: "worker-1",
    run_id: "run-1",
    plan_node_id: "node-1",
    status: "active",
    namespace: ".apex-v2/runs/run-1/workers/worker-1",
    adapter: "deepseek-runner",
    executor_id: "deepseek-runner",
    required_capabilities: ["structured_output", "workspace_write"],
    output_contract: "patch",
    objective: "implement change",
    deliverables: [],
    required_evidence: [],
    sandbox: { type: "none", path: "", status: "missing" },
    read_scope: ["src/"],
    write_scope: ["src/"],
    verification: ["npm test"],
    attempt: 0,
    last_adapter: null,
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z"
  };
  const policy = {
    schema_version: "v0",
    updated_at: "2026-08-14T00:00:00.000Z",
    budgets: {
      max_changed_files_per_patch: 20,
      max_patch_bytes: 1000000,
      max_agent_duration_ms: 1200000,
      max_agent_runs_per_tick: 3
    },
    permissions: {
      allowed_adapters: ["shell", "human", "deepseek-runner"],
      adapter_fallback_order: ["deepseek-runner"],
      adapter_fallback_failure_kinds: ["timeout"],
      merge_approval_risks: ["critical"],
      sensitive_paths: [".github/"]
    },
    approval: {
      ttl_minutes: 60,
      required_capabilities: {
        merge: "merge_apply",
        adapter_baseline: "adapter_baseline_update"
      }
    }
  };

  assert.equal(validateContract("worker-run.schema.json", worker).valid, true);
  assert.equal(validateContract("execution-policy.schema.json", policy).valid, true);
});

test("host and executor envelope schemas define the cross-platform bridge", () => {
  const hostAction = {
    schema_version: "v0",
    action_id: "action-1",
    host_id: "codex-host",
    project_id: "project-1",
    kind: "action_claim",
    payload: { run_id: "run-1" },
    created_at: "2026-08-14T00:00:00.000Z"
  };
  const hostResult = {
    schema_version: "v0",
    action_id: "action-1",
    host_id: "codex-host",
    status: "completed",
    summary: "claimed",
    artifact_refs: [],
    created_at: "2026-08-14T00:00:00.000Z"
  };
  const capability = {
    schema_version: "v0",
    executor_id: "deepseek-runner",
    available: true,
    version: "fixture",
    capabilities: ["structured_output", "tool_use"]
  };

  assert.equal(validateContract("host-action.schema.json", hostAction).valid, true);
  assert.equal(validateContract("host-result.schema.json", hostResult).valid, true);
  assert.equal(validateContract("executor-capability.schema.json", capability).valid, true);
});

test("provider-specific executors do not leak direct imports into src/core", () => {
  const coreDir = new URL("../src/core/", import.meta.url).pathname;
  const coreSources = readdirSync(coreDir)
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => ({ name, source: readFileSync(join(coreDir, name), "utf8") }));
  const offenders = coreSources
    .filter(({ source }) => /from\s+["']\.\.\/(?:adapters|executors)\/(?:codex|claude|gemini)/.test(source))
    .map(({ name }) => name);
  const providerMentions = coreSources.reduce(
    (count, { source }) => count + (source.match(/\b(?:codex|claude|gemini|deepseek)\b/gi) || []).length,
    0
  );

  assert.deepEqual(offenders, []);
  assert.ok(providerMentions <= 3, `src/core provider mentions=${providerMentions}`);
});

test("PlanGraph requests capabilities and worker assignment follows policy order", () => {
  const planSource = readFileSync(
    new URL("../src/core/plan-graph.mjs", import.meta.url),
    "utf8"
  );
  assert.equal(/adapter:\s*"codex"/.test(planSource), false);

  const assignment = resolveWorkerAssignment({
    execution_class: "workspace_patch",
    required_capabilities: ["structured_output", "workspace_write"],
    preferred_mode: "factory"
  }, {
    permissions: {
      allowed_adapters: ["shell", "human", "deepseek-runner"],
      adapter_fallback_order: ["deepseek-runner"]
    }
  });

  assert.deepEqual(assignment, {
    adapter: "deepseek-runner",
    executor_id: "deepseek-runner",
    execution_class: "workspace_patch",
    preferred_mode: "factory",
    required_capabilities: ["structured_output", "workspace_write"]
  });
});
