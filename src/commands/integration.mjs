import {
  cpSync,
  existsSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir, now, readJson, required, shortId, splitList, tail, writeJson } from "../lib/common.mjs";
import { appendEvent, projectRoot, requireStore, SCHEMA_VERSION, updateProject } from "../core/store.mjs";
import { getRunNode, loadRun, requirePassedNode } from "../core/run-state.mjs";
import { createArtifact, listArtifactsForRun } from "../core/artifacts.mjs";
import { applyPatchOperations, findPatch, findPatchWithPath, findWorker, getWorkers, updatePatchBundle, workerDir, workerStatusForMergeItems } from "../core/worker.mjs";
import { ensureMergeApproval } from "../core/governance.mjs";
import { resolveConflictRisks, syncConflictRisks, syncReviewRisk, syncVerificationRisk } from "../core/risks.mjs";
import { assertContract, scanProjectContracts } from "../core/contracts.mjs";
import { withProjectTransaction } from "../core/project-transaction.mjs";
import { buildCandidateSet, persistCandidateSet } from "../core/candidate.mjs";
import { spawnManagedProcess } from "../core/capability-sandbox.mjs";
import { inspectNegativeControlGate } from "../core/negative-control.mjs";
import { validateCapabilityEvidenceForBindings } from "../core/capability-evidence.mjs";

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
  return withProjectTransaction(resolve(root, ".."), {
    kind: "merge-enqueue",
    idempotencyKey: `merge-enqueue:${run.run_id}:${patch.patch_id}`
  }, () => enqueuePatchTransaction(root, run, patch)).result;
}

function enqueuePatchTransaction(root, run, patch) {
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
  console.log(JSON.stringify(queue, null, 2));
}

function resolveMerge(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const keepPatchId = required(args, "keep-patch-id");
  const reason = String(args.reason || "coordinator selected one patch to resolve conflict");
  const result = withProjectTransaction(resolve(root, ".."), {
    kind: "merge-resolve",
    idempotencyKey: `merge-resolve:${run.run_id}:${keepPatchId}:${stableTransitionHash(reason)}`
  }, () => resolveMergeTransaction(root, run, keepPatchId, reason)).result;
  console.log(JSON.stringify(result, null, 2));
}

function resolveMergeTransaction(root, run, keepPatchId, reason) {
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
    updatePatchBundle(root, patchInfo.patch);
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
  return { queue, resolution, artifact_id: artifact.artifact_id };
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
  const negativeControl = inspectNegativeControlGate(root, run.run_id);
  if (
    negativeControl.required
    && negativeControl.mode === "enforce"
    && !negativeControl.ready
  ) {
    throw new Error(
      `merge apply 被 Negative Control Gate 阻断：${negativeControl.message}`
    );
  }

  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  const currentCandidate = persistCandidateSet(
    root,
    buildCandidateSet(root, run, queue, resolve(root, ".."))
  );
  const verification = readJson(join(root, "runs", run.run_id, "verification-report.json"), null);
  const review = readJson(join(root, "runs", run.run_id, "review-report.json"), null);
  if (
    !verification
    || verification.status !== "PASS"
    || verification.candidate_digest !== currentCandidate.candidate.candidate_digest
  ) {
    throw new Error("merge apply 拒绝未绑定当前 candidate 的 verification PASS");
  }
  if (
    !review
    || review.status !== "PASS"
    || review.candidate_digest !== currentCandidate.candidate.candidate_digest
  ) {
    throw new Error("merge apply 拒绝未绑定当前 candidate 的 review PASS");
  }
  if (queue.conflicts.length > 0) {
    const report = writeIntegrationReport(
      root,
      run,
      "BLOCKED",
      [],
      queue.conflicts,
      [],
      currentCandidate.candidate.candidate_digest
    );
    throw new Error(`merge queue 存在冲突，已生成 integration report：${report.report_id}`);
  }
  if (queue.items.length === 0 && isNoopIntegrationRun(root, run.run_id)) {
    const report = writeIntegrationReport(
      root,
      run,
      "NOOP",
      [],
      [],
      [],
      currentCandidate.candidate.candidate_digest
    );
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
    const report = writeIntegrationReport(
      root,
      run,
      "BLOCKED",
      [],
      [],
      [],
      currentCandidate.candidate.candidate_digest
    );
    throw new Error(`merge queue 为空且不满足 no-op integration 条件：${report.report_id}`);
  }
  const approval = ensureMergeApproval(root, run, queue, currentCandidate.candidate.candidate_digest);
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

  const mergeItems = queue.items.filter((item) => item.status !== "dropped");
  const changedFiles = Array.from(new Set(mergeItems.flatMap((item) => item.changed_files))).sort();
  return withProjectTransaction(resolve(root, ".."), {
    kind: "merge-apply",
    idempotencyKey: `merge-apply:${run.run_id}:${currentCandidate.candidate.candidate_digest}`,
    extraPaths: changedFiles
  }, () => applyMergeTransaction(
    root,
    run,
    queue,
    currentCandidate.candidate.candidate_digest
  )).result;
}

function applyMergeTransaction(root, run, queue, candidateDigest) {
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
    updatePatchBundle(root, patchInfo.patch);
    const worker = findWorker(root, item.worker_id);
    worker.status = "merged";
    worker.updated_at = now();
    writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  }
  writeMergeQueue(root, queue);
  const report = writeIntegrationReport(
    root,
    run,
    "MERGED",
    mergedPatches,
    [],
    Array.from(new Set(appliedFiles)),
    candidateDigest
  );
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
  if (existsSync(join(root, "runs", run.run_id, "integration-report.json"))) {
    throw new Error("integration 后 verification 已冻结，不能覆盖 candidate chain");
  }
  const timestamp = now();
  const plan = loadPlanGraph(root, run.run_id);
  const staged = prepareVerificationWorkspace(root, run, projectDir);
  const candidate = buildCandidateSet(
    root,
    run,
    readMergeQueue(root, run.run_id),
    projectDir
  );
  const checks = [staged.materializationCheck];
  const kernelCapabilityExecutions = [];
  try {
    for (const [index, command] of plan.verification_policy.required_commands.entries()) {
      checks.push(runShellCommandCheck(
        `plan-command-${index + 1}`,
        command,
        staged.workspace_dir,
        staged.environment
      ));
    }
    if (plan.verification_policy.schema_check) {
      checks.push(runShellCommandCheck(
        "schema-check",
        plan.verification_policy.schema_check,
        staged.workspace_dir,
        staged.environment
      ));
    }
    for (const binding of plan.capability_plan?.kernel || []) {
      const execution = runKernelCapabilityProvider(binding, {
        run,
        candidate,
        workspaceDir: staged.workspace_dir,
        environment: staged.environment,
        timestamp
      });
      kernelCapabilityExecutions.push(execution);
      checks.push(execution.check);
    }
  } finally {
    staged.cleanup();
    staged.metadata.cleaned = true;
  }
  const candidateAfterChecks = buildCandidateSet(
    root,
    run,
    readMergeQueue(root, run.run_id),
    projectDir
  );
  if (candidateAfterChecks.candidate_digest !== candidate.candidate_digest) {
    checks.push(verificationCheck(
      "candidate-stability",
      "FAIL",
      "candidate digest unchanged during verification",
      1,
      candidate.candidate_digest,
      candidateAfterChecks.candidate_digest
    ));
  }
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("verification"),
    run_id: run.run_id,
    candidate_digest: candidate.candidate_digest,
    candidate_ref: `.apex-v2/runs/${run.run_id}/candidates/candidate-${candidate.candidate_digest}.json`,
    status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
    created_at: timestamp,
    workspace: staged.metadata,
    checks
  };
  return withProjectTransaction(projectDir, {
    kind: "verification-commit",
    idempotencyKey: `verification-commit:${run.run_id}:${candidate.candidate_digest}`
  }, () => commitVerification(
    root,
    run,
    report,
    candidate,
    kernelCapabilityExecutions,
    timestamp
  )).result;
}

function commitVerification(
  root,
  run,
  report,
  candidate,
  kernelCapabilityExecutions,
  timestamp
) {
  persistCandidateSet(root, candidate);
  const artifact = createArtifact(root, run, "verify", {
    type: "test",
    title: `Verification：${report.status}`,
    body: `在 ${report.workspace.mode} 中执行 ${report.checks.length} 个验证检查，staged patches=${report.workspace.patch_ids.length}，状态 ${report.status}。`,
    refs: [`.apex-v2/runs/${run.run_id}/verification-report.json`],
    timestamp
  });
  report.capability_receipt_refs = persistKernelCapabilityResults(
    root,
    run,
    kernelCapabilityExecutions,
    report.candidate_digest,
    timestamp
  );
  writeJson(join(root, "runs", run.run_id, "verification-report.json"), report);
  syncVerificationRisk(root, run.run_id, report);
  const event = appendEvent(root, "verification.completed", "apex-v2", {
    run_id: run.run_id,
    report_id: report.report_id,
    status: report.status,
    workspace_mode: report.workspace.mode,
    patch_ids: report.workspace.patch_ids,
    candidate_digest: report.candidate_digest,
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
      environment: {},
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

  const tempRoot = mkdtempSync(join(
    verificationTempBase(projectDir),
    `apex-v2-verify-${run.run_id}-`
  ));
  const workspaceDir = join(tempRoot, "project");
  const verificationHome = join(tempRoot, "home");
  const verificationTmp = join(tempRoot, "tmp");
  ensureDir(verificationHome);
  ensureDir(verificationTmp);
  try {
    cpSync(projectDir, workspaceDir, {
      recursive: true,
      filter(source) {
        if (source === projectDir) return true;
        const name = basename(source);
        return ![
          ".git",
          ".apex-v2",
          ".apex-v2.lock",
          ".apex-v2.transaction-backups",
          "node_modules"
        ].includes(name);
      }
    });
    initializeVerificationRepository(workspaceDir);
    linkVerificationDependencies(projectDir, workspaceDir);
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
    environment: {
      HOME: verificationHome,
      TMPDIR: verificationTmp,
      XDG_CACHE_HOME: join(verificationHome, ".cache"),
      XDG_CONFIG_HOME: join(verificationHome, ".config")
    },
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

function verificationTempBase(projectDir) {
  const projectReal = realpathSync(projectDir);
  const candidates = [
    process.env.APEX_V2_VERIFY_TMPDIR,
    tmpdir(),
    "/private/tmp",
    "/tmp"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const candidateReal = realpathSync(candidate);
    if (
      candidateReal !== projectReal
      && !candidateReal.startsWith(`${projectReal}${sep}`)
    ) {
      return candidateReal;
    }
  }
  throw new Error("找不到项目目录外的 staged verification temp root");
}

function initializeVerificationRepository(workspaceDir) {
  for (const args of [
    ["init", "-q"],
    ["config", "user.name", "Apex Forge Verification"],
    ["config", "user.email", "verification@apex-forge.local"]
  ]) {
    const result = spawnSync("git", args, { cwd: workspaceDir, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`staged git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
  }
  writeFileSync(
    join(workspaceDir, ".git", "info", "exclude"),
    "node_modules\nnode_modules/\n**/node_modules\n**/node_modules/\n.apex-v2/\n"
  );
  for (const args of [
    ["add", "-A"],
    ["commit", "-q", "-m", "Apex Forge staged verification baseline"]
  ]) {
    const result = spawnSync("git", args, {
      cwd: workspaceDir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
        GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z"
      }
    });
    if (result.status !== 0) {
      throw new Error(`staged git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
  }
}

function linkVerificationDependencies(projectDir, workspaceDir) {
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".apex-v2"].includes(entry.name)) continue;
      const source = join(directory, entry.name);
      if (entry.name === "node_modules") {
        const target = join(workspaceDir, relative(projectDir, source));
        createWritableVerificationDependencyShell(source, target);
      } else if (entry.isDirectory()) {
        visit(source);
      }
    }
  };
  visit(projectDir);
}

function createWritableVerificationDependencyShell(source, target) {
  if (existsSync(target)) return;
  ensureDir(target);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const dependency = join(source, entry.name);
    const linked = join(target, entry.name);
    if ([".cache", ".tmp", ".vite", ".vite-temp"].includes(entry.name)) {
      ensureDir(linked);
      continue;
    }
    symlinkSync(dependency, linked, entry.isDirectory() ? "dir" : "file");
  }
}

function runShellCommandCheck(id, command, cwd, environment = {}) {
  const result = spawnManagedProcess("/bin/zsh", ["-lc", command], {
    workspaceDir: cwd,
    timeoutMs: positiveInteger(
      process.env.APEX_V2_VERIFY_COMMAND_TIMEOUT_MS,
      30 * 60 * 1000
    ),
    minFreeBytes: positiveInteger(
      process.env.APEX_V2_MIN_FREE_BYTES,
      20 * 1024 * 1024 * 1024
    ),
    maxDiskGrowthBytes: positiveInteger(
      process.env.APEX_V2_MAX_DISK_GROWTH_BYTES,
      5 * 1024 * 1024 * 1024
    ),
    maxWorkspaceGrowthBytes: positiveInteger(
      process.env.APEX_V2_MAX_WORKSPACE_GROWTH_BYTES,
      5 * 1024 * 1024 * 1024
    ),
    maxOutputBytes: positiveInteger(
      process.env.APEX_V2_MAX_COMMAND_OUTPUT_BYTES,
      16 * 1024 * 1024
    ),
    env: {
      ...process.env,
      ...environment
    }
  });
  return verificationCheck(
    id,
    result.status === 0 ? "PASS" : "FAIL",
    command,
    result.status ?? 1,
    tail(result.stdout),
    tail(result.stderr)
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  const candidate = buildCandidateSet(root, run, queue, resolve(root, ".."));
  const verification = readJson(join(root, "runs", run.run_id, "verification-report.json"), null);
  const verifyStatus = getRunNode(run, "verify").status;
  const negativeControl = inspectNegativeControlGate(root, run.run_id);
  return withProjectTransaction(resolve(root, ".."), {
    kind: "review-generate",
    idempotencyKey: [
      "review-generate",
      run.run_id,
      verifyStatus,
      verification?.report_id || "none",
      candidate.candidate_digest,
      negativeControl.fingerprint
    ].join(":")
  }, () => generateReviewTransaction(root, run)).result;
}

function generateReviewTransaction(root, run) {
  const timestamp = now();
  const queue = readMergeQueue(root, run.run_id);
  recomputeMergeConflicts(root, queue);
  writeMergeQueue(root, queue);
  const candidate = persistCandidateSet(
    root,
    buildCandidateSet(root, run, queue, resolve(root, ".."))
  );
  const verification = readJson(join(root, "runs", run.run_id, "verification-report.json"), null);
  const blocking = [];
  const nonBlocking = [];
  const negativeControl = inspectNegativeControlGate(root, run.run_id);
  const plan = loadPlanGraph(root, run.run_id);

  if (getRunNode(run, "verify").status !== "passed") {
    blocking.push("verify 节点尚未 PASS。");
  }
  if (!verification || verification.status !== "PASS") {
    blocking.push("verification-report 缺失或未通过。");
  } else if (verification.candidate_digest !== candidate.candidate.candidate_digest) {
    blocking.push("verification-report 未绑定当前 candidate。");
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
  if (negativeControl.required && !negativeControl.ready) {
    if (negativeControl.mode === "enforce") {
      blocking.push(negativeControl.message);
    } else if (negativeControl.mode === "shadow") {
      nonBlocking.push(
        `Negative Control shadow gap：${negativeControl.message}`
      );
    }
  }
  if (["quick", "governed_v2"].includes(plan.method_pack?.workflow)) {
    const reviewWorker = getWorkers(root, run.run_id)
      .filter((worker) => worker.plan_node_id === "delivery-review")
      .sort((left, right) =>
        String(right.created_at).localeCompare(String(left.created_at))
      )[0];
    const reviewEvidenceArtifact = reviewWorker
      ? latestEvidenceArtifact(root, reviewWorker)
      : null;
    const reviewEvidence = reviewEvidenceArtifact?.sections?.find((section) =>
      section.kind === "semantic"
    )?.content || null;
    if (!reviewWorker || ![
      "evidence_submitted",
      "decision_submitted"
    ].includes(reviewWorker.status)) {
      blocking.push("Governed V2 缺少已完成的独立 Review Agent。");
    } else if (!reviewEvidenceArtifact) {
      blocking.push("Review Agent 缺少 Unified Evidence Artifact。");
    } else if (
      !reviewEvidence
      || reviewEvidence.candidate_digest !== candidate.candidate.candidate_digest
    ) {
      blocking.push("Review Agent evidence 未绑定当前 candidate。");
    } else if (
      reviewEvidenceArtifact.verdict !== "PASS"
      || reviewEvidenceArtifact.gate?.status !== "PASS"
    ) {
      blocking.push("Review Agent unified evidence gate 未通过。");
    } else if (reviewEvidence.merge_posture !== "approve") {
      blocking.push(
        ...reviewEvidence.findings,
        `Review Agent merge posture=${reviewEvidence.merge_posture}`
      );
    } else {
      nonBlocking.push(
        ...reviewEvidence.findings,
        ...reviewEvidence.residual_risks
      );
    }
    if (
      reviewWorker?.capability_enforcement === "enforce"
      && reviewEvidenceArtifact
    ) {
      const receipts = capabilityReceiptsForArtifact(
        root,
        reviewWorker,
        reviewEvidenceArtifact.evidence_artifact_id
      );
      const received = new Set(receipts
        .filter((receipt) => receipt.validation?.status === "PASS")
        .map((receipt) => receipt.capability_id));
      const missing = (reviewWorker.capability_bindings || [])
        .filter((binding) => binding.required)
        .map((binding) => binding.capability_id)
        .filter((capabilityId) => !received.has(capabilityId));
      if (missing.length > 0) {
        blocking.push(
          `Review Agent 缺少有效 Capability Receipt：${missing.join(", ")}`
        );
      }
    }
  }

  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("review"),
    run_id: run.run_id,
    candidate_digest: candidate.candidate.candidate_digest,
    verification_report_id: verification?.report_id || null,
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
    candidate_digest: report.candidate_digest,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { report, artifact_id: artifact.artifact_id };
}

function runKernelCapabilityProvider(binding, {
  run,
  candidate,
  workspaceDir,
  environment,
  timestamp
}) {
  const invocation = {
    schema_version: SCHEMA_VERSION,
    invocation_id: [
      "kernel",
      run.run_id,
      binding.capability_id,
      candidate.candidate_digest
    ].join("-"),
    run_id: run.run_id,
    plan_node_id: "kernel-verification",
    worker_id: null,
    capability_id: binding.capability_id,
    capability_version: binding.capability_version,
    input_contract: binding.input_contract,
    input_artifact_refs: [
      `.apex-v2/runs/${run.run_id}/candidates/candidate-${candidate.candidate_digest}.json`
    ],
    input: {
      candidate_digest: candidate.candidate_digest,
      workspace: workspaceDir
    },
    output_contract: binding.output_contract,
    required: binding.required,
    created_at: timestamp
  };
  assertContract(
    "capability-invocation.schema.json",
    invocation,
    `kernel capability invocation:${binding.capability_id}`
  );
  let command;
  try {
    command = kernelCapabilityProviderCommands()[
      binding.capability_id
    ];
  } catch (error) {
    return failedKernelCapabilityExecution(
      binding,
      invocation,
      error.message
    );
  }
  if (!command) {
    return failedKernelCapabilityExecution(
      binding,
      invocation,
      `未配置真实 provider command：${binding.capability_id}`
    );
  }
  const result = spawnManagedProcess("/bin/zsh", ["-lc", command], {
    workspaceDir,
    input: `${JSON.stringify(invocation)}\n`,
    timeoutMs: positiveInteger(
      process.env.APEX_V2_CAPABILITY_TIMEOUT_MS,
      30 * 60 * 1000
    ),
    minFreeBytes: positiveInteger(
      process.env.APEX_V2_MIN_FREE_BYTES,
      20 * 1024 * 1024 * 1024
    ),
    maxDiskGrowthBytes: positiveInteger(
      process.env.APEX_V2_MAX_DISK_GROWTH_BYTES,
      5 * 1024 * 1024 * 1024
    ),
    maxWorkspaceGrowthBytes: positiveInteger(
      process.env.APEX_V2_MAX_WORKSPACE_GROWTH_BYTES,
      5 * 1024 * 1024 * 1024
    ),
    maxOutputBytes: positiveInteger(
      process.env.APEX_V2_MAX_COMMAND_OUTPUT_BYTES,
      16 * 1024 * 1024
    ),
    env: {
      ...process.env,
      ...environment,
      APEX_CAPABILITY_ID: binding.capability_id,
      APEX_CAPABILITY_VERSION: binding.capability_version,
      APEX_CANDIDATE_DIGEST: candidate.candidate_digest
    }
  });
  if (result.status !== 0) {
    return failedKernelCapabilityExecution(
      binding,
      invocation,
      `provider exit=${result.status ?? 1}: ${tail(result.stderr || result.stdout)}`
    );
  }
  let evidence;
  try {
    evidence = JSON.parse(String(result.stdout || "").trim());
    if (evidence.invocation_id !== invocation.invocation_id) {
      throw new Error(
        `invocation_id 不匹配：${evidence.invocation_id || "(空)"}`
      );
    }
    validateCapabilityEvidenceForBindings([binding], [evidence], {
      expectedCandidateDigest: candidate.candidate_digest
    });
  } catch (error) {
    return failedKernelCapabilityExecution(
      binding,
      invocation,
      `provider evidence 无效：${error.message}`
    );
  }
  return {
    binding,
    invocation,
    evidence,
    command,
    check: verificationCheck(
      `capability-provider-${binding.capability_id}`,
      "PASS",
      `provider:${binding.capability_id}`,
      0,
      `validated ${binding.output_contract}`,
      ""
    )
  };
}

function failedKernelCapabilityExecution(binding, invocation, error) {
  return {
    binding,
    invocation,
    evidence: null,
    command: null,
    check: verificationCheck(
      `capability-provider-${binding.capability_id}`,
      binding.required ? "FAIL" : "PASS",
      `provider:${binding.capability_id}`,
      binding.required ? 1 : 0,
      binding.required ? "" : `SKIPPED_WITH_REASON: ${error}`,
      binding.required ? error : ""
    )
  };
}

function kernelCapabilityProviderCommands() {
  const raw = String(
    process.env.APEX_CAPABILITY_PROVIDER_COMMANDS || ""
  ).trim();
  if (!raw) return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `APEX_CAPABILITY_PROVIDER_COMMANDS 必须是 JSON object：${error.message}`
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("APEX_CAPABILITY_PROVIDER_COMMANDS 必须是 JSON object");
  }
  for (const [capabilityId, command] of Object.entries(value)) {
    if (!String(command || "").trim()) {
      throw new Error(`Capability provider command 为空：${capabilityId}`);
    }
  }
  return value;
}

function persistKernelCapabilityResults(
  root,
  run,
  executions,
  candidateDigest,
  timestamp
) {
  const dir = join(root, "runs", run.run_id, "kernel-capabilities");
  if (executions.length > 0) ensureDir(dir);
  const receiptRefs = [];
  for (const execution of executions) {
    const { binding, invocation, evidence } = execution;
    const invocationName = `capability-invocation-${binding.capability_id}.json`;
    writeJson(join(dir, invocationName), invocation);
    if (!evidence) continue;
    const evidenceArtifact = {
      schema_version: SCHEMA_VERSION,
      evidence_artifact_id: shortId("evidence"),
      run_id: run.run_id,
      node_id: "kernel-verification",
      worker_id: "project-kernel",
      action_id: null,
      attempt: 1,
      kind: "execution",
      objective: evidence.objective,
      verdict: "PASS",
      candidate_digest: candidateDigest,
      scope: {
        read: evidence.source_refs,
        write: []
      },
      sections: [{
        kind: "capability",
        capability_id: evidence.capability_id,
        output_contract: evidence.output_contract,
        content: evidence.output
      }],
      provenance: {
        submission_format: "unified",
        executor: `provider:${binding.capability_id}`,
        model: null
      },
      evidence_refs: [
        ...evidence.source_refs,
        ...evidence.verification_refs
      ],
      gate: {
        status: "PASS",
        reasons: []
      },
      created_at: timestamp
    };
    assertContract(
      "evidence-artifact.schema.json",
      evidenceArtifact,
      `kernel capability artifact:${binding.capability_id}`
    );
    const evidenceName = [
      "evidence-artifact",
      evidenceArtifact.evidence_artifact_id,
      binding.capability_id
    ].join("-") + ".json";
    const evidenceRef = [
      ".apex-v2",
      "runs",
      run.run_id,
      "kernel-capabilities",
      evidenceName
    ].join("/");
    writeJson(join(dir, evidenceName), evidenceArtifact);
    const receipt = {
      schema_version: SCHEMA_VERSION,
      receipt_id: [
        "capability-receipt",
        evidenceArtifact.evidence_artifact_id,
        binding.capability_id
      ].join("-"),
      evidence_artifact_id: evidenceArtifact.evidence_artifact_id,
      capability_id: binding.capability_id,
      capability_version: binding.capability_version,
      invocation_id: evidence.invocation_id,
      output_contract: binding.output_contract,
      output_ref: evidenceRef,
      output_digest: createHash("sha256")
        .update(JSON.stringify(evidence.output))
        .digest("hex"),
      source_refs: evidence.source_refs,
      verification_refs: evidence.verification_refs,
      validation: {
        binding_match: true,
        version_match: true,
        schema_valid: true,
        semantic_valid: true,
        status: "PASS"
      },
      derived_at: timestamp
    };
    assertContract(
      "capability-receipt.schema.json",
      receipt,
      `kernel capability receipt:${binding.capability_id}`
    );
    const name = `${receipt.receipt_id}.json`;
    writeJson(join(dir, name), receipt);
    receiptRefs.push([
      ".apex-v2",
      "runs",
      run.run_id,
      "kernel-capabilities",
      name
    ].join("/"));
  }
  return receiptRefs;
}

function latestEvidenceArtifact(root, worker) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  if (!existsSync(dir)) return null;
  const artifacts = readdirSync(dir)
    .filter((name) =>
      name.startsWith("evidence-artifact-") && name.endsWith(".json")
    )
    .map((name) => readJson(join(dir, name), null))
    .filter(Boolean)
    .sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at))
    );
  return artifacts.at(-1) || null;
}

function capabilityReceiptsForArtifact(root, worker, evidenceArtifactId) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  return readdirSync(dir)
    .filter((name) =>
      name.startsWith("capability-receipt-") && name.endsWith(".json")
    )
    .map((name) => readJson(join(dir, name), null))
    .filter((receipt) =>
      receipt?.evidence_artifact_id === evidenceArtifactId
    );
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
  const itemsByWorker = new Map();
  for (const item of queue.items) {
    if (!itemsByWorker.has(item.worker_id)) itemsByWorker.set(item.worker_id, []);
    itemsByWorker.get(item.worker_id).push(item);
  }
  for (const [workerId, items] of itemsByWorker) {
    const worker = findWorker(root, workerId);
    worker.status = workerStatusForMergeItems(items);
    worker.updated_at = queue.updated_at;
    writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  }
}

function writeIntegrationReport(
  root,
  run,
  status,
  mergedPatches,
  conflicts,
  appliedFiles = [],
  candidateDigest = null
) {
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("integration"),
    run_id: run.run_id,
    candidate_digest: candidateDigest,
    status,
    created_at: now(),
    merged_patches: mergedPatches,
    applied_files: appliedFiles,
    conflicts
  };
  writeJson(join(root, "runs", run.run_id, "integration-report.json"), report);
  return report;
}

function stableTransitionHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}


function readDecisionQueue(root, runId) { return readJson(join(root, "runs", runId, "decision-queue.json"), { schema_version: SCHEMA_VERSION, run_id: runId, updated_at: now(), items: [] }); }
function loadPlanGraph(root, runId) { const plan = readJson(join(root, "runs", runId, "plan-graph.json"), null); if (!plan) throw new Error(`找不到 plan graph：${runId}`); return plan; }
function getPlanNode(plan, id) { const node = plan.nodes.find((item) => item.id === id); if (!node) throw new Error(`找不到 plan node：${id}`); return node; }
