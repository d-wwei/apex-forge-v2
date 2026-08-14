import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertSafeRelativePath,
  bullet,
  countOccurrences,
  dirnameForPath,
  ensureDir,
  now,
  readJson,
  shortId,
  tail,
  writeJson,
  writeTextIfMissing
} from "../lib/common.mjs";
import { appendEvent, SCHEMA_VERSION, updateProject } from "./store.mjs";
import { createArtifact } from "./artifacts.mjs";
import { loadRun } from "./run-state.mjs";

export function createWorkerForPlanNode(root, run, planNode) {
  const timestamp = now();
  const workerId = shortId("worker");
  const namespace = `.apex-v2/runs/${run.run_id}/workers/${workerId}`;
  const worker = {
    schema_version: SCHEMA_VERSION,
    worker_id: workerId,
    run_id: run.run_id,
    plan_node_id: planNode.id,
    status: "active",
    namespace,
    sandbox: {
      type: "none",
      path: "",
      status: "missing"
    },
    adapter: planNode.adapter || "shell",
    output_contract: planNode.output_contract || "evidence",
    objective: planNode.objective,
    deliverables: planNode.deliverables,
    required_evidence: planNode.required_evidence,
    read_scope: planNode.read_scope,
    write_scope: planNode.write_scope,
    verification: planNode.verification,
    attempt: 0,
    last_adapter: null,
    created_at: timestamp,
    updated_at: timestamp
  };

  const dir = workerDir(root, run.run_id, workerId);
  ensureDir(dir);
  writeJson(join(dir, "worker.json"), worker);
  writeTextIfMissing(join(dir, "README.md"), workerReadme(worker, planNode));
  const event = appendEvent(root, "worker.created", "apex-v2", {
    run_id: run.run_id,
    worker_id: workerId,
    plan_node_id: planNode.id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return worker;
}

export function getWorkers(root, runId) {
  const dir = join(root, "runs", runId, "workers");
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readJson(join(dir, entry.name, "worker.json"), null))
    .filter(Boolean);
}

export function workerDir(root, runId, workerId) {
  return join(root, "runs", runId, "workers", workerId);
}

export function workerReadme(worker, planNode) {
  return `# Worker Run

worker_id: ${worker.worker_id}
plan_node_id: ${worker.plan_node_id}
status: ${worker.status}

## Objective

${planNode.objective}

## Write Scope

${bullet(worker.write_scope)}

## Required Evidence

${bullet(planNode.required_evidence)}

## Verification

${bullet(worker.verification)}
`;
}

export function findWorker(root, workerId) {
  const runsDir = join(root, "runs");
  for (const runEntry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    const path = join(runsDir, runEntry.name, "workers", workerId, "worker.json");
    const worker = readJson(path, null);
    if (worker) return worker;
  }
  throw new Error(`找不到 worker：${workerId}`);
}

export function findPatch(root, runId, patchId) {
  return findPatchWithPath(root, runId, patchId).patch;
}

export function findPatchWithPath(root, runId, patchId) {
  const workersDir = join(root, "runs", runId, "workers");
  if (!existsSync(workersDir)) throw new Error(`run 尚无 workers：${runId}`);
  for (const workerEntry of readdirSync(workersDir, { withFileTypes: true })) {
    if (!workerEntry.isDirectory()) continue;
    const path = join(workersDir, workerEntry.name, "patch-bundle.json");
    const patch = readJson(path, null);
    if (patch?.patch_id === patchId) return { patch, path };
  }
  throw new Error(`找不到 patch：${patchId}`);
}

export function isFileAllowedByScope(file, scopes) {
  return scopes.some((scope) => {
    if (scope === file) return true;
    if (scope.endsWith("/") && file.startsWith(scope)) return true;
    if (scope.endsWith("/*")) return file.startsWith(scope.slice(0, -1));
    if (scope.includes("*")) {
      const [prefix, suffix] = scope.split("*");
      return file.startsWith(prefix) && file.endsWith(suffix || "");
    }
    return false;
  });
}

export function applyPatchOperations(projectDir, patch) {
  const applied = [];
  for (const operation of patch.operations || []) {
    assertSafeRelativePath(operation.path);
    const target = join(projectDir, operation.path);
    if (operation.op === "write_text") {
      ensureDir(dirnameForPath(target));
      writeFileSync(target, operation.content);
    } else if (operation.op === "replace_text") {
      if (!existsSync(target)) throw new Error(`replace_text 目标文件不存在：${operation.path}`);
      const current = readFileSync(target, "utf8");
      const count = countOccurrences(current, operation.old_text);
      if (count !== 1) {
        throw new Error(`replace_text 要求 old_text 唯一匹配，${operation.path} 实际匹配 ${count} 次`);
      }
      writeFileSync(target, current.replace(operation.old_text, operation.new_text));
    } else {
      throw new Error(`未知 patch operation：${operation.op}`);
    }
    applied.push(operation.path);
  }
  return applied;
}

export function ensureWorkerSandboxReady(worker) {
  if (!worker.sandbox || worker.sandbox.status !== "ready" || worker.sandbox.type === "none") {
    throw new Error(`worker sandbox 尚未 ready：${worker.worker_id}`);
  }
}

export function findGitRoot(projectDir) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: projectDir,
    encoding: "utf8"
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function executeWorkerShell(root, worker, command, via) {
  const projectDir = join(root, "..");
  const timestamp = now();
  const result = spawnSync(command, {
    cwd: projectDir,
    encoding: "utf8",
    shell: true
  });
  const adapterResult = {
    schema_version: SCHEMA_VERSION,
    result_id: shortId("adapter"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    adapter: "shell",
    status: result.status === 0 ? "PASS" : "FAIL",
    failure_kind: result.status === 0 ? null : "execution_error",
    command,
    summary: result.status === 0 ? "shell command passed" : "shell command failed",
    exit_code: result.status ?? 1,
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
    refs: [],
    created_at: timestamp
  };
  const file = `adapter-result-${adapterResult.result_id}.json`;
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), file), adapterResult);
  worker.status = adapterResult.status === "PASS" ? "evidence_submitted" : "blocked";
  worker.last_adapter = "shell";
  worker.attempt = Number(worker.attempt || 0) + 1;
  worker.updated_at = timestamp;
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const run = loadRun(root, worker.run_id);
  const artifact = createArtifact(root, run, "execute", {
    type: "evidence",
    title: `ShellAdapter：${adapterResult.status}`,
    body: `worker=${worker.worker_id}\ncommand=${command}\nexit_code=${adapterResult.exit_code}`,
    refs: [`${worker.namespace}/${file}`],
    timestamp
  });
  const event = appendEvent(root, "worker.adapter.shell", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    result_id: adapterResult.result_id,
    status: adapterResult.status,
    artifact_id: artifact.artifact_id,
    via
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { adapterResult, artifact };
}
