import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  claimWorkerExecution,
  recoverExpiredWorkerExecutions
} from "../src/core/worker.mjs";

const CLI = new URL("../src/apex-v2.mjs", import.meta.url).pathname;

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    ...options
  });
  assert.equal(
    result.status,
    0,
    `command failed: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`
  );
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function createGovernedProject() {
  const project = mkdtempSync(join(tmpdir(), "apex-scheduler-"));
  writeFileSync(join(project, "package.json"), `${JSON.stringify({
    name: "scheduler-fixture",
    version: "0.0.0",
    type: "module",
    scripts: {
      test: "node --test tests/*.test.mjs"
    }
  }, null, 2)}\n`);
  writeFileSync(join(project, "index.mjs"), "export const value = 1;\n");
  run(["init", "--project", project, "--name", "Scheduler Fixture"]);
  const intake = JSON.parse(run([
    "intake", "add", "--project", project,
    "--title", "Parallel context and risk analysis",
    "--area", "index.mjs",
    "--risk", "high",
    "--method-pack", "governed"
  ]).stdout);
  run([
    "intake", "triage", "--project", project,
    "--id", intake.id, "--decision", "accepted"
  ]);
  const tick = JSON.parse(run([
    "project", "tick", "--project", project, "--advance"
  ]).stdout);
  return {
    project,
    root: join(project, ".apex-v2"),
    runId: tick.created_runs[0].run_id
  };
}

function createFakeCognitiveAgent(project, options = {}) {
  const timeline = join(
    "/private/tmp",
    `apex-agent-timeline-${process.pid}-${Math.random().toString(36).slice(2)}.ndjson`
  );
  const executable = join(project, "fake-cognitive-agent.mjs");
  writeFileSync(executable, `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

if (process.argv.includes("--version")) {
  console.log("fake-cognitive-agent 1.0.0");
  process.exit(0);
}

const args = process.argv.slice(2);
const output = args[args.indexOf("-o") + 1];
const prompt = readFileSync(0, "utf8");
const type = prompt.match(/evidence_type:\\s*(context|risk|design|review)/)?.[1];
const objective = prompt.match(/## Objective\\s+([\\s\\S]*?)\\n\\n##/)?.[1]?.trim();
appendFileSync(${JSON.stringify(timeline)}, JSON.stringify({
  event: "start",
  type,
  at: Date.now(),
  pid: process.pid
}) + "\\n");
await new Promise((resolve) => setTimeout(resolve, ${Number(options.sleepMs || 1200)}));
if (type === ${JSON.stringify(options.failType || "")}) {
  appendFileSync(${JSON.stringify(timeline)}, JSON.stringify({
    event: "end",
    type,
    at: Date.now(),
    pid: process.pid,
    status: "fail"
  }) + "\\n");
  console.error("simulated cognitive failure");
  process.exit(7);
}
const common = {
  schema_version: "v0",
  evidence_type: type,
  objective,
  source_refs: ["index.mjs"],
  claims: [type + " inspected the fixture source and produced bounded evidence"],
  uncertainties: [],
  acceptance_mapping: [{
    criterion: "typed evidence",
    evidence_ref: "index.mjs",
    status: "supported"
  }],
  created_at: new Date().toISOString()
};
const semantic_evidence = type === "context"
  ? { ...common, affected_files: ["index.mjs"], constraints: [], unknowns: [] }
  : {
      ...common,
      failure_paths: ["fixture failure path"],
      blast_radius: ["index.mjs"],
      mitigations: ["bounded change"],
      rollback: ["revert candidate"]
    };
writeFileSync(output, JSON.stringify({
  verdict: "pass",
  summary: type + " evidence complete",
  tests: [],
  risks: [],
  evidence_refs: ["index.mjs"],
  semantic_evidence
}));
appendFileSync(${JSON.stringify(timeline)}, JSON.stringify({
  event: "end",
  type,
  at: Date.now(),
  pid: process.pid,
  status: "pass"
}) + "\\n");
`);
  chmodSync(executable, 0o755);
  return { executable, timeline };
}

test("project agent scheduler overlaps default Luna context and risk workers", () => {
  const { project, root, runId } = createGovernedProject();
  const fake = createFakeCognitiveAgent(project, { sleepMs: 1200 });
  const startedAt = Date.now();
  const tick = JSON.parse(run([
    "project", "tick", "--project", project,
    "--run-agents", "--agent-limit", "2", "--agent-cycles", "4",
    "--agent-sandbox", "scratch",
    "--agent-command", fake.executable,
    "--agent-timeout-ms", "10000"
  ]).stdout);
  const wallTimeMs = Date.now() - startedAt;

  const firstWave = tick.agent_runs.filter((item) =>
    ["delivery-context", "delivery-risk"].includes(item.plan_node_id)
  );
  assert.equal(firstWave.length, 2);
  assert.ok(firstWave.every((item) => item.status === "PASS"));
  const timeline = readFileSync(fake.timeline, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const starts = timeline.filter((item) => item.event === "start");
  const ends = timeline.filter((item) => item.event === "end");
  assert.equal(starts.length, 2);
  assert.equal(ends.length, 2);
  assert.ok(
    Math.max(...starts.map((item) => item.at))
      < Math.min(...ends.map((item) => item.at)),
    `workers did not overlap: ${JSON.stringify(timeline)}`
  );
  assert.ok(wallTimeMs < 15000, `scheduler wall time too high: ${wallTimeMs}ms`);
  assert.equal(tick.agent_scheduler.stop_reason, "waiting-for-coordinator");

  const workersDir = join(root, "runs", runId, "workers");
  const workers = readdirSync(workersDir).map((workerId) =>
    readJson(join(workersDir, workerId, "worker.json"))
  );
  const completed = workers.filter((worker) =>
    ["delivery-context", "delivery-risk"].includes(worker.plan_node_id)
  );
  assert.ok(completed.every((worker) => worker.status === "evidence_submitted"));
  assert.ok(completed.every((worker) => worker.model_tier === "cheap"));
  assert.ok(completed.every((worker) => worker.model_id === "gpt-5.6-luna"));
  assert.ok(completed.every((worker) => worker.execution_fencing_token === 1));
  assert.ok(completed.every((worker) => worker.execution_claim_token === null));
  const design = workers.find((worker) =>
    worker.plan_node_id === "delivery-design"
  );
  assert.equal(design.adapter, "host");
  assert.equal(design.status, "active");
});

test("one project agent failure does not cancel its sibling", () => {
  const { project, root, runId } = createGovernedProject();
  const fake = createFakeCognitiveAgent(project, {
    sleepMs: 700,
    failType: "risk"
  });
  const tick = JSON.parse(run([
    "project", "tick", "--project", project,
    "--run-agents", "--agent-limit", "2", "--agent-cycles", "1",
    "--agent-sandbox", "scratch",
    "--agent-command", fake.executable,
    "--agent-timeout-ms", "10000"
  ]).stdout);

  const byNode = new Map(tick.agent_runs.map((item) => [
    item.plan_node_id,
    item
  ]));
  assert.equal(byNode.get("delivery-context").status, "PASS");
  assert.equal(byNode.get("delivery-risk").status, "FAIL");
  const workersDir = join(root, "runs", runId, "workers");
  const workers = tick.dispatched_workers.map((item) =>
    readJson(join(workersDir, item.worker_id, "worker.json"))
  );
  assert.equal(
    workers.find((worker) => worker.plan_node_id === "delivery-context").status,
    "evidence_submitted"
  );
  assert.equal(
    workers.find((worker) => worker.plan_node_id === "delivery-risk").status,
    "blocked"
  );
});

test("terminal blocked worker halts the run after retry and fallback are exhausted", () => {
  const { project, root, runId } = createGovernedProject();
  const executionPath = join(root, "policies", "execution.json");
  const execution = readJson(executionPath);
  execution.budgets.max_agent_runs_per_tick = 2;
  execution.permissions.allowed_adapters = ["host", "shell", "human", "codex"];
  execution.permissions.adapter_fallback_order = ["codex"];
  writeFileSync(executionPath, `${JSON.stringify(execution, null, 2)}\n`);
  const retryPath = join(root, "policies", "retry.json");
  const retry = readJson(retryPath);
  retry.max_attempts.codex = 1;
  writeFileSync(retryPath, `${JSON.stringify(retry, null, 2)}\n`);

  const fake = createFakeCognitiveAgent(project, {
    sleepMs: 50,
    failType: "risk"
  });
  const tick = JSON.parse(run([
    "project", "tick", "--project", project,
    "--run-agents", "--agent-limit", "2", "--agent-cycles", "4",
    "--agent-sandbox", "scratch",
    "--agent-command", fake.executable,
    "--agent-timeout-ms", "10000"
  ]).stdout);

  assert.equal(tick.agent_scheduler.stop_reason, "terminal-failure");
  assert.deepEqual(
    tick.agent_scheduler.terminalized_runs.map((item) => item.run_id),
    [runId]
  );
  const runState = readJson(join(root, "runs", runId, "run.json"));
  assert.equal(runState.status, "halted");
  assert.equal(
    runState.nodes.find((node) => node.id === "execute").status,
    "halted"
  );
  assert.equal(readJson(join(root, "project.json")).active_runs.includes(runId), false);
});

test("worker execution claim is exclusive and an expired lease is recoverable", () => {
  const { project, root, runId } = createGovernedProject();
  const worker = JSON.parse(run([
    "worker", "create", "--project", project,
    "--run-id", runId,
    "--plan-node-id", "delivery-context"
  ]).stdout);

  const first = claimWorkerExecution(root, worker.worker_id, 60000, "test");
  assert.equal(first.claimed, true);
  const duplicate = claimWorkerExecution(root, worker.worker_id, 60000, "test");
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.reason, "already-running");

  const workerPath = join(
    root,
    "runs",
    runId,
    "workers",
    worker.worker_id,
    "worker.json"
  );
  const expired = readJson(workerPath);
  expired.execution_claim_expires_at = "2000-01-01T00:00:00.000Z";
  writeFileSync(workerPath, `${JSON.stringify(expired, null, 2)}\n`);
  const recovered = recoverExpiredWorkerExecutions(root, [runId], "test");
  assert.equal(recovered.length, 1);
  assert.equal(readJson(workerPath).status, "active");

  const reclaimed = claimWorkerExecution(root, worker.worker_id, 60000, "test");
  assert.equal(reclaimed.claimed, true);
  assert.ok(
    reclaimed.worker.execution_fencing_token
      > first.worker.execution_fencing_token
  );
});
