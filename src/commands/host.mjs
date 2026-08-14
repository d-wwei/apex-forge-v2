import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  appendEvent,
  projectRoot,
  requireStore,
  SCHEMA_VERSION,
  updateProject
} from "../core/store.mjs";
import { createArtifact } from "../core/artifacts.mjs";
import { validateContract } from "../core/contracts.mjs";
import { assertPatchWithinBudget } from "../core/governance.mjs";
import { loadRun } from "../core/run-state.mjs";
import {
  findWorker,
  getWorkers,
  isFileAllowedByScope,
  workerDir
} from "../core/worker.mjs";
import { enqueuePatchInternal } from "./integration.mjs";
import {
  now,
  readJson,
  required,
  shortId,
  splitList,
  writeJson
} from "../lib/common.mjs";

export function handleHostCommand(subcommand, args) {
  if (subcommand === "actions") {
    console.log(JSON.stringify(listHostActions(requireStore(projectRoot(args))), null, 2));
    return;
  }
  if (subcommand === "claim") {
    console.log(JSON.stringify(claimHostAction(
      requireStore(projectRoot(args)),
      required(args, "worker-id"),
      required(args, "host-id")
    ), null, 2));
    return;
  }
  if (subcommand === "submit") {
    console.log(JSON.stringify(submitHostResult(
      requireStore(projectRoot(args)),
      required(args, "worker-id"),
      required(args, "host-id"),
      {
        summary: required(args, "summary"),
        refs: splitList(args.refs)
      }
    ), null, 2));
    return;
  }
  if (subcommand === "cancel") {
    console.log(JSON.stringify(cancelHostAction(
      requireStore(projectRoot(args)),
      required(args, "worker-id"),
      required(args, "host-id"),
      String(args.reason || "host cancelled action")
    ), null, 2));
    return;
  }
  throw new Error(`未知 host 子命令：${subcommand || "(空)"}`);
}

export function listHostActions(root) {
  const project = readJson(join(root, "project.json"));
  return project.active_runs.flatMap((runId) =>
    getWorkers(root, runId)
      .filter((worker) =>
        worker.preferred_mode === "interactive"
        && ["cognitive", "workspace_patch"].includes(worker.execution_class)
        && ["active", "claimed"].includes(worker.status)
      )
      .map((worker) => ({
        worker_id: worker.worker_id,
        run_id: worker.run_id,
        plan_node_id: worker.plan_node_id,
        status: worker.status,
        claimed_by: worker.claimed_by || null,
        objective: worker.objective,
        deliverables: worker.deliverables,
        required_evidence: worker.required_evidence,
        read_scope: worker.read_scope,
        write_scope: worker.write_scope,
        output_contract: worker.output_contract
      }))
  );
}

export function claimHostAction(root, workerId, hostId) {
  const worker = findWorker(root, workerId);
  if (
    worker.preferred_mode !== "interactive"
    || !["cognitive", "workspace_patch"].includes(worker.execution_class)
  ) {
    throw new Error(`worker 不是可 claim 的 Interactive Host action：${worker.worker_id}`);
  }
  if (worker.status === "claimed" && worker.claimed_by !== hostId) {
    throw new Error(`worker 已被其他 host claim：${worker.claimed_by}`);
  }
  if (!["active", "claimed"].includes(worker.status)) {
    throw new Error(`worker 当前状态不可 claim：${worker.status}`);
  }
  if (worker.execution_class === "workspace_patch") {
    const claimedPatch = listHostActions(root).find((item) =>
      item.status === "claimed"
      && item.worker_id !== worker.worker_id
      && findWorker(root, item.worker_id).execution_class === "workspace_patch"
    );
    if (claimedPatch) {
      throw new Error(`已有 workspace_patch action 被 claim：${claimedPatch.worker_id}`);
    }
  }
  const project = readJson(join(root, "project.json"));
  const timestamp = now();
  const action = {
    schema_version: SCHEMA_VERSION,
    action_id: shortId("host-action"),
    host_id: hostId,
    project_id: project.project_id,
    kind: "action_claim",
    payload: {
      worker_id: worker.worker_id,
      run_id: worker.run_id,
      plan_node_id: worker.plan_node_id,
      objective: worker.objective
    },
    idempotency_key: `${hostId}:${worker.worker_id}`,
    created_at: timestamp
  };
  const validation = validateContract("host-action.schema.json", action, `${worker.namespace}/host-action.json`);
  if (!validation.valid) throw new Error(`host action contract 无效：${JSON.stringify(validation.errors)}`);
  if (worker.adapter !== "host") {
    worker.factory_executor_id = worker.executor_id || worker.adapter;
    worker.adapter = "host";
    worker.executor_id = "host";
  }
  worker.status = "claimed";
  worker.claimed_by = hostId;
  worker.claimed_at = worker.claimed_at || timestamp;
  worker.updated_at = timestamp;
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  writeJson(join(dir, "host-action.json"), action);
  if (worker.execution_class === "workspace_patch") {
    writeJson(join(dir, "host-baseline.json"), snapshotProjectWorkspace(resolve(root, "..")));
  }
  writeJson(join(dir, "worker.json"), worker);
  const event = appendEvent(root, "worker.host.claimed", hostId, {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    action_id: action.action_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { action, worker };
}

export function submitHostResult(root, workerId, hostId, input) {
  const worker = findWorker(root, workerId);
  if (
    worker.adapter !== "host"
    || !["cognitive", "workspace_patch"].includes(worker.execution_class)
  ) {
    throw new Error(`worker 不是 Host action：${worker.worker_id}`);
  }
  if (worker.status !== "claimed" || worker.claimed_by !== hostId) {
    throw new Error(`worker 必须由当前 host claim 后才能 submit：${worker.worker_id}`);
  }
  const timestamp = now();
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  let patch = null;
  let queueStatus = null;
  if (worker.execution_class === "workspace_patch") {
    patch = buildHostPatch(root, worker, input.summary, timestamp);
  }
  const result = {
    schema_version: SCHEMA_VERSION,
    action_id: readJson(join(workerDir(root, worker.run_id, worker.worker_id), "host-action.json")).action_id,
    host_id: hostId,
    status: "completed",
    summary: input.summary,
    artifact_refs: [...(input.refs || []), ...(patch?.changed_files || [])],
    error: null,
    created_at: timestamp
  };
  const validation = validateContract("host-result.schema.json", result, `${worker.namespace}/host-result.json`);
  if (!validation.valid) throw new Error(`host result contract 无效：${JSON.stringify(validation.errors)}`);
  writeJson(join(dir, "host-result.json"), result);
  const run = loadRun(root, worker.run_id);
  let artifact;
  if (patch) {
    artifact = createArtifact(root, run, "execute", {
      type: "patch",
      title: `HostPatch：${worker.plan_node_id}`,
      body: result.summary,
      refs: [
        `${worker.namespace}/host-action.json`,
        `${worker.namespace}/host-result.json`,
        `${worker.namespace}/patch-bundle.json`,
        ...patch.changed_files
      ],
      timestamp
    });
    worker.status = "patch_submitted";
    worker.updated_at = timestamp;
    writeJson(join(dir, "worker.json"), worker);
    const queue = enqueuePatchInternal(root, run, patch);
    queueStatus = queue.conflicts.length > 0 ? "blocked_conflict" : "queued";
  } else {
    artifact = createArtifact(root, run, "execute", {
      type: "evidence",
      title: `HostAgent：${worker.plan_node_id}`,
      body: result.summary,
      refs: [`${worker.namespace}/host-action.json`, `${worker.namespace}/host-result.json`, ...result.artifact_refs],
      timestamp
    });
    worker.status = "evidence_submitted";
    worker.updated_at = timestamp;
    writeJson(join(dir, "worker.json"), worker);
  }
  const event = appendEvent(root, "worker.host.submitted", hostId, {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    action_id: result.action_id,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    result,
    worker: findWorker(root, worker.worker_id),
    artifact_id: artifact.artifact_id,
    patch_id: patch?.patch_id || null,
    queue_status: queueStatus
  };
}

export function cancelHostAction(root, workerId, hostId, reason) {
  const worker = findWorker(root, workerId);
  if (worker.status !== "claimed" || worker.claimed_by !== hostId) {
    throw new Error(`worker 必须由当前 host claim 后才能 cancel：${worker.worker_id}`);
  }
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const action = readJson(join(dir, "host-action.json"));
  const baseline = readJson(join(dir, "host-baseline.json"), null);
  if (baseline) {
    const projectDir = resolve(root, "..");
    const current = snapshotProjectWorkspace(projectDir);
    const changedFiles = [...new Set([...Object.keys(baseline.files), ...Object.keys(current.files)])]
      .filter((path) => baseline.files[path] !== current.files[path]);
    restoreWorkspaceChanges(projectDir, baseline.files, current.files, changedFiles);
  }
  const timestamp = now();
  const result = {
    schema_version: SCHEMA_VERSION,
    action_id: action.action_id,
    host_id: hostId,
    status: "cancelled",
    summary: reason,
    artifact_refs: [],
    error: null,
    created_at: timestamp
  };
  writeJson(join(dir, "host-result.json"), result);
  worker.status = "cancelled";
  worker.updated_at = timestamp;
  writeJson(join(dir, "worker.json"), worker);
  const event = appendEvent(root, "worker.host.cancelled", hostId, {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    action_id: action.action_id,
    reason
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { result, worker };
}

function buildHostPatch(root, worker, summary, timestamp) {
  const projectDir = resolve(root, "..");
  const baselinePath = join(workerDir(root, worker.run_id, worker.worker_id), "host-baseline.json");
  const baseline = readJson(baselinePath, null);
  if (!baseline) throw new Error(`Host workspace baseline 缺失：${worker.worker_id}`);
  const current = snapshotProjectWorkspace(projectDir);
  const paths = new Set([...Object.keys(baseline.files), ...Object.keys(current.files)]);
  const changedFiles = [];
  const outOfScope = [];
  const operations = [];
  for (const path of [...paths].sort()) {
    const before = baseline.files[path];
    const after = current.files[path];
    if (before === after) continue;
    changedFiles.push(path);
    if (!isFileAllowedByScope(path, worker.write_scope)) {
      outOfScope.push(path);
      continue;
    }
    if (after == null) throw new Error(`Interactive Host 暂不支持删除文件：${path}`);
    if (before == null) operations.push({ op: "write_text", path, content: after });
    else operations.push({ op: "replace_text", path, old_text: before, new_text: after });
  }
  if (outOfScope.length > 0) {
    throw new Error(`Interactive Host 修改超出 write_scope：${outOfScope.join(", ")}`);
  }
  if (operations.length === 0) {
    throw new Error(`Interactive Host 未产生 patch：${worker.worker_id}`);
  }
  restoreWorkspaceChanges(projectDir, baseline.files, current.files, changedFiles);
  const patch = {
    schema_version: SCHEMA_VERSION,
    patch_id: shortId("patch"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    summary,
    changed_files: changedFiles,
    operations,
    evidence_refs: [],
    status: "submitted",
    created_at: timestamp,
    updated_at: timestamp
  };
  assertPatchWithinBudget(root, patch);
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "patch-bundle.json"), patch);
  return patch;
}

function snapshotProjectWorkspace(projectDir) {
  const files = {};
  for (const path of listProjectFiles(projectDir)) {
    const content = readFileSync(join(projectDir, path));
    if (content.includes(0)) continue;
    files[path] = content.toString("utf8");
  }
  return {
    schema_version: SCHEMA_VERSION,
    created_at: now(),
    files
  };
}

function listProjectFiles(projectDir) {
  const ignored = new Set([".git", ".apex-v2", ".apex-v2.lock", "node_modules"]);
  const output = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (directory === projectDir && ignored.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) output.push(relative(projectDir, path));
    }
  };
  visit(projectDir);
  return output.sort();
}

function restoreWorkspaceChanges(projectDir, baseline, current, changedFiles) {
  for (const path of changedFiles) {
    const target = join(projectDir, path);
    const before = baseline[path];
    if (before == null) {
      if (current[path] != null && existsSync(target)) rmSync(target);
      continue;
    }
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, before);
  }
}
