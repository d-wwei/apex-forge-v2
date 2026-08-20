import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
  collectActionWorkspaceChanges,
  createActionWorkspace,
  discardActionWorkspace,
  markActionWorkspaceSubmitted
} from "../core/action-workspace.mjs";
import { buildCandidateSet } from "../core/candidate.mjs";
import { assertCognitiveEvidenceSemantics } from "../core/cognitive-evidence.mjs";
import { withProjectTransaction } from "../core/project-transaction.mjs";
import {
  findWorker,
  getWorkers,
  patchBundleRef,
  persistPatchBundle,
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
        refs: splitList(args.refs),
        claimToken: required(args, "claim-token"),
        semanticEvidence: parseSemanticEvidence(args)
      }
    ), null, 2));
    return;
  }
  if (subcommand === "cancel") {
    console.log(JSON.stringify(cancelHostAction(
      requireStore(projectRoot(args)),
      required(args, "worker-id"),
      required(args, "host-id"),
      required(args, "claim-token"),
      String(args.reason || "host cancelled action")
    ), null, 2));
    return;
  }
  throw new Error(`未知 host 子命令：${subcommand || "(空)"}`);
}

export function listHostActions(root) {
  const project = readJson(join(root, "project.json"));
  const workspacePatchEnabled = interactiveWorkspacePatchEnabled(root);
  return project.active_runs.flatMap((runId) =>
    getWorkers(root, runId)
      .filter((worker) =>
        worker.preferred_mode === "interactive"
        && ["cognitive", "workspace_patch"].includes(worker.execution_class)
        && ["active", "claimed"].includes(worker.status)
        && (
          worker.execution_class !== "workspace_patch"
          || workspacePatchEnabled
          || worker.status === "claimed"
        )
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
        output_contract: worker.output_contract,
        candidate_digest: reviewCandidateDigest(root, worker),
        lease_expires_at: worker.claim_expires_at || null,
        fencing_token: worker.fencing_token || 0,
        claim_expired: worker.status === "claimed" && claimExpired(worker),
        workspace_path: readJson(
          join(workerDir(root, worker.run_id, worker.worker_id), "action-workspace.json"),
          null
        )?.workspace_path || null
      }))
  );
}

function reviewCandidateDigest(root, worker) {
  if (!worker.plan_node_id.endsWith("review")) return null;
  const run = loadRun(root, worker.run_id);
  const queue = readJson(join(root, "runs", worker.run_id, "merge-queue.json"), {
    schema_version: SCHEMA_VERSION,
    run_id: worker.run_id,
    updated_at: now(),
    items: [],
    conflicts: [],
    resolutions: []
  });
  return buildCandidateSet(root, run, queue, resolve(root, "..")).candidate_digest;
}

export function claimHostAction(root, workerId, hostId) {
  const worker = findWorker(root, workerId);
  if (worker.status === "claimed" && !claimExpired(worker) && worker.claimed_by === hostId) {
    return existingHostClaim(root, worker);
  }
  const nextFencingToken = Number(worker.fencing_token || 0) + 1;
  return withProjectTransaction(resolve(root, ".."), {
    kind: "host-claim",
    idempotencyKey: `host-claim:${workerId}:${hostId}:${nextFencingToken}`
  }, () => claimHostActionTransaction(root, workerId, hostId)).result;
}

function claimHostActionTransaction(root, workerId, hostId) {
  const worker = findWorker(root, workerId);
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  if (
    worker.preferred_mode !== "interactive"
    || !["cognitive", "workspace_patch"].includes(worker.execution_class)
  ) {
    throw new Error(`worker 不是可 claim 的 Interactive Host action：${worker.worker_id}`);
  }
  if (worker.status === "claimed" && !claimExpired(worker) && worker.claimed_by !== hostId) {
    throw new Error(`worker 已被其他 host claim：${worker.claimed_by}`);
  }
  if (worker.status === "claimed" && !claimExpired(worker) && worker.claimed_by === hostId) {
    return existingHostClaim(root, worker);
  }
  if (!["active", "claimed"].includes(worker.status)) {
    throw new Error(`worker 当前状态不可 claim：${worker.status}`);
  }
  if (worker.execution_class === "workspace_patch") {
    if (!interactiveWorkspacePatchEnabled(root)) {
      throw new Error("execution policy 已禁用 Interactive workspace_patch；请使用 Factory Mode 或重新启用。");
    }
    const claimedPatch = listHostActions(root).find((item) =>
      item.status === "claimed"
      && !item.claim_expired
      && item.worker_id !== worker.worker_id
      && findWorker(root, item.worker_id).execution_class === "workspace_patch"
    );
    if (claimedPatch) {
      throw new Error(`已有 workspace_patch action 被 claim：${claimedPatch.worker_id}`);
    }
  }
  const project = readJson(join(root, "project.json"));
  const timestamp = now();
  const leaseSeconds = readJson(join(root, "policies", "execution.json"))
    .interactive_host_claim?.lease_seconds || 1800;
  const claimToken = shortId("claim");
  const fencingToken = Number(worker.fencing_token || 0) + 1;
  const leaseExpiresAt = new Date(Date.parse(timestamp) + leaseSeconds * 1000).toISOString();
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
    claim_token: claimToken,
    fencing_token: fencingToken,
    lease_expires_at: leaseExpiresAt,
    created_at: timestamp
  };
  let workspace = null;
  if (worker.execution_class === "workspace_patch") {
    workspace = createActionWorkspace(root, worker, action.action_id);
    action.payload.workspace_path = workspace.workspace_path;
    action.payload.base_fingerprint = workspace.base_fingerprint;
  }
  const validation = validateContract("host-action.schema.json", action, `${worker.namespace}/host-action.json`);
  if (!validation.valid) {
    if (workspace) discardActionWorkspace(resolve(root, ".."), workspace, "failed");
    throw new Error(`host action contract 无效：${JSON.stringify(validation.errors)}`);
  }
  if (worker.adapter !== "host") {
    worker.factory_executor_id = worker.executor_id || worker.adapter;
    worker.adapter = "host";
    worker.executor_id = "host";
  }
  worker.status = "claimed";
  worker.claimed_by = hostId;
  worker.claimed_at = timestamp;
  worker.claim_token = claimToken;
  worker.claim_expires_at = leaseExpiresAt;
  worker.fencing_token = fencingToken;
  worker.updated_at = timestamp;
  writeJson(join(dir, "host-action.json"), action);
  writeJson(join(dir, "worker.json"), worker);
  const event = appendEvent(root, "worker.host.claimed", hostId, {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    action_id: action.action_id,
    fencing_token: fencingToken
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { action, worker, workspace };
}

export function submitHostResult(root, workerId, hostId, input) {
  const worker = findWorker(root, workerId);
  const action = readJson(
    join(workerDir(root, worker.run_id, worker.worker_id), "host-action.json"),
    null
  );
  if (!action) throw new Error(`Host action 缺失：${worker.worker_id}`);
  return withProjectTransaction(resolve(root, ".."), {
    kind: "host-submit",
    idempotencyKey: `host-submit:${action.action_id}:${input.claimToken}`
  }, () => submitHostResultTransaction(root, workerId, hostId, input)).result;
}

function submitHostResultTransaction(root, workerId, hostId, input) {
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
  const action = readJson(join(workerDir(root, worker.run_id, worker.worker_id), "host-action.json"));
  assertActiveClaim(worker, action, input.claimToken);
  const timestamp = now();
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  let patch = null;
  let queueStatus = null;
  let semanticEvidenceRef = null;
  if (worker.execution_class === "workspace_patch") {
    patch = buildHostPatch(root, worker, input.summary, timestamp);
  } else {
    const semanticEvidence = validateSemanticEvidence(root, worker, input.semanticEvidence);
    semanticEvidenceRef = `${worker.namespace}/cognitive-evidence.json`;
    writeJson(join(dir, "cognitive-evidence.json"), semanticEvidence);
  }
  const result = {
    schema_version: SCHEMA_VERSION,
    action_id: action.action_id,
    host_id: hostId,
    status: "completed",
    summary: input.summary,
    artifact_refs: [
      ...(input.refs || []),
      ...(patch?.changed_files || []),
      ...(input.semanticEvidence?.source_refs || [])
    ],
    semantic_evidence_ref: semanticEvidenceRef,
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
        patchBundleRef(worker, patch.patch_id),
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
      refs: [
        `${worker.namespace}/host-action.json`,
        `${worker.namespace}/host-result.json`,
        semanticEvidenceRef,
        ...result.artifact_refs
      ].filter(Boolean),
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

export function cancelHostAction(root, workerId, hostId, claimToken, reason) {
  const worker = findWorker(root, workerId);
  const action = readJson(
    join(workerDir(root, worker.run_id, worker.worker_id), "host-action.json"),
    null
  );
  if (!action) throw new Error(`Host action 缺失：${worker.worker_id}`);
  return withProjectTransaction(resolve(root, ".."), {
    kind: "host-cancel",
    idempotencyKey: `host-cancel:${action.action_id}:${claimToken}`
  }, () => cancelHostActionTransaction(
    root,
    workerId,
    hostId,
    claimToken,
    reason
  )).result;
}

function cancelHostActionTransaction(root, workerId, hostId, claimToken, reason) {
  const worker = findWorker(root, workerId);
  if (worker.status !== "claimed" || worker.claimed_by !== hostId) {
    throw new Error(`worker 必须由当前 host claim 后才能 cancel：${worker.worker_id}`);
  }
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const action = readJson(join(dir, "host-action.json"));
  assertActiveClaim(worker, action, claimToken);
  const workspace = readJson(join(dir, "action-workspace.json"), null);
  if (workspace) discardActionWorkspace(resolve(root, ".."), workspace, "cancelled");
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
  const manifestPath = join(workerDir(root, worker.run_id, worker.worker_id), "action-workspace.json");
  const workspace = readJson(manifestPath, null);
  if (!workspace) throw new Error(`ActionWorkspace 缺失：${worker.worker_id}`);
  const changes = collectActionWorkspaceChanges(projectDir, workspace);
  if (changes.out_of_scope_files.length > 0) {
    throw new Error(`Interactive Host 修改超出 write_scope：${changes.out_of_scope_files.join(", ")}`);
  }
  if (changes.unsupported_files.length > 0) {
    throw new Error(`Interactive Host 包含不支持的修改：${changes.unsupported_files.join(", ")}`);
  }
  if (changes.operations.length === 0) {
    throw new Error(`Interactive Host 未产生 patch：${worker.worker_id}`);
  }
  const patch = {
    schema_version: SCHEMA_VERSION,
    patch_id: shortId("patch"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    summary,
    changed_files: changes.changed_files,
    operations: changes.operations,
    evidence_refs: [],
    status: "submitted",
    created_at: timestamp,
    updated_at: timestamp
  };
  assertPatchWithinBudget(root, patch);
  persistPatchBundle(root, patch);
  markActionWorkspaceSubmitted(projectDir, workspace);
  return patch;
}

function interactiveWorkspacePatchEnabled(root) {
  const policy = readJson(join(root, "policies", "execution.json"), {});
  return policy.interactive_workspace_patch?.enabled === true;
}

function existingHostClaim(root, worker) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const existingAction = readJson(join(dir, "host-action.json"), null);
  if (!existingAction) throw new Error(`已 claim worker 缺少 host action：${worker.worker_id}`);
  return {
    action: existingAction,
    worker,
    workspace: readJson(join(dir, "action-workspace.json"), null)
  };
}

function parseSemanticEvidence(args) {
  const inline = args["evidence-json"];
  const file = args["evidence-file"];
  if (!inline && !file) return null;
  if (inline && file) throw new Error("只能指定 --evidence-json 或 --evidence-file 之一");
  try {
    return JSON.parse(file ? readFileSync(resolve(String(file)), "utf8") : String(inline));
  } catch (error) {
    throw new Error(`semantic evidence JSON 无效：${error.message}`);
  }
}

function validateSemanticEvidence(root, worker, evidence) {
  if (!evidence) {
    throw new Error(`cognitive action 必须提交 typed semantic evidence：${worker.plan_node_id}`);
  }
  const expectedType = cognitiveEvidenceType(worker.plan_node_id);
  if (evidence.evidence_type !== expectedType) {
    throw new Error(`cognitive evidence 类型不匹配：${evidence.evidence_type} != ${expectedType}`);
  }
  if (evidence.objective !== worker.objective) {
    throw new Error("cognitive evidence objective 必须与 Host action 一致");
  }
  if (expectedType === "review") {
    const run = loadRun(root, worker.run_id);
    const queue = readJson(join(root, "runs", worker.run_id, "merge-queue.json"), {
      schema_version: SCHEMA_VERSION,
      run_id: worker.run_id,
      updated_at: now(),
      items: [],
      conflicts: [],
      resolutions: []
    });
    const current = buildCandidateSet(root, run, queue, resolve(root, ".."));
    if (evidence.candidate_digest !== current.candidate_digest) {
      throw new Error("review evidence 未绑定当前 candidate_digest");
    }
  }
  const validation = validateContract(
    "cognitive-evidence.schema.json",
    evidence,
    `${worker.namespace}/cognitive-evidence.json`
  );
  if (!validation.valid) {
    throw new Error(`cognitive evidence contract 无效：${JSON.stringify(validation.errors)}`);
  }
  assertCognitiveEvidenceSemantics(evidence);
  return evidence;
}

function cognitiveEvidenceType(planNodeId) {
  if (planNodeId.endsWith("context")) return "context";
  if (planNodeId.endsWith("risk")) return "risk";
  if (planNodeId.endsWith("design")) return "design";
  if (planNodeId.endsWith("review")) return "review";
  throw new Error(`未知 cognitive evidence 类型：${planNodeId}`);
}

function assertActiveClaim(worker, action, claimToken) {
  if (!claimToken || claimToken !== worker.claim_token || claimToken !== action.claim_token) {
    throw new Error(`Host claim token 无效：${worker.worker_id}`);
  }
  if (worker.fencing_token !== action.fencing_token) {
    throw new Error(`Host fencing token 已失效：${worker.worker_id}`);
  }
  if (claimExpired(worker) || Date.parse(action.lease_expires_at) <= Date.now()) {
    throw new Error(`Host claim lease 已过期：${worker.worker_id}`);
  }
}

function claimExpired(worker) {
  return !worker.claim_expires_at || Date.parse(worker.claim_expires_at) <= Date.now();
}
