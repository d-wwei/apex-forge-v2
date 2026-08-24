import { createHash } from "node:crypto";
import { join } from "node:path";
import { now, readJson, shortId, writeJson } from "../lib/common.mjs";
import { findPatch } from "./worker.mjs";

export function loadExecutionPolicy(root) {
  return readJson(join(root, "policies", "execution.json"));
}

export function assertPatchWithinBudget(root, patch) {
  const policy = loadExecutionPolicy(root);
  const changedFiles = patch.changed_files || [];
  if (changedFiles.length > policy.budgets.max_changed_files_per_patch) {
    throw new Error(`patch 超出文件预算：${changedFiles.length}/${policy.budgets.max_changed_files_per_patch}`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(patch.operations || []));
  if (bytes > policy.budgets.max_patch_bytes) {
    throw new Error(`patch 超出字节预算：${bytes}/${policy.budgets.max_patch_bytes}`);
  }
  return { changed_files: changedFiles.length, patch_bytes: bytes };
}

export function effectiveAgentTimeout(root, requestedMs, routeBudget = null) {
  const policy = loadExecutionPolicy(root);
  const routeLimit = routeBudget?.max_wall_minutes
    ? routeBudget.max_wall_minutes * 60000
    : Number.POSITIVE_INFINITY;
  return Math.min(requestedMs, policy.budgets.max_agent_duration_ms, routeLimit);
}

export function effectiveAgentLimit(root, requested) {
  const policy = loadExecutionPolicy(root);
  return Math.min(requested, policy.budgets.max_agent_runs_per_tick);
}

export function assertAdapterAllowed(root, adapter) {
  const policy = loadExecutionPolicy(root);
  if (!policy.permissions.allowed_adapters.includes(adapter)) {
    throw new Error(`execution policy 禁止 adapter：${adapter}`);
  }
}

export function evaluateMergeApproval(root, run, queue, candidateDigest = null) {
  const policy = loadExecutionPolicy(root);
  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  const changedFiles = Array.from(new Set(queue.items
    .filter((item) => item.status !== "dropped")
    .flatMap((item) => item.changed_files))).sort();
  const reasons = [];
  if (policy.permissions.merge_approval_risks.includes(roadmapNode?.risk)) {
    reasons.push(`risk=${roadmapNode.risk}`);
  }
  const sensitive = changedFiles.filter((file) =>
    policy.permissions.sensitive_paths.some((scope) => matchesScope(file, scope))
  );
  if (sensitive.length > 0) reasons.push(`sensitive_paths=${sensitive.join(",")}`);
  const capability = policy.approval.required_capabilities.merge;
  const policyRevision = stableHash(policy);
  const artifactHash = mergeArtifactHash(root, run.run_id, queue);
  const actionHash = stableHash({
    capability,
    run_id: run.run_id,
    candidate_digest: candidateDigest,
    changed_files: changedFiles,
    artifact_hash: artifactHash,
    policy_revision: policyRevision
  });
  const approvals = readJson(join(root, "approvals", "items.json"), []);
  const existing = approvals.find((item) =>
    item.kind === "merge"
    && item.run_id === run.run_id
    && item.action_hash === actionHash
    && !approvalExpired(item)
  );
  return {
    required: reasons.length > 0,
    reasons,
    changed_files: changedFiles,
    capability,
    fingerprint: actionHash,
    action_hash: actionHash,
    artifact_hash: artifactHash,
    policy_revision: policyRevision,
    candidate_digest: candidateDigest,
    approval: existing || null
  };
}

export function ensureMergeApproval(root, run, queue, candidateDigest = null) {
  const evaluation = evaluateMergeApproval(root, run, queue, candidateDigest);
  if (!evaluation.required) return { ...evaluation, allowed: true, created: false };
  if (approvalAllows(evaluation.approval, evaluation)) {
    return { ...evaluation, allowed: true, created: false };
  }
  if (evaluation.approval) {
    return { ...evaluation, allowed: false, created: false };
  }
  const timestamp = now();
  const approval = {
    schema_version: "v0",
    contract_version: "v1",
    revision: 1,
    id: shortId("approval"),
    kind: "merge",
    run_id: run.run_id,
    candidate_digest: evaluation.candidate_digest,
    capability: evaluation.capability,
    fingerprint: evaluation.fingerprint,
    action_hash: evaluation.action_hash,
    artifact_hash: evaluation.artifact_hash,
    policy_revision: evaluation.policy_revision,
    status: "pending",
    decision: null,
    reasons: evaluation.reasons,
    changed_files: evaluation.changed_files,
    requested_by: "apex-v2",
    requested_at: timestamp,
    expires_at: expiresAt(timestamp, loadExecutionPolicy(root).approval.ttl_minutes),
    decided_at: null,
    decided_by: null,
    decision_capabilities: [],
    decision_reason: ""
  };
  const path = join(root, "approvals", "items.json");
  const approvals = readJson(path, []);
  approvals.push(approval);
  writeJson(path, approvals);
  return { ...evaluation, approval, allowed: false, created: true };
}

export function decideApproval(root, id, decision, reason, options = {}) {
  const path = join(root, "approvals", "items.json");
  const approvals = readJson(path, []);
  const approval = approvals.find((item) => item.id === id);
  if (!approval) throw new Error(`找不到 approval：${id}`);
  if (approval.status !== "pending") throw new Error(`approval 已处理：${id}=${approval.status}`);
  if (approvalExpired(approval)) throw new Error(`approval 已过期：${id}`);
  const actor = options.actor || "unknown";
  const capabilities = Array.from(new Set(options.capabilities || []));
  if (!capabilities.includes(approval.capability)) {
    throw new Error(`缺少 approval capability：${approval.capability}`);
  }
  approval.status = "decided";
  approval.decision = decision;
  approval.decided_at = now();
  approval.decided_by = actor;
  approval.decision_capabilities = capabilities;
  approval.decision_reason = reason;
  writeJson(path, approvals);
  return approval;
}

export function ensureAdapterBaselineApproval(root, drift) {
  if (!drift.baseline_generated_at || drift.changes.length === 0) {
    return { required: false, allowed: true, created: false, approval: null };
  }
  const policy = loadExecutionPolicy(root);
  const capability = policy.approval.required_capabilities.adapter_baseline;
  const policyRevision = stableHash(policy);
  const artifactHash = stableHash(drift.changes);
  const fingerprint = stableHash({
    capability,
    artifact_hash: artifactHash,
    policy_revision: policyRevision
  });
  const path = join(root, "approvals", "items.json");
  const approvals = readJson(path, []);
  const existing = approvals.find((item) =>
    item.kind === "adapter_baseline"
    && item.action_hash === fingerprint
    && !approvalExpired(item)
  );
  const evaluation = {
    capability,
    action_hash: fingerprint,
    artifact_hash: artifactHash,
    policy_revision: policyRevision
  };
  if (approvalAllows(existing, evaluation)) return { required: true, allowed: true, created: false, approval: existing };
  if (existing) return { required: true, allowed: false, created: false, approval: existing };
  const timestamp = now();
  const approval = {
    schema_version: "v0",
    contract_version: "v1",
    revision: 1,
    id: shortId("approval"),
    kind: "adapter_baseline",
    run_id: "project",
    candidate_digest: null,
    capability,
    fingerprint,
    action_hash: fingerprint,
    artifact_hash: artifactHash,
    policy_revision: policyRevision,
    status: "pending",
    decision: null,
    reasons: drift.changes.map((change) => `${change.adapter}:${change.kind}`),
    changed_files: drift.changes.map((change) => change.adapter),
    requested_by: "apex-v2",
    requested_at: timestamp,
    expires_at: expiresAt(timestamp, policy.approval.ttl_minutes),
    decided_at: null,
    decided_by: null,
    decision_capabilities: [],
    decision_reason: ""
  };
  approvals.push(approval);
  writeJson(path, approvals);
  return { required: true, allowed: false, created: true, approval };
}

export function migrateApprovalRecords(root) {
  const path = join(root, "approvals", "items.json");
  const approvals = readJson(path, []);
  let changed = false;
  for (const item of approvals) {
    if (item.contract_version === "v1") continue;
    const capability = item.kind === "merge" ? "merge_apply" : "adapter_baseline_update";
    item.contract_version = "v1";
    item.revision = 1;
    item.capability = capability;
    item.action_hash = item.fingerprint;
    item.artifact_hash = item.fingerprint;
    item.policy_revision = "legacy";
    item.candidate_digest = null;
    item.requested_by = "apex-v2-legacy";
    item.expires_at = item.decided_at || item.requested_at;
    item.decision_capabilities = [];
    changed = true;
  }
  if (changed) writeJson(path, approvals);
  return { changed, approvals };
}

function approvalAllows(approval, evaluation) {
  return Boolean(
    approval
    && approval.decision === "approved"
    && !approvalExpired(approval)
    && approval.capability === evaluation.capability
    && approval.action_hash === evaluation.action_hash
    && approval.artifact_hash === evaluation.artifact_hash
    && approval.policy_revision === evaluation.policy_revision
    && approval.candidate_digest === (evaluation.candidate_digest ?? null)
    && approval.decision_capabilities.includes(evaluation.capability)
  );
}

function approvalExpired(approval) {
  return !approval?.expires_at || Date.parse(approval.expires_at) <= Date.now();
}

function expiresAt(timestamp, ttlMinutes) {
  return new Date(Date.parse(timestamp) + ttlMinutes * 60000).toISOString();
}

function mergeArtifactHash(root, runId, queue) {
  const patches = queue.items
    .filter((item) => item.status !== "dropped")
    .map((item) => ({
      patch_id: item.patch_id,
      hash: stableHash(findPatch(root, runId, item.patch_id))
    }))
    .sort((left, right) => left.patch_id.localeCompare(right.patch_id));
  return stableHash(patches);
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function matchesScope(file, scope) {
  if (scope.endsWith("/")) return file.startsWith(scope);
  if (scope.includes("*")) {
    const [prefix, suffix] = scope.split("*");
    return file.startsWith(prefix) && file.endsWith(suffix || "");
  }
  return file === scope;
}
