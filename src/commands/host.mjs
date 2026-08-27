import { existsSync, readFileSync } from "node:fs";
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
import {
  validateWorkerSemanticEvidence
} from "../core/semantic-evidence.mjs";
import {
  assertCapabilityContextBudget,
  readCapabilityProtocol
} from "../core/capability-registry.mjs";
import { assertCapabilityEvidence } from "../core/capability-evidence.mjs";
import {
  normalizeEvidenceSubmission,
  persistUnifiedEvidence
} from "../core/evidence-artifact.mjs";
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
        semanticEvidence: parseSemanticEvidence(args),
        capabilityEvidence: parseCapabilityEvidence(args),
        evidenceArtifact: parseEvidenceArtifact(args)
      }
    ), null, 2));
    return;
  }
  if (subcommand === "submit-current") {
    const root = requireStore(projectRoot(args));
    const hostId = required(args, "host-id");
    const claimed = listHostActions(root).filter((action) =>
      action.status === "claimed"
      && action.claimed_by === hostId
      && !action.claim_expired
    );
    if (claimed.length !== 1) {
      throw new Error(
        `host submit-current 需要恰好一个有效 claim，当前 ${claimed.length} 个`
      );
    }
    const worker = findWorker(root, claimed[0].worker_id);
    console.log(JSON.stringify(submitHostResult(
      root,
      worker.worker_id,
      hostId,
      {
        summary: required(args, "summary"),
        refs: splitList(args.refs),
        claimToken: worker.claim_token,
        semanticEvidence: parseSemanticEvidence(args),
        capabilityEvidence: parseCapabilityEvidence(args),
        evidenceArtifact: parseEvidenceArtifact(args)
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
        capability_bindings: worker.capability_bindings || [],
        capability_enforcement: worker.capability_enforcement || "shadow",
        capability_invocation_refs: worker.capability_invocation_refs || [],
        capability_protocols: capabilityProtocols(worker.capability_bindings || []),
        read_scope: worker.read_scope,
        write_scope: worker.write_scope,
        output_contract: worker.output_contract,
        evidence_format: worker.evidence_format || "legacy-v1",
        model_tier: worker.model_tier || null,
      ...reviewActionContext(root, worker),
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

function reviewActionContext(root, worker) {
  if (!worker.plan_node_id.endsWith("review")) {
    return {
      candidate_digest: null,
      verification_ref: null,
      patch_refs: [],
      risk_refs: []
    };
  }
  const run = loadRun(root, worker.run_id);
  const queue = readJson(join(root, "runs", worker.run_id, "merge-queue.json"), {
    schema_version: SCHEMA_VERSION,
    run_id: worker.run_id,
    updated_at: now(),
    items: [],
    conflicts: [],
    resolutions: []
  });
  return {
    candidate_digest: buildCandidateSet(
      root,
      run,
      queue,
      resolve(root, "..")
    ).candidate_digest,
    verification_ref: `.apex-v2/runs/${worker.run_id}/verification-report.json`,
    patch_refs: queue.items
      .filter((item) => item.status !== "dropped")
      .map((item) =>
        `.apex-v2/runs/${worker.run_id}/workers/${item.worker_id}/patches/${item.patch_id}/patch-bundle.json`
      ),
    risk_refs: [`.apex-v2/risks/register.json`]
  };
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
      objective: worker.objective,
      evidence_format: worker.evidence_format || "legacy-v1",
      ...reviewActionContext(root, worker),
      capability_bindings: worker.capability_bindings || [],
      capability_enforcement: worker.capability_enforcement || "shadow",
      capability_invocation_refs: worker.capability_invocation_refs || [],
      capability_protocols: capabilityProtocols(worker.capability_bindings || [])
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

function capabilityProtocols(bindings) {
  assertCapabilityContextBudget(bindings);
  return bindings.map((binding) => ({
    capability_id: binding.capability_id,
    capability_version: binding.capability_version,
    required_host_capabilities: binding.required_host_capabilities,
    input_contract: binding.input_contract,
    output_contract: binding.output_contract,
    protocol: readCapabilityProtocol(binding.protocol_ref)
  }));
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
  const submissionAttempt = Number(worker.attempt || 0) + 1;
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  let patch = null;
  let queueStatus = null;
  let semanticEvidenceRef = null;
  const normalizedEvidence = normalizeEvidenceSubmission(worker, {
    ...input,
    timestamp
  });
  const capabilityEvidence = normalizedEvidence.capabilityEvidence;
  const capabilityStatus = assertCapabilityEvidence(
    worker.capability_bindings || [],
    capabilityEvidence,
    { requireAll: worker.capability_enforcement === "enforce" }
  );
  const capabilityEvidenceRefs = persistCapabilityEvidence(
    dir,
    worker.namespace,
    capabilityEvidence,
    submissionAttempt
  );
  if (worker.execution_class === "workspace_patch") {
    patch = buildHostPatch(root, worker, input.summary, timestamp);
  } else {
    const semanticEvidence = validateWorkerSemanticEvidence(
      root,
      worker,
      normalizedEvidence.semanticEvidence
    );
    semanticEvidenceRef = persistSemanticEvidence(
      dir,
      worker.namespace,
      semanticEvidence,
      submissionAttempt
    );
  }
  const unified = persistUnifiedEvidence(root, worker, {
    actionId: action.action_id,
    success: true,
    semanticEvidence: normalizedEvidence.semanticEvidence,
    capabilityEvidence,
    capabilityValidation: {
      valid: true
    },
    patch,
    evidenceRefs: [
      ...(input.refs || []),
      ...(patch?.changed_files || []),
      ...(normalizedEvidence.semanticEvidence?.source_refs || []),
      ...capabilityEvidenceRefs
    ],
    executor: "host",
    model: worker.model_id || null,
    attempt: submissionAttempt,
    timestamp
  });
  const result = {
    schema_version: SCHEMA_VERSION,
    action_id: action.action_id,
    host_id: hostId,
    status: "completed",
    summary: input.summary,
    artifact_refs: [
      ...(input.refs || []),
      ...(patch?.changed_files || []),
      ...(normalizedEvidence.semanticEvidence?.source_refs || []),
      ...capabilityEvidenceRefs,
      unified.evidenceArtifactRef,
      ...unified.capabilityReceiptRefs
    ],
    semantic_evidence_ref: semanticEvidenceRef,
    capability_evidence_refs: capabilityEvidenceRefs,
    evidence_artifact_ref: unified.evidenceArtifactRef,
    capability_receipt_refs: unified.capabilityReceiptRefs,
    submission_format: normalizedEvidence.submissionFormat,
    capability_evidence_status: {
      enforcement: worker.capability_enforcement || "shadow",
      submitted: capabilityStatus.submitted,
      missing: capabilityStatus.missing
    },
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
        ...capabilityEvidenceRefs,
        ...patch.changed_files
      ],
      timestamp
    });
    worker.status = "patch_submitted";
    worker.attempt = submissionAttempt;
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
    worker.attempt = submissionAttempt;
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

function persistCapabilityEvidence(dir, namespace, evidenceItems, attempt) {
  return evidenceItems.map((evidence) => {
    const name = [
      "capability-evidence",
      `attempt-${attempt}`,
      evidence.capability_id
    ].join("-") + ".json";
    writeJson(join(dir, name), evidence);
    const legacyAlias = join(
      dir,
      `capability-evidence-${evidence.capability_id}.json`
    );
    if (!existsSync(legacyAlias)) writeJson(legacyAlias, evidence);
    return `${namespace}/${name}`;
  });
}

function persistSemanticEvidence(dir, namespace, evidence, attempt) {
  const name = `cognitive-evidence-attempt-${attempt}.json`;
  writeJson(join(dir, name), evidence);
  const legacyAlias = join(dir, "cognitive-evidence.json");
  if (!existsSync(legacyAlias)) writeJson(legacyAlias, evidence);
  return `${namespace}/${name}`;
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

function parseEvidenceArtifact(args) {
  const inline = args["evidence-artifact-json"];
  const file = args["evidence-artifact-file"];
  if (!inline && !file) return null;
  if (inline && file) {
    throw new Error(
      "只能指定 --evidence-artifact-json 或 --evidence-artifact-file 之一"
    );
  }
  try {
    return JSON.parse(
      file ? readFileSync(resolve(String(file)), "utf8") : String(inline)
    );
  } catch (error) {
    throw new Error(`evidence artifact JSON 无效：${error.message}`);
  }
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
