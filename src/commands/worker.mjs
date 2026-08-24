import { cpSync, existsSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { appendEvent, projectRoot, requireStore, SCHEMA_VERSION, updateProject } from "../core/store.mjs";
import { applyPatchOperations, createWorkerForPlanNode, ensureWorkerSandboxReady, executeWorkerShell, findGitRoot, findPatch, findWorker, getWorkers, isFileAllowedByScope, patchBundleRef, persistPatchBundle, workerDir } from "../core/worker.mjs";
import { executeWorkerExecutor } from "../core/worker-execution.mjs";
import { inspectWorkerExecutors } from "../executors/registry.mjs";
import { assertAdapterAllowed, assertPatchWithinBudget, effectiveAgentTimeout, ensureAdapterBaselineApproval } from "../core/governance.mjs";
import { createArtifact } from "../core/artifacts.mjs";
import { loadRun, requirePassedNode } from "../core/run-state.mjs";
import { buildWorkerSummary } from "../core/worker-results.mjs";
import { runAdapterSmoke } from "../core/adapter-smoke.mjs";
import { buildAdapterTrend, recordAdapterObservation, recordAdapterSmokeReport } from "../core/adapter-observability.mjs";
import { assertSafeRelativePath, dirnameForPath, ensureDir, normalizeEnum, now, readJson, required, shortId, splitList, tail, writeJson, writeTextIfMissing } from "../lib/common.mjs";
import { withProjectTransaction } from "../core/project-transaction.mjs";
import { claimCheckout, releaseCheckout } from "../core/git-delivery.mjs";

export function handleWorkerCommand(subcommand, args) {
  if (subcommand === "create") {
    createWorker(args);
    return;
  }
  if (subcommand === "list") {
    listWorkers(args);
    return;
  }
  if (subcommand === "submit-patch") {
    submitWorkerPatch(args);
    return;
  }
  if (subcommand === "sandbox") {
    handleWorkerSandbox(args);
    return;
  }
  if (subcommand === "promote-sandbox") {
    promoteWorkerSandbox(args);
    return;
  }
  if (subcommand === "exec-shell") {
    execWorkerShell(args);
    return;
  }
  if (subcommand === "exec-agent") {
    execWorkerAgent(args);
    return;
  }
  if (subcommand === "adapters") {
    listWorkerAdapters(args);
    return;
  }
  if (subcommand === "retry") {
    retryWorker(args);
    return;
  }
  if (subcommand === "fallback") {
    fallbackWorker(args);
    return;
  }
  if (subcommand === "results") {
    const root = requireStore(projectRoot(args));
    const worker = findWorker(root, required(args, "worker-id"));
    console.log(JSON.stringify(buildWorkerSummary(root, worker, Boolean(args.record)), null, 2));
    return;
  }
  if (subcommand === "resume") {
    resumeWorkerAgent(args);
    return;
  }
  if (subcommand === "decide") {
    decideWorker(args);
    return;
  }
  throw new Error(`未知 worker 子命令：${subcommand || "(空)"}`);
}

function createWorker(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  requirePassedNode(run, "plan_graph");
  const plan = loadPlanGraph(root, run.run_id);
  const planNodeId = required(args, "plan-node-id");
  const planNode = getPlanNode(plan, planNodeId);
  if (getWorkers(root, run.run_id).some((worker) => worker.plan_node_id === planNode.id && worker.status !== "merged")) {
    throw new Error(`plan node 已有未完成 worker：${planNode.id}`);
  }
  const worker = createWorkerForPlanNode(root, run, planNode, {
    mode: args.mode ? String(args.mode) : null
  });
  console.log(JSON.stringify(worker, null, 2));
}

function listWorkers(args) {
  const root = requireStore(projectRoot(args));
  const runId = required(args, "run-id");
  console.log(JSON.stringify(getWorkers(root, runId), null, 2));
}

function handleWorkerSandbox(args) {
  const action = args._[0];
  if (action === "init") {
    initWorkerSandbox(args);
    return;
  }
  if (action === "write") {
    writeWorkerSandbox(args);
    return;
  }
  throw new Error(`未知 worker sandbox 动作：${action || "(空)"}`);
}

function initWorkerSandbox(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  const requestedType = normalizeEnum(args.type || "scratch", ["scratch", "worktree"], "type");
  const initialized = initializeWorkerSandbox(root, worker, requestedType);
  console.log(JSON.stringify(initialized, null, 2));
}

export function initializeWorkerSandbox(root, worker, requestedType) {
  const projectDir = resolve(root, "..");
  const existingDir = worker.sandbox?.path ? resolve(projectDir, worker.sandbox.path) : null;
  if (worker.sandbox?.status === "ready" && existingDir && existsSync(existingDir)) {
    const manifest = readJson(join(existingDir, "sandbox.json"), null);
    if (worker.sandbox.type === "worktree" && worker.sandbox.checkout_claim_token) {
      const claim = claimCheckout(existingDir, checkoutOwner(worker));
      if (claim.claim_token !== worker.sandbox.checkout_claim_token) {
        throw new Error(`worktree checkout claim token 漂移：${worker.worker_id}`);
      }
    }
    return { worker, manifest };
  }
  const gitRoot = findGitRoot(projectDir);
  const useWorktree = requestedType === "worktree" && gitRoot;
  const dir = join(workerDir(root, worker.run_id, worker.worker_id), "sandbox");
  if (useWorktree) {
    ensureDir(dirnameForPath(dir));
    const result = spawnSync("git", ["worktree", "add", "--detach", dir, "HEAD"], {
      cwd: gitRoot,
      encoding: "utf8"
    });
    if (result.status !== 0 && !existsSync(dir)) {
      throw new Error(`git worktree add 失败：${result.stderr || result.stdout}`);
    }
  } else {
    ensureDir(dir);
    copyProjectIntoScratchSandbox(projectDir, dir);
  }
  copyProjectContextSnapshot(projectDir, dir);
  const actualType = useWorktree ? "worktree" : "scratch";
  const fallbackReason = requestedType === "worktree" && !gitRoot ? "当前项目不是 git repository，降级为 scratch sandbox。" : "";
  let checkoutClaim = null;
  if (useWorktree) {
    try {
      checkoutClaim = claimCheckout(dir, checkoutOwner(worker));
    } catch (error) {
      spawnSync("git", ["worktree", "remove", dir, "--force"], {
        cwd: gitRoot,
        encoding: "utf8"
      });
      throw error;
    }
  }
  const manifest = {
    schema_version: SCHEMA_VERSION,
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    requested_type: requestedType,
    type: actualType,
    fallback_reason: fallbackReason,
    checkout_owner_id: checkoutClaim?.owner.owner_id || null,
    checkout_claim_token: checkoutClaim?.claim_token || null,
    created_at: now(),
    read_scope: worker.read_scope,
    write_scope: worker.write_scope,
    verification: worker.verification
  };
  writeJson(join(dir, "sandbox.json"), manifest);
  ensureDir(join(dir, ".apex-agent"));
  writeTextIfMissing(join(dir, ".apex-agent", "README.md"), `# Worker Sandbox

本目录是 worker 的隔离 ${actualType} sandbox。

- worker_id: ${worker.worker_id}
- run_id: ${worker.run_id}
- plan_node_id: ${worker.plan_node_id}

真实代码写入仍必须通过 patch bundle 和 merge gate。
`);
  worker.sandbox = {
    type: actualType,
    path: `${worker.namespace}/sandbox`,
    status: "ready",
    fallback_reason: fallbackReason,
    checkout_owner_id: checkoutClaim?.owner.owner_id || null,
    checkout_claim_token: checkoutClaim?.claim_token || null
  };
  worker.updated_at = now();
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const event = appendEvent(root, "worker.sandbox.initialized", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    sandbox: worker.sandbox.path
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  copyProjectContextSnapshot(projectDir, dir);
  return { worker, manifest };
}

function copyProjectIntoScratchSandbox(projectDir, sandboxDir) {
  const ignored = new Set([
    ".git",
    ".apex-v2",
    ".apex-v2.lock",
    ".apex-v2.transaction-backups",
    "node_modules"
  ]);
  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    cpSync(join(projectDir, entry.name), join(sandboxDir, entry.name), {
      recursive: true,
      force: true
    });
  }
  const nodeModules = join(projectDir, "node_modules");
  const sandboxNodeModules = join(sandboxDir, "node_modules");
  if (existsSync(nodeModules) && !existsSync(sandboxNodeModules)) {
    symlinkSync(nodeModules, sandboxNodeModules, "dir");
  }
}

function copyProjectContextSnapshot(projectDir, sandboxDir) {
  const sourceRoot = join(projectDir, ".apex-v2");
  if (!existsSync(sourceRoot)) return;
  const targetRoot = join(sandboxDir, ".apex-v2");
  ensureDir(targetRoot);
  for (const relativePath of [
    "project.json",
    "events.jsonl",
    "intake",
    "roadmap",
    "knowledge",
    "risks",
    "policies",
    "learning",
    "approvals",
    "metrics"
  ]) {
    const source = join(sourceRoot, relativePath);
    if (!existsSync(source)) continue;
    cpSync(source, join(targetRoot, relativePath), {
      recursive: true,
      force: true
    });
  }
}

function writeWorkerSandbox(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  ensureWorkerSandboxReady(worker);
  const sandboxPath = required(args, "path");
  assertSafeRelativePath(sandboxPath);
  const target = resolve(root, "..", worker.sandbox.path, sandboxPath);
  ensureDir(dirnameForPath(target));
  writeFileSync(target, required(args, "content"));
  const event = appendEvent(root, "worker.sandbox.written", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    path: `${worker.sandbox.path}/${sandboxPath}`
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({ worker_id: worker.worker_id, path: `${worker.sandbox.path}/${sandboxPath}` }, null, 2));
}

function promoteWorkerSandbox(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  const sandboxPath = required(args, "sandbox-path");
  const targetFile = required(args, "target-file");
  const summary = required(args, "summary");
  const result = withProjectTransaction(resolve(root, ".."), {
    kind: "worker-promote-sandbox",
    idempotencyKey: transitionKey("worker-promote-sandbox", {
      worker_id: worker.worker_id,
      sandbox_path: sandboxPath,
      target_file: targetFile,
      summary
    })
  }, () => promoteWorkerSandboxTransaction(
    root,
    worker,
    sandboxPath,
    targetFile,
    summary,
    splitList(args.evidence)
  )).result;
  console.log(JSON.stringify(result, null, 2));
}

function promoteWorkerSandboxTransaction(root, worker, sandboxPath, targetFile, summary, evidenceRefs) {
  ensureWorkerSandboxReady(worker);
  assertSafeRelativePath(sandboxPath);
  assertSafeRelativePath(targetFile);
  if (!isFileAllowedByScope(targetFile, worker.write_scope)) {
    throw new Error(`sandbox promote 目标超出 worker write_scope：${targetFile}`);
  }
  const source = resolve(root, "..", worker.sandbox.path, sandboxPath);
  if (!existsSync(source)) throw new Error(`sandbox 文件不存在：${sandboxPath}`);
  const content = readFileSync(source, "utf8");
  const run = loadRun(root, worker.run_id);
  const timestamp = now();
  const patch = {
    schema_version: SCHEMA_VERSION,
    patch_id: shortId("patch"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    summary,
    changed_files: [targetFile],
    operations: [{ op: "write_text", path: targetFile, content }],
    evidence_refs: evidenceRefs,
    status: "submitted",
    created_at: timestamp,
    updated_at: timestamp
  };
  assertPatchWithinBudget(root, patch);
  persistPatchBundle(root, patch);
  worker.status = "patch_submitted";
  worker.updated_at = timestamp;
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const artifact = createArtifact(root, run, "execute", {
    type: "patch",
    title: `SandboxPatch：${worker.plan_node_id}`,
    body: patch.summary,
    refs: [
      patchBundleRef(worker, patch.patch_id),
      `${worker.sandbox.path}/${sandboxPath}`,
      targetFile
    ],
    timestamp
  });
  const event = appendEvent(root, "worker.sandbox.promoted", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    patch_id: patch.patch_id,
    artifact_id: artifact.artifact_id,
    target_file: targetFile
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { patch, artifact_id: artifact.artifact_id };
}

function submitWorkerPatch(args) {
  const root = requireStore(projectRoot(args));
  const workerId = required(args, "worker-id");
  const worker = findWorker(root, workerId);
  const result = withProjectTransaction(resolve(root, ".."), {
    kind: "worker-submit-patch",
    idempotencyKey: transitionKey("worker-submit-patch", {
      worker_id: workerId,
      summary: args.summary,
      files: args.files,
      write_text_file: args["write-text-file"],
      write_text: args["write-text"],
      replace_file: args["replace-file"],
      old_text: args["old-text"],
      new_text: args["new-text"],
      evidence: args.evidence
    })
  }, () => submitWorkerPatchTransaction(root, worker, args)).result;
  console.log(JSON.stringify(result, null, 2));
}

function submitWorkerPatchTransaction(root, worker, args) {
  const run = loadRun(root, worker.run_id);
  const changedFiles = splitList(required(args, "files"));
  if (changedFiles.length === 0) throw new Error("patch bundle 必须包含 changed files");
  const operations = buildPatchOperations(args);
  for (const operation of operations) {
    if (!changedFiles.includes(operation.path)) {
      throw new Error(`operation path 必须包含在 changed_files 中：${operation.path}`);
    }
  }
  const outOfScope = changedFiles.filter((file) => !isFileAllowedByScope(file, worker.write_scope));
  if (outOfScope.length > 0) {
    throw new Error(`patch 修改超出 worker write_scope：${outOfScope.join(", ")}`);
  }

  const timestamp = now();
  const patch = {
    schema_version: SCHEMA_VERSION,
    patch_id: shortId("patch"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    summary: required(args, "summary"),
    changed_files: changedFiles,
    operations,
    evidence_refs: splitList(args.evidence),
    status: "submitted",
    created_at: timestamp,
    updated_at: timestamp
  };
  assertPatchWithinBudget(root, patch);

  persistPatchBundle(root, patch);
  worker.status = "patch_submitted";
  worker.updated_at = timestamp;
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);

  const artifact = createArtifact(root, run, "execute", {
    type: "patch",
    title: `PatchBundle：${worker.plan_node_id}`,
    body: patch.summary,
    refs: [
      patchBundleRef(worker, patch.patch_id),
      ...changedFiles
    ],
    timestamp
  });
  const event = appendEvent(root, "worker.patch.submitted", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    patch_id: patch.patch_id,
    artifact_id: artifact.artifact_id,
    changed_files: changedFiles
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { patch, artifact_id: artifact.artifact_id };
}

function execWorkerShell(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const worker = findWorker(root, required(args, "worker-id"));
  if (!["active", "evidence_submitted", "decision_submitted"].includes(worker.status)) {
    throw new Error(`worker 当前状态不可执行 shell adapter：${worker.status}`);
  }
  const command = required(args, "cmd");
  const result = executeWorkerShell(
    root,
    worker,
    command,
    "manual",
    parseCapabilityEvidence(args)
  );
  console.log(JSON.stringify({ result: result.adapterResult, artifact_id: result.artifact.artifact_id }, null, 2));
}

function parseCapabilityEvidence(args) {
  const inline = args["capability-evidence-json"];
  const file = args["capability-evidence-file"];
  if (!inline && !file) return [];
  if (inline && file) {
    throw new Error(
      "只能指定 --capability-evidence-json 或 --capability-evidence-file 之一"
    );
  }
  let value;
  try {
    value = JSON.parse(
      file ? readFileSync(resolve(String(file)), "utf8") : String(inline)
    );
  } catch (error) {
    throw new Error(`capability evidence JSON 无效：${error.message}`);
  }
  if (!Array.isArray(value)) {
    throw new Error("capability evidence JSON 必须是数组");
  }
  return value;
}

function execWorkerAgent(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const worker = findWorker(root, required(args, "worker-id"));
  const adapter = normalizeEnum(args.adapter || worker.adapter || "codex", ["codex", "claude", "gemini"], "adapter");
  assertAdapterAllowed(root, adapter);
  const plan = loadPlanGraph(root, worker.run_id);
  const planNode = getPlanNode(plan, worker.plan_node_id);
  const requestedTimeoutMs = Number(args["timeout-ms"] || 30 * 60 * 1000);
  const route = readJson(join(workerDir(root, worker.run_id, worker.worker_id), "execution-route.json"), null);
  const timeoutMs = effectiveAgentTimeout(root, requestedTimeoutMs, route?.cost_budget);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms 必须是正整数");
  }
  const result = executeWorkerExecutor(root, worker, planNode, {
    command: args.command ? String(args.command) : undefined,
    adapter,
    model: args.model ? String(args.model) : undefined,
    profile: args.profile ? String(args.profile) : undefined,
    timeoutMs
  });
  console.log(JSON.stringify({
    result: result.adapterResult,
    patch: result.patch,
    artifact_id: result.artifact.artifact_id
  }, null, 2));
}

function listWorkerAdapters(args) {
  const root = requireStore(projectRoot(args));
  const adapters = [
    { adapter: "shell", available: true, mode: "command evidence" },
    { adapter: "human", available: true, mode: "structured decision" },
    ...inspectWorkerExecutors().map((item) => ({ ...item, mode: "isolated coding agent" }))
  ];
  if (args.history) {
    console.log(JSON.stringify(buildAdapterTrend(root), null, 2));
    return;
  }
  if (args.smoke) {
    const report = runAdapterSmoke({
      live: Boolean(args.live),
      adapters: args.adapter ? splitList(args.adapter) : undefined,
      timeoutMs: Number(args["timeout-ms"] || 180000)
    });
    if (args.record) {
      recordAdapterSmokeReport(root, report, {
        trigger: "manual",
        inspections: adapters.filter((item) => !["shell", "human"].includes(item.adapter))
      });
    }
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "PASS") process.exitCode = 1;
    return;
  }
  if (args.diff) {
    console.log(JSON.stringify(evaluateAdapterCapabilityDrift(root, adapters), null, 2));
    return;
  }
  if (args.record) {
    const drift = evaluateAdapterCapabilityDrift(root, adapters);
    const approval = ensureAdapterBaselineApproval(root, drift);
    if (!approval.allowed) {
      if (approval.created) {
        const event = appendEvent(root, "approval.requested", "apex-v2", {
          approval_id: approval.approval.id,
          kind: "adapter_baseline",
          fingerprint: approval.approval.fingerprint,
          reasons: approval.approval.reasons
        });
        updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
      }
      throw new Error(`adapter baseline approval required：${approval.approval.id}=${approval.approval.decision || "pending"}`);
    }
    ensureDir(join(root, "adapters"));
    writeJson(join(root, "adapters", "capabilities.json"), {
      schema_version: SCHEMA_VERSION,
      generated_at: now(),
      adapters
    });
    recordAdapterObservation(root, adapters, { source: "baseline" });
  }
  console.log(JSON.stringify(adapters, null, 2));
}

export function evaluateAdapterCapabilityDrift(root, adapters = null) {
  const currentAdapters = adapters || [
    { adapter: "shell", available: true, mode: "command evidence" },
    { adapter: "human", available: true, mode: "structured decision" },
    ...inspectWorkerExecutors().map((item) => ({ ...item, mode: "isolated coding agent" }))
  ];
  const baseline = readJson(join(root, "adapters", "capabilities.json"), null);
  const previous = new Map((baseline?.adapters || []).map((item) => [item.adapter, item]));
  const changes = [];
  for (const current of currentAdapters) {
    const before = previous.get(current.adapter);
    if (!before) {
      changes.push({ adapter: current.adapter, kind: "added", severity: "info" });
      continue;
    }
    if (before.available && !current.available) changes.push({ adapter: current.adapter, kind: "unavailable", severity: "blocking" });
    if (before.version && current.version && before.version !== current.version) changes.push({ adapter: current.adapter, kind: "version_changed", from: before.version, to: current.version, severity: "info" });
    const removed = (before.capabilities || []).filter((capability) => !(current.capabilities || []).includes(capability));
    if (removed.length > 0) changes.push({ adapter: current.adapter, kind: "capabilities_removed", capabilities: removed, severity: "blocking" });
  }
  return { status: changes.some((change) => change.severity === "blocking") ? "FAIL" : "PASS", baseline_generated_at: baseline?.generated_at || null, changes, adapters: currentAdapters };
}

function retryWorker(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  const result = retryWorkerInternal(root, worker, "manual");
  console.log(JSON.stringify(result, null, 2));
}

function fallbackWorker(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  const result = fallbackWorkerInternal(root, worker, "manual");
  console.log(JSON.stringify(result, null, 2));
}

function resumeWorkerAgent(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  if (worker.status !== "blocked") throw new Error(`只有 blocked worker 可以 resume：${worker.status}`);
  if (!worker.session_id || !["claude", "gemini"].includes(worker.session_adapter)) {
    throw new Error(`worker 没有可恢复 session：${worker.worker_id}`);
  }
  resetWorkerSandbox(root, worker);
  worker.adapter = worker.session_adapter;
  worker.status = "active";
  initializeWorkerSandbox(root, worker, "scratch");
  const plan = loadPlanGraph(root, worker.run_id);
  const planNode = getPlanNode(plan, worker.plan_node_id);
  const timeoutMs = effectiveAgentTimeout(root, Number(args["timeout-ms"] || 30 * 60 * 1000));
  const result = executeWorkerExecutor(root, worker, planNode, {
    adapter: worker.session_adapter,
    sessionId: worker.session_id,
    timeoutMs
  });
  const event = appendEvent(root, "worker.session.resumed", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    adapter: worker.session_adapter,
    session_id: worker.session_id,
    status: result.adapterResult.status
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({ result: result.adapterResult, patch: result.patch, artifact_id: result.artifact.artifact_id }, null, 2));
}

export function fallbackWorkerInternal(root, worker, via) {
  if (worker.status !== "blocked") throw new Error(`只有 blocked worker 可以 fallback：${worker.status}`);
  const latest = latestWorkerAdapterResult(root, worker);
  const failureKind = latest?.failure_kind || "unknown";
  const policy = readJson(join(root, "policies", "execution.json"));
  if (!policy.permissions.adapter_fallback_failure_kinds.includes(failureKind)) {
    throw new Error(`failure_kind 不允许 adapter fallback：${failureKind}`);
  }
  const current = worker.last_adapter || worker.adapter;
  const order = policy.permissions.adapter_fallback_order;
  const start = Math.max(-1, order.indexOf(current));
  const available = new Map(inspectWorkerExecutors().map((item) => [item.adapter, item]));
  const next = order.slice(start + 1).find((name) =>
    policy.permissions.allowed_adapters.includes(name) && available.get(name)?.available
  );
  if (!next) throw new Error(`没有可用 fallback adapter，current=${current}`);
  resetWorkerSandbox(root, worker);
  worker.adapter = next;
  worker.executor_id = next;
  worker.status = "active";
  worker.updated_at = now();
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const event = appendEvent(root, "worker.adapter.fallback", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    from: current,
    to: next,
    failure_kind: failureKind,
    via
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { worker, from: current, to: next, failure_kind: failureKind };
}

export function retryWorkerInternal(root, worker, via) {
  if (worker.status !== "blocked") {
    throw new Error(`只有 blocked worker 可以 retry，当前状态：${worker.status}`);
  }
  const policy = readJson(join(root, "policies", "retry.json"));
  const adapter = worker.last_adapter || worker.adapter || "shell";
  const maxAttempts = Number(policy.max_attempts?.[adapter] || 1);
  const latestResult = latestWorkerAdapterResult(root, worker);
  const failureKind = latestResult?.failure_kind || "unknown";
  if (Number(worker.attempt || 0) >= maxAttempts) {
    throw new Error(`worker 已达到 ${adapter} 最大尝试次数：${worker.attempt}/${maxAttempts}`);
  }
  if (!policy.auto_retry.retryable_failure_kinds.includes(failureKind)) {
    throw new Error(`failure_kind 不允许 retry：${failureKind}`);
  }
  if (policy.auto_retry.reset_sandbox) resetWorkerSandbox(root, worker);
  worker.status = "active";
  worker.updated_at = now();
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const event = appendEvent(root, "worker.retry.requested", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    attempt: worker.attempt,
    max_attempts: maxAttempts,
    failure_kind: failureKind,
    via
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    worker,
    policy: {
      adapter,
      attempt: worker.attempt,
      max_attempts: maxAttempts,
      failure_kind: failureKind
    }
  };
}

function resetWorkerSandbox(root, worker) {
  if (!worker.sandbox?.path) return;
  const projectDir = resolve(root, "..");
  const sandboxDir = resolve(projectDir, worker.sandbox.path);
  if (existsSync(sandboxDir) && worker.sandbox.type === "worktree") {
    if (worker.sandbox.checkout_claim_token) {
      releaseCheckout(sandboxDir, {
        ...checkoutOwner(worker),
        claim_token: worker.sandbox.checkout_claim_token
      });
    }
    spawnSync("git", ["worktree", "remove", sandboxDir, "--force"], {
      cwd: projectDir,
      encoding: "utf8"
    });
  }
  rmSync(sandboxDir, { recursive: true, force: true });
  worker.sandbox = {
    type: "none",
    path: "",
    status: "missing"
  };
}

function checkoutOwner(worker) {
  return {
    owner_id: `apex-v2-worker:${worker.worker_id}`,
    run_id: worker.run_id,
    worker_id: worker.worker_id
  };
}

export function latestWorkerAdapterResult(root, worker) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .filter((file) => file.startsWith("adapter-result-") && file.endsWith(".json"))
    .map((file) => readJson(join(dir, file)))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] || null;
}

function decideWorker(args) {
  const root = requireStore(projectRoot(args));
  const worker = findWorker(root, required(args, "worker-id"));
  if (!["active", "evidence_submitted", "decision_submitted"].includes(worker.status)) {
    throw new Error(`worker 当前状态不可执行 human adapter：${worker.status}`);
  }
  const timestamp = now();
  const adapterResult = {
    schema_version: SCHEMA_VERSION,
    result_id: shortId("adapter"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    adapter: "human",
    status: "DECISION",
    decision: required(args, "decision"),
    summary: String(args.summary || ""),
    refs: splitList(args.refs),
    created_at: timestamp
  };
  const file = `adapter-result-${adapterResult.result_id}.json`;
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), file), adapterResult);
  worker.status = "decision_submitted";
  worker.updated_at = timestamp;
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const run = loadRun(root, worker.run_id);
  const artifact = createArtifact(root, run, "execute", {
    type: "decision",
    title: "HumanAdapter：decision submitted",
    body: `${adapterResult.decision}\n\n${adapterResult.summary}`,
    refs: [`${worker.namespace}/${file}`, ...adapterResult.refs],
    timestamp
  });
  const event = appendEvent(root, "worker.adapter.human", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    result_id: adapterResult.result_id,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify({ result: adapterResult, artifact_id: artifact.artifact_id }, null, 2));
}

function buildPatchOperations(args) {
  const operations = [];
  if (args["write-text-file"] || args["write-text"]) {
    operations.push({
      op: "write_text",
      path: required(args, "write-text-file"),
      content: required(args, "write-text")
    });
  }
  if (args["replace-file"] || args["old-text"] || args["new-text"]) {
    operations.push({
      op: "replace_text",
      path: required(args, "replace-file"),
      old_text: required(args, "old-text"),
      new_text: required(args, "new-text")
    });
  }
  return operations;
}

function transitionKey(kind, value) {
  return `${kind}:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}


function loadPlanGraph(root, runId) { const plan = readJson(join(root, "runs", runId, "plan-graph.json"), null); if (!plan) throw new Error(`找不到 plan graph：${runId}`); return plan; }
function getPlanNode(plan, id) { const node = plan.nodes.find((item) => item.id === id); if (!node) throw new Error(`找不到 plan node：${id}`); return node; }
