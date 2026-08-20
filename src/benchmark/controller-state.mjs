import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { assertContract } from "../core/contracts.mjs";
import { projectSourceFingerprint } from "../core/candidate.mjs";
import { readJson, writeJson } from "../lib/common.mjs";

export const BENCHMARK_MODES = ["v1-skill", "cli-kernel", "plugin-kernel"];
export const BENCHMARK_LEASE_GRACE_MS = 90 * 60 * 1000;

export function resolveBenchmarkLeaseMs(configuredLeaseMs, timeoutMs) {
  const configured = Number(configuredLeaseMs);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  const timeout = Number(timeoutMs);
  const boundedTimeout = Number.isFinite(timeout) && timeout > 0
    ? Math.floor(timeout)
    : 30 * 60 * 1000;
  return boundedTimeout + BENCHMARK_LEASE_GRACE_MS;
}

export function createBenchmarkControllerState({
  candidateManifest,
  taskValidation,
  workspaceRoot,
  now = new Date().toISOString()
}) {
  const candidateDigest = candidateManifest.release_candidate_digest;
  const controllerId = `benchmark-${candidateDigest.slice(0, 16)}`;
  const runs = taskValidation.tasks.flatMap((task) =>
    BENCHMARK_MODES.map((mode) => {
      const runKey = `${task.task_id}--${mode}`;
      return {
        run_key: runKey,
        task_id: task.task_id,
        task_digest: task.task_digest,
        repository: task.repository,
        scenario: task.scenario,
        mode,
        status: "pending",
        official_attempt: 1,
        process_attempt: 0,
        recovery_count: 0,
        fencing_token: 0,
        lease_id: null,
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        attempt_id: null,
        workspace_path: relative(
          dirname(workspaceRoot),
          join(workspaceRoot, safeName(runKey), "workspace")
        ).split(sep).join("/"),
        controller_pid: null,
        child_pid: null,
        session_id: null,
        started_at: null,
        completed_at: null,
        raw_log_refs: [],
        result_ref: null,
        result_sha256: null,
        failure: null
      };
    })
  );
  const state = {
    schema_version: "v0",
    revision: 0,
    controller_id: controllerId,
    release_candidate_digest: candidateDigest,
    task_set_digest: taskValidation.task_set_digest,
    status: "pending",
    created_at: now,
    updated_at: now,
    runs
  };
  assertContract("benchmark-controller.schema.json", state, "benchmark-controller");
  return state;
}

export function recoverBenchmarkControllerState(
  state,
  {
    now = new Date().toISOString(),
    isPidAlive = defaultIsPidAlive
  } = {}
) {
  let recovered = 0;
  const nowMs = Date.parse(now);
  for (const run of state.runs) {
    if (run.status !== "running") continue;
    const controllerAlive = isPidAlive(run.controller_pid);
    const childAlive = isPidAlive(run.child_pid);
    const leaseExpired = Number.isFinite(Date.parse(run.lease_expires_at))
      && Date.parse(run.lease_expires_at) <= nowMs;
    if (!leaseExpired && (controllerAlive || childAlive)) continue;
    run.status = "interrupted";
    run.controller_pid = null;
    run.child_pid = null;
    run.recovery_count += 1;
    run.failure = leaseExpired
      ? "benchmark lease expired before durable completion"
      : "controller/process disappeared before durable completion";
    clearRunLease(run);
    recovered += 1;
  }
  if (recovered > 0) {
    state.status = "pending";
    state.updated_at = now;
  }
  return { state, recovered };
}

export function claimBenchmarkRun(
  state,
  {
    runKey,
    controllerPid = process.pid,
    leaseId = randomUUID(),
    leaseOwner = `controller:${controllerPid}`,
    leaseMs = 40 * 60 * 1000,
    attemptId = randomUUID(),
    now = new Date().toISOString()
  }
) {
  const run = state.runs.find((item) => item.run_key === runKey);
  if (!run) throw new Error(`benchmark run not found: ${runKey}`);
  if (!["pending", "interrupted"].includes(run.status)) {
    throw new Error(`benchmark run cannot be claimed from ${run.status}: ${runKey}`);
  }
  run.status = "running";
  run.controller_pid = controllerPid;
  run.child_pid = null;
  run.process_attempt += 1;
  run.fencing_token = Number(run.fencing_token || 0) + 1;
  run.lease_id = leaseId;
  run.lease_owner = leaseOwner;
  run.lease_expires_at = new Date(Date.parse(now) + leaseMs).toISOString();
  run.heartbeat_at = now;
  run.attempt_id = attemptId;
  run.started_at ||= now;
  run.completed_at = null;
  run.failure = null;
  state.status = "running";
  state.updated_at = now;
  return run;
}

export function updateBenchmarkChild(
  state,
  {
    runKey,
    childPid,
    sessionId,
    rawLogRef,
    leaseId = null,
    fencingToken = null,
    now = new Date().toISOString()
  }
) {
  const run = state.runs.find((item) => item.run_key === runKey);
  if (!run || run.status !== "running") {
    throw new Error(`benchmark run is not running: ${runKey}`);
  }
  assertRunLease(run, { leaseId, fencingToken, now });
  if (childPid != null) run.child_pid = childPid;
  if (sessionId != null) run.session_id = sessionId;
  if (rawLogRef && !run.raw_log_refs.includes(rawLogRef)) {
    run.raw_log_refs.push(rawLogRef);
  }
  state.updated_at = now;
  return run;
}

export function finishBenchmarkRun(
  state,
  {
    runKey,
    status,
    resultRef = null,
    resultSha256 = null,
    failure = null,
    leaseId = null,
    fencingToken = null,
    now = new Date().toISOString()
  }
) {
  if (!["completed", "failed", "invalid", "interrupted"].includes(status)) {
    throw new Error(`invalid benchmark terminal status: ${status}`);
  }
  if (
    ["completed", "invalid"].includes(status)
    && (!resultRef || !/^[a-f0-9]{64}$/.test(resultSha256 || ""))
  ) {
    throw new Error(`benchmark ${status} result requires result sha256`);
  }
  const run = state.runs.find((item) => item.run_key === runKey);
  if (!run || run.status !== "running") {
    throw new Error(`benchmark run is not running: ${runKey}`);
  }
  assertRunLease(run, { leaseId, fencingToken, now });
  run.status = status;
  run.controller_pid = null;
  run.child_pid = null;
  run.completed_at = status === "interrupted" ? null : now;
  run.result_ref = resultRef;
  run.result_sha256 = resultSha256;
  run.failure = failure;
  clearRunLease(run);
  if (status === "interrupted") run.recovery_count += 1;
  state.updated_at = now;
  state.status = controllerStatus(state.runs);
  return run;
}

export function selectBenchmarkRuns(state, filters = {}) {
  return state.runs.filter((run) => {
    if (filters.status && run.status !== filters.status) return false;
    if (filters.mode && run.mode !== filters.mode) return false;
    if (filters.taskId && run.task_id !== filters.taskId) return false;
    if (filters.repository && run.repository !== filters.repository) return false;
    if (filters.scenario && run.scenario !== filters.scenario) return false;
    return true;
  });
}

export function shouldRetryBenchmarkValidation(validationErrors, processAttempt) {
  return processAttempt < 3
    && validationErrors.length > 0
    && validationErrors.every((error) =>
      error === "Codex usage evidence missing"
    );
}

export function saveBenchmarkControllerState(path, state) {
  normalizeBenchmarkControllerState(state);
  const persisted = readJson(path, null);
  if (persisted) {
    normalizeBenchmarkControllerState(persisted);
    if (persisted.revision !== state.revision) {
      throw new Error(
        `stale controller revision: ${state.revision} != ${persisted.revision}`
      );
    }
  }
  state.revision += 1;
  assertContract("benchmark-controller.schema.json", state, path);
  writeJson(path, state);
}

export function loadBenchmarkControllerState(path) {
  const state = readJson(path, null);
  if (!state) throw new Error(`benchmark controller state missing: ${path}`);
  normalizeBenchmarkControllerState(state);
  assertContract("benchmark-controller.schema.json", state, path);
  return state;
}

export function prepareBenchmarkWorkspace({
  baseWorkspace,
  runRoot,
  task,
  candidateDigest,
  reset = false
}) {
  const workspace = join(runRoot, "workspace");
  if (reset) rmSync(workspace, { recursive: true, force: true });
  if (existsSync(workspace)) {
    return {
      workspace,
      source_fingerprint: projectSourceFingerprint(workspace),
      reused: true
    };
  }
  mkdirSync(workspace, { recursive: true });
  cpSync(baseWorkspace, workspace, {
    recursive: true,
    filter: (source) => {
      if (source === baseWorkspace) return true;
      return !["node_modules", ".git"].includes(source.split(sep).at(-1));
    }
  });
  applySetupOperations(workspace, task.setup_operations);
  initializeWorkspaceGit(workspace);
  linkDependencyDirectories(baseWorkspace, workspace);
  const publicTask = {
    task_id: `${task.repository}--${task.scenario}`,
    task_digest: task.task_digest,
    repository: task.repository,
    scenario: task.scenario,
    title: task.title,
    instructions: task.instructions,
    affected_files: task.affected_files,
    acceptance_commands: task.acceptance_commands,
    release_candidate_digest: candidateDigest
  };
  writeFileSync(
    join(runRoot, "task.json"),
    `${JSON.stringify(publicTask, null, 2)}\n`
  );
  return {
    workspace,
    source_fingerprint: projectSourceFingerprint(workspace),
    reused: false
  };
}

export function applySetupOperations(workspace, operations) {
  for (const operation of operations) {
    const target = safeTarget(workspace, operation.path);
    if (operation.op === "write_text") {
      if (existsSync(target)) throw new Error(`setup write target exists: ${operation.path}`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, operation.content);
      continue;
    }
    if (!existsSync(target) || !lstatSync(target).isFile()) {
      throw new Error(`setup replace target missing: ${operation.path}`);
    }
    const content = readFileSync(target, "utf8");
    const count = content.split(operation.old_text).length - 1;
    if (count !== 1) {
      throw new Error(`setup replace source cardinality ${count}: ${operation.path}`);
    }
    writeFileSync(target, content.replace(operation.old_text, operation.new_text));
  }
}

function initializeWorkspaceGit(workspace) {
  runGit(workspace, ["init", "-q"]);
  runGit(workspace, ["config", "user.name", "Apex Forge Benchmark"]);
  runGit(workspace, ["config", "user.email", "benchmark@apex-forge.local"]);
  const excludePath = join(workspace, ".git", "info", "exclude");
  writeFileSync(
    excludePath,
    "node_modules\nnode_modules/\n**/node_modules\n**/node_modules/\n.apex-v2/\n.apex-v2.lock/\n"
  );
  runGit(workspace, ["add", "-A"]);
  runGit(workspace, ["commit", "-q", "-m", "Benchmark injected baseline"], {
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z"
  });
}

function linkDependencyDirectories(baseWorkspace, workspace) {
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const source = join(directory, entry.name);
      const path = relative(baseWorkspace, source);
      if (entry.isDirectory() && entry.name === "node_modules") {
        const target = join(workspace, path);
        mkdirSync(dirname(target), { recursive: true });
        if (!existsSync(target)) symlinkSync(source, target, "dir");
      } else if (entry.isDirectory()) {
        visit(source);
      }
    }
  };
  visit(baseWorkspace);
}

function safeTarget(root, path) {
  if (!path || path.includes("\0") || path.startsWith("/")) {
    throw new Error(`unsafe setup path: ${path}`);
  }
  if (path.split(/[\\/]/).includes("..")) throw new Error(`unsafe setup path: ${path}`);
  const target = resolve(root, path);
  const prefix = `${resolve(root)}${sep}`;
  if (!target.startsWith(prefix)) throw new Error(`unsafe setup path: ${path}`);
  return target;
}

function runGit(cwd, args, extraEnv = {}) {
  const result = spawnSync("git", args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function defaultIsPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function assertRunLease(run, { leaseId, fencingToken, now }) {
  if (leaseId == null && fencingToken == null) return;
  if (run.lease_id !== leaseId) {
    throw new Error(`benchmark lease mismatch: ${leaseId} != ${run.lease_id}`);
  }
  if (run.fencing_token !== fencingToken) {
    throw new Error(
      `benchmark fencing mismatch: ${fencingToken} != ${run.fencing_token}`
    );
  }
  if (Date.parse(run.lease_expires_at) <= Date.parse(now)) {
    throw new Error(`benchmark lease expired: ${run.lease_expires_at}`);
  }
}

function clearRunLease(run) {
  run.lease_id = null;
  run.lease_owner = null;
  run.lease_expires_at = null;
  run.heartbeat_at = null;
  run.attempt_id = null;
}

function normalizeBenchmarkControllerState(state) {
  if (!Number.isInteger(state.revision) || state.revision < 0) state.revision = 0;
  for (const run of state.runs || []) {
    if (!Number.isInteger(run.fencing_token) || run.fencing_token < 0) {
      run.fencing_token = 0;
    }
    for (const field of [
      "lease_id",
      "lease_owner",
      "lease_expires_at",
      "heartbeat_at",
      "attempt_id"
    ]) {
      if (!(field in run)) run[field] = null;
    }
  }
  return state;
}

function controllerStatus(runs) {
  if (runs.every((run) => run.status === "completed")) return "complete";
  if (runs.some((run) => run.status === "running")) return "running";
  if (runs.some((run) => ["failed", "invalid"].includes(run.status))) return "blocked";
  return "pending";
}

function safeName(value) {
  return value.replaceAll(/[^A-Za-z0-9._-]/g, "_");
}
