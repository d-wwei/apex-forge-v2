import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir, now, readJson, required, shortId, splitList, tail, writeJson } from "../lib/common.mjs";
import { appendEvent, projectRoot, requireStore, SCHEMA_VERSION, updateProject } from "../core/store.mjs";
import { getRunNode, loadRun, requirePassedNode } from "../core/run-state.mjs";
import { createArtifact, listArtifactsForRun } from "../core/artifacts.mjs";
import { applyPatchOperations, findPatch, findPatchWithPath, findWorker, getWorkers, workerDir } from "../core/worker.mjs";
import { ensureMergeApproval } from "../core/governance.mjs";
import { resolveConflictRisks, syncConflictRisks, syncReviewRisk, syncVerificationRisk } from "../core/risks.mjs";
import { scanProjectContracts } from "../core/contracts.mjs";

export function handleMergeCommand(subcommand, args) {
  if (subcommand === "enqueue") {
    enqueueMerge(args);
    return;
  }
  if (subcommand === "status") {
    mergeStatus(args);
    return;
  }
  if (subcommand === "apply") {
    applyMerge(args);
    return;
  }
  if (subcommand === "resolve") {
    resolveMerge(args);
    return;
  }
  throw new Error(`未知 merge 子命令：${subcommand || "(空)"}`);
}

function enqueueMerge(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const patchId = required(args, "patch-id");
  const patch = findPatch(root, run.run_id, patchId);
  const queue = enqueuePatchInternal(root, run, patch);
  console.log(JSON.stringify(queue, null, 2));
}

export function enqueuePatchInternal(root, run, patch) {
  const queue = readMergeQueue(root, run.run_id);
  if (!queue.items.some((item) => item.patch_id === patch.patch_id)) {
    queue.items.push({
      patch_id: patch.patch_id,
      worker_id: patch.worker_id,
      plan_node_id: patch.plan_node_id,
      status: "queued",
      changed_files: patch.changed_files
    });
  }
  recomputeMergeConflicts(root, queue);
  syncConflictRisks(root, run.run_id, queue.conflicts);
  writeMergeQueue(root, queue);
  syncWorkerStatusesFromMergeQueue(root, queue);
  const event = appendEvent(root, "merge.enqueued", "apex-v2", {
    run_id: run.run_id,
    patch_id: patch.patch_id,
    conflicts: queue.conflicts.length
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return queue;
}

function mergeStatus(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  writeMergeQueue(root, queue);
  console.log(JSON.stringify(queue, null, 2));
}

function resolveMerge(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const keepPatchId = required(args, "keep-patch-id");
  const reason = String(args.reason || "coordinator selected one patch to resolve conflict");
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  const relatedConflicts = queue.conflicts.filter((conflict) => conflict.patch_ids.includes(keepPatchId));
  if (relatedConflicts.length === 0) {
    throw new Error(`没有找到包含 keep patch 的冲突：${keepPatchId}`);
  }
  const droppedPatchIds = Array.from(new Set(relatedConflicts.flatMap((conflict) => conflict.patch_ids).filter((id) => id !== keepPatchId)));
  const keepItem = queue.items.find((item) => item.patch_id === keepPatchId);
  if (!keepItem) throw new Error(`keep patch 不在 merge queue：${keepPatchId}`);
  keepItem.status = "queued";

  for (const patchId of droppedPatchIds) {
    const item = queue.items.find((entry) => entry.patch_id === patchId);
    if (!item || item.status === "merged") continue;
    item.status = "dropped";
    const patchInfo = findPatchWithPath(root, run.run_id, patchId);
    patchInfo.patch.status = "dropped";
    patchInfo.patch.updated_at = now();
    writeJson(patchInfo.path, patchInfo.patch);
    const worker = findWorker(root, item.worker_id);
    worker.status = "dropped";
    worker.updated_at = now();
    writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  }

  const resolution = {
    schema_version: SCHEMA_VERSION,
    resolution_id: shortId("resolution"),
    run_id: run.run_id,
    created_at: now(),
    kept_patch_id: keepPatchId,
    dropped_patch_ids: droppedPatchIds,
    reason
  };
  ensureDir(join(root, "runs", run.run_id, "resolutions"));
  writeJson(join(root, "runs", run.run_id, "resolutions", `${resolution.resolution_id}.json`), resolution);
  queue.resolutions = [...(queue.resolutions || []), {
    resolution_id: resolution.resolution_id,
    kept_patch_id: keepPatchId,
    dropped_patch_ids: droppedPatchIds,
    reason
  }];
  resolveConflictRisks(root, run.run_id, relatedConflicts, reason);
  recomputeMergeConflicts(root, queue);
  writeMergeQueue(root, queue);
  syncWorkerStatusesFromMergeQueue(root, queue);
  const artifact = createArtifact(root, run, "integrate", {
    type: "decision",
    title: "MergeResolution：conflict resolved",
    body: `kept=${keepPatchId}\ndropped=${droppedPatchIds.join(",")}\nreason=${reason}`,
    refs: [
      `.apex-v2/runs/${run.run_id}/merge-queue.json`,
      `.apex-v2/runs/${run.run_id}/resolutions/${resolution.resolution_id}.json`
    ],
    timestamp: resolution.created_at
  });
  const event = appendEvent(root, "merge.resolved", "apex-v2", {
    run_id: run.run_id,
    resolution_id: resolution.resolution_id,
    kept_patch_id: keepPatchId,
    dropped_patch_ids: droppedPatchIds,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({ queue, resolution, artifact_id: artifact.artifact_id }, null, 2));
}

function applyMerge(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const run = loadRun(root, required(args, "run-id"));
  const result = applyMergeInternal(root, run);
  console.log(JSON.stringify(result, null, 2));
}

export function applyMergeInternal(root, run) {
  const reviewNode = getRunNode(run, "review");
  if (reviewNode.status !== "passed") {
    throw new Error(`merge apply 前必须先 PASS review 节点，当前状态：${reviewNode.status}`);
  }

  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  if (queue.conflicts.length > 0) {
    const report = writeIntegrationReport(root, run, "BLOCKED", [], queue.conflicts);
    throw new Error(`merge queue 存在冲突，已生成 integration report：${report.report_id}`);
  }
  if (queue.items.length === 0 && isNoopIntegrationRun(root, run.run_id)) {
    const report = writeIntegrationReport(root, run, "NOOP", [], []);
    const artifact = createArtifact(root, run, "integrate", {
      type: "decision",
      title: "Integration：no-op",
      body: "本 run 没有 patch bundle，仅集成 evidence/decision artifacts。",
      refs: [
        `.apex-v2/runs/${run.run_id}/decision-queue.json`,
        `.apex-v2/runs/${run.run_id}/integration-report.json`
      ],
      timestamp: report.created_at
    });
    const event = appendEvent(root, "merge.applied", "apex-v2", {
      run_id: run.run_id,
      merged_patches: [],
      artifact_id: artifact.artifact_id,
      mode: "noop"
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    return { report, artifact_id: artifact.artifact_id };
  }
  if (queue.items.length === 0) {
    const report = writeIntegrationReport(root, run, "BLOCKED", [], []);
    throw new Error(`merge queue 为空且不满足 no-op integration 条件：${report.report_id}`);
  }
  const approval = ensureMergeApproval(root, run, queue);
  if (!approval.allowed) {
    if (approval.created) {
      const event = appendEvent(root, "approval.requested", "apex-v2", {
        approval_id: approval.approval.id,
        run_id: run.run_id,
        kind: "merge",
        fingerprint: approval.fingerprint,
        reasons: approval.reasons
      });
      updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    }
    throw new Error(`merge approval required：${approval.approval.id}=${approval.approval.decision || "pending"}`);
  }

  const mergedPatches = [];
  const appliedFiles = [];
  for (const item of queue.items) {
    if (item.status === "dropped") continue;
    item.status = "merged";
    mergedPatches.push(item.patch_id);
    const patchInfo = findPatchWithPath(root, run.run_id, item.patch_id);
    appliedFiles.push(...applyPatchOperations(resolve(root, ".."), patchInfo.patch));
    patchInfo.patch.status = "merged";
    patchInfo.patch.updated_at = now();
    writeJson(patchInfo.path, patchInfo.patch);
    const worker = findWorker(root, item.worker_id);
    worker.status = "merged";
    worker.updated_at = now();
    writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  }
  writeMergeQueue(root, queue);
  const report = writeIntegrationReport(root, run, "MERGED", mergedPatches, [], Array.from(new Set(appliedFiles)));
  const artifact = createArtifact(root, run, "integrate", {
    type: "decision",
    title: "Integration：merge queue 已应用",
    body: `已合并 ${mergedPatches.length} 个 patch bundle，冲突数 0。`,
    refs: [
      `.apex-v2/runs/${run.run_id}/merge-queue.json`,
      `.apex-v2/runs/${run.run_id}/integration-report.json`
    ],
    timestamp: report.created_at
  });
  const event = appendEvent(root, "merge.applied", "apex-v2", {
    run_id: run.run_id,
    merged_patches: mergedPatches,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { report, artifact_id: artifact.artifact_id };
}

export function handleVerifyCommand(subcommand, args) {
  if (subcommand === "run") {
    runVerification(args);
    return;
  }
  throw new Error(`未知 verify 子命令：${subcommand || "(空)"}`);
}

function runVerification(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const run = loadRun(root, required(args, "run-id"));
  const result = runVerificationInternal(root, run, projectDir);
  console.log(JSON.stringify(result, null, 2));
}

export function runVerificationInternal(root, run, projectDir) {
  requirePassedNode(run, "execute");
  const timestamp = now();
  const plan = loadPlanGraph(root, run.run_id);
  const staged = prepareVerificationWorkspace(root, run, projectDir);
  const checks = [staged.materializationCheck];
  try {
    for (const [index, command] of plan.verification_policy.required_commands.entries()) {
      checks.push(runShellCommandCheck(`plan-command-${index + 1}`, command, staged.workspace_dir));
    }
    if (plan.verification_policy.schema_check) {
      checks.push(runShellCommandCheck("schema-check", plan.verification_policy.schema_check, staged.workspace_dir));
    }
  } finally {
    staged.cleanup();
    staged.metadata.cleaned = true;
  }
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("verification"),
    run_id: run.run_id,
    status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
    created_at: timestamp,
    workspace: staged.metadata,
    checks
  };
  writeJson(join(root, "runs", run.run_id, "verification-report.json"), report);
  syncVerificationRisk(root, run.run_id, report);
  const artifact = createArtifact(root, run, "verify", {
    type: "test",
    title: `Verification：${report.status}`,
    body: `在 ${report.workspace.mode} 中执行 ${checks.length} 个验证检查，staged patches=${report.workspace.patch_ids.length}，状态 ${report.status}。`,
    refs: [`.apex-v2/runs/${run.run_id}/verification-report.json`],
    timestamp
  });
  const event = appendEvent(root, "verification.completed", "apex-v2", {
    run_id: run.run_id,
    report_id: report.report_id,
    status: report.status,
    workspace_mode: report.workspace.mode,
    patch_ids: report.workspace.patch_ids,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { report, artifact_id: artifact.artifact_id };
}

function prepareVerificationWorkspace(root, run, projectDir) {
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  writeMergeQueue(root, queue);
  const patchItems = queue.items.filter((item) => item.status !== "dropped" && item.status !== "merged");
  const metadata = {
    mode: patchItems.length > 0 ? "staged-copy" : "project-root",
    source_project: projectDir,
    patch_ids: patchItems.map((item) => item.patch_id),
    applied_files: [],
    unmaterialized_patch_ids: [],
    conflicts: queue.conflicts,
    preparation_error: "",
    cleaned: false
  };

  if (patchItems.length === 0) {
    return {
      workspace_dir: projectDir,
      metadata,
      materializationCheck: verificationCheck(
        "patch-materialization",
        "PASS",
        "materialize merge queue patches",
        0,
        "no queued patches; verification uses project root",
        ""
      ),
      cleanup() {}
    };
  }

  const tempRoot = mkdtempSync(join(tmpdir(), `apex-v2-verify-${run.run_id}-`));
  const workspaceDir = join(tempRoot, "project");
  try {
    cpSync(projectDir, workspaceDir, {
      recursive: true,
      filter(source) {
        if (source === projectDir) return true;
        const name = basename(source);
        return name !== ".git" && name !== "node_modules";
      }
    });
    const sourceNodeModules = join(projectDir, "node_modules");
    if (existsSync(sourceNodeModules)) {
      symlinkSync(sourceNodeModules, join(workspaceDir, "node_modules"), "dir");
    }
    if (queue.conflicts.length > 0) {
      throw new Error(`merge queue 存在 ${queue.conflicts.length} 个未解决冲突`);
    }
    for (const item of patchItems) {
      if (item.status !== "queued") {
        throw new Error(`patch 尚未处于 queued 状态：${item.patch_id}=${item.status}`);
      }
      const patch = findPatch(root, run.run_id, item.patch_id);
      if (!Array.isArray(patch.operations) || patch.operations.length === 0) {
        metadata.unmaterialized_patch_ids.push(item.patch_id);
        continue;
      }
      const operationPaths = new Set(patch.operations.map((operation) => operation.path));
      const missingOperations = patch.changed_files.filter((file) => !operationPaths.has(file));
      if (missingOperations.length > 0) {
        metadata.unmaterialized_patch_ids.push(item.patch_id);
        metadata.preparation_error = `patch ${item.patch_id} 缺少 operations：${missingOperations.join(",")}`;
        continue;
      }
      metadata.applied_files.push(...applyPatchOperations(workspaceDir, patch));
    }
  } catch (error) {
    metadata.preparation_error = error.message;
  }

  const materialized = metadata.preparation_error === "" && metadata.unmaterialized_patch_ids.length === 0;
  return {
    workspace_dir: workspaceDir,
    metadata,
    materializationCheck: verificationCheck(
      "patch-materialization",
      materialized ? "PASS" : "FAIL",
      "materialize merge queue patches",
      materialized ? 0 : 1,
      materialized ? `applied_files=${Array.from(new Set(metadata.applied_files)).join(",")}` : "",
      metadata.preparation_error || `patches without operations: ${metadata.unmaterialized_patch_ids.join(",")}`
    ),
    cleanup() {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  };
}

function runShellCommandCheck(id, command, cwd) {
  const result = spawnSync(command, { cwd, encoding: "utf8", shell: true });
  return verificationCheck(
    id,
    result.status === 0 ? "PASS" : "FAIL",
    command,
    result.status ?? 1,
    tail(result.stdout),
    tail(result.stderr)
  );
}

function verificationCheck(id, status, command, exitCode, stdout, stderr) {
  return {
    id,
    status,
    command,
    exit_code: exitCode,
    stdout_tail: stdout,
    stderr_tail: stderr
  };
}

export function handleReviewCommand(subcommand, args) {
  if (subcommand === "generate") {
    generateReview(args);
    return;
  }
  throw new Error(`未知 review 子命令：${subcommand || "(空)"}`);
}

function generateReview(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const result = generateReviewInternal(root, run);
  console.log(JSON.stringify(result, null, 2));
}

export function generateReviewInternal(root, run) {
  const timestamp = now();
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  writeMergeQueue(root, queue);
  const verification = readJson(join(root, "runs", run.run_id, "verification-report.json"), null);
  const blocking = [];
  const nonBlocking = [];

  if (getRunNode(run, "verify").status !== "passed") {
    blocking.push("verify 节点尚未 PASS。");
  }
  if (!verification || verification.status !== "PASS") {
    blocking.push("verification-report 缺失或未通过。");
  }
  if (queue.conflicts.length > 0) {
    blocking.push(`merge queue 存在 ${queue.conflicts.length} 个冲突。`);
  }
  if (queue.items.length === 0) {
    if (isNoopIntegrationRun(root, run.run_id)) {
      nonBlocking.push("merge queue 为空，但 run 仅包含 evidence/decision，可走 no-op integration。");
    } else {
      blocking.push("merge queue 为空，缺少待集成 patch。");
    }
  }
  if (queue.items.some((item) => item.status !== "queued")) {
    nonBlocking.push("merge queue 中存在非 queued 状态 item，需要 coordinator 留意。");
  }

  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("review"),
    run_id: run.run_id,
    status: blocking.length === 0 ? "PASS" : "BLOCKED",
    created_at: timestamp,
    blocking_findings: blocking,
    non_blocking_findings: nonBlocking
  };
  writeJson(join(root, "runs", run.run_id, "review-report.json"), report);
  syncReviewRisk(root, run.run_id, report);
  const artifact = createArtifact(root, run, "review", {
    type: "review",
    title: `Review：${report.status}`,
    body: `blocking=${blocking.length}，non_blocking=${nonBlocking.length}`,
    refs: [
      `.apex-v2/runs/${run.run_id}/review-report.json`,
      `.apex-v2/runs/${run.run_id}/verification-report.json`,
      `.apex-v2/runs/${run.run_id}/merge-queue.json`
    ],
    timestamp
  });
  const event = appendEvent(root, "review.generated", "apex-v2", {
    run_id: run.run_id,
    report_id: report.report_id,
    status: report.status,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { report, artifact_id: artifact.artifact_id };
}

function isNoopIntegrationRun(root, runId) {
  const workersDir = join(root, "runs", runId, "workers");
  if (existsSync(workersDir)) {
    for (const workerEntry of readdirSync(workersDir, { withFileTypes: true })) {
      if (!workerEntry.isDirectory()) continue;
      if (existsSync(join(workersDir, workerEntry.name, "patch-bundle.json"))) return false;
    }
  }
  const run = loadRun(root, runId);
  const executeNode = getRunNode(run, "execute");
  if (executeNode.status !== "passed" || executeNode.evidence_refs.length === 0) return false;
  const queue = readDecisionQueue(root, runId);
  return queue.items.length > 0 || executeNode.evidence_refs.some((artifactId) => {
    const artifact = readJson(join(root, "artifacts", runId, `${artifactId}.json`), null);
    return artifact && ["evidence", "decision"].includes(artifact.type);
  });
}

function readMergeQueue(root, runId) {
  const path = join(root, "runs", runId, "merge-queue.json");
  return readJson(path, {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    updated_at: now(),
    items: [],
    conflicts: [],
    resolutions: []
  });
}

function writeMergeQueue(root, queue) {
  queue.updated_at = now();
  writeJson(join(root, "runs", queue.run_id, "merge-queue.json"), queue);
}

function recomputeMergeConflicts(root, queue) {
  const owners = new Map();
  const conflicts = [];
  for (const item of queue.items) {
    if (item.status === "dropped") continue;
    if (item.status === "merged") {
      for (const key of mergeConflictKeysForItem(root, queue.run_id, item)) {
        if (!owners.has(key.key)) owners.set(key.key, { patch_id: item.patch_id, file: key.file });
      }
      continue;
    }
    item.status = "queued";
    for (const key of mergeConflictKeysForItem(root, queue.run_id, item)) {
      if (!owners.has(key.key)) {
        owners.set(key.key, { patch_id: item.patch_id, file: key.file });
        continue;
      }
      const first = owners.get(key.key);
      item.status = "blocked_conflict";
      const firstItem = queue.items.find((entry) => entry.patch_id === first.patch_id);
      if (firstItem && firstItem.status !== "merged") firstItem.status = "blocked_conflict";
      conflicts.push({
        kind: key.kind,
        file: key.file,
        patch_ids: Array.from(new Set([first.patch_id, item.patch_id])),
        resolution: "coordinator_serial_merge_required"
      });
    }
  }
  queue.conflicts = conflicts;
}

function mergeConflictKeysForItem(root, runId, item) {
  const patch = tryFindPatchForQueueItem(root, runId, item.patch_id);
  if (!patch || !Array.isArray(patch.operations) || patch.operations.length === 0) {
    return item.changed_files.map((file) => ({ key: `file:${file}`, file, kind: "same_file_patch" }));
  }
  return patch.operations.map((operation) => {
    if (operation.op === "replace_text") {
      return {
        key: `replace_text:${operation.path}:${operation.old_text}`,
        file: operation.path,
        kind: "same_text_patch"
      };
    }
    return {
      key: `file:${operation.path}`,
      file: operation.path,
      kind: "same_file_patch"
    };
  });
}

function tryFindPatchForQueueItem(root, runId, patchId) {
  try {
    return findPatch(root, runId, patchId);
  } catch {
    return null;
  }
}

function syncWorkerStatusesFromMergeQueue(root, queue) {
  for (const item of queue.items) {
    const worker = findWorker(root, item.worker_id);
    if (item.status === "dropped") {
      worker.status = "dropped";
    } else if (item.status === "merged") {
      worker.status = "merged";
    } else {
      worker.status = item.status === "blocked_conflict" ? "blocked" : "queued";
    }
    worker.updated_at = queue.updated_at;
    writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  }
}

function writeIntegrationReport(root, run, status, mergedPatches, conflicts, appliedFiles = []) {
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("integration"),
    run_id: run.run_id,
    status,
    created_at: now(),
    merged_patches: mergedPatches,
    applied_files: appliedFiles,
    conflicts
  };
  writeJson(join(root, "runs", run.run_id, "integration-report.json"), report);
  return report;
}


function readDecisionQueue(root, runId) { return readJson(join(root, "runs", runId, "decision-queue.json"), { schema_version: SCHEMA_VERSION, run_id: runId, updated_at: now(), items: [] }); }
function loadPlanGraph(root, runId) { const plan = readJson(join(root, "runs", runId, "plan-graph.json"), null); if (!plan) throw new Error(`找不到 plan graph：${runId}`); return plan; }
function getPlanNode(plan, id) { const node = plan.nodes.find((item) => item.id === id); if (!node) throw new Error(`找不到 plan node：${id}`); return node; }
