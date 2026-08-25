import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import {
  normalizeExecutorInspection
} from "../contracts/worker-executor.mjs";
import {
  getWorkerExecutor,
  resolveWorkerExecutor
} from "../executors/registry.mjs";
import {
  now,
  readJson,
  shortId,
  splitList,
  writeJson
} from "../lib/common.mjs";
import { createArtifact } from "./artifacts.mjs";
import { validateContract } from "./contracts.mjs";
import { loadRun } from "./run-state.mjs";
import { assertPatchWithinBudget } from "./governance.mjs";
import { loadExecutionPolicy } from "./governance.mjs";
import { appendEvent, SCHEMA_VERSION, updateProject } from "./store.mjs";
import { withProjectTransaction } from "./project-transaction.mjs";
import { schemaPath } from "./schema-paths.mjs";
import { evaluateRouteUsage } from "./execution-router.mjs";
import {
  assertCapabilityContextBudget,
  readCapabilityProtocol
} from "./capability-registry.mjs";
import { assertCapabilityEvidence } from "./capability-evidence.mjs";
import {
  findWorker,
  isFileAllowedByScope,
  patchBundleRef,
  persistPatchBundle,
  workerDir
} from "./worker.mjs";
import { resolveModelSelection } from "./model-routing.mjs";
import {
  cognitiveEvidenceCandidateDigest,
  cognitiveEvidenceType,
  validateWorkerSemanticEvidence
} from "./semantic-evidence.mjs";

const AGENT_RESULT_SCHEMA = schemaPath("agent-result.schema.json");
const PROVIDER_AGENT_RESULT_SCHEMA = schemaPath("agent-result-provider.schema.json");
const IGNORED_WORKSPACE_NAMES = new Set([
  ".git",
  ".apex-agent",
  ".apex-host-home",
  ".claude",
  ".codex",
  ".gemini",
  ".apex-v2",
  ".apex-v2.lock",
  ".apex-v2.scheduler-lock",
  ".apex-v2.transaction-backups",
  "node_modules",
  "sandbox.json"
]);
const ALLOWED_CONTEXT_ROOTS = new Set([
  "project.json",
  "events.jsonl",
  "intake",
  "roadmap",
  "knowledge",
  "risks",
  "policies",
  "learning"
]);

export function executeWorkerExecutor(root, worker, planNode, options = {}) {
  if (!worker.sandbox || worker.sandbox.status !== "ready") {
    throw new Error(`coding-agent adapter 要求 ready sandbox：${worker.worker_id}`);
  }
  const executionClaimToken = options.executionClaimToken || null;
  const expectedStatus = executionClaimToken ? "running" : "active";
  if (
    worker.status !== expectedStatus
    || (
      executionClaimToken
      && worker.execution_claim_token !== executionClaimToken
    )
  ) {
    throw new Error(`worker 当前状态不可执行 coding-agent adapter：${worker.status}`);
  }

  const projectDir = resolve(root, "..");
  const workspaceDir = resolve(projectDir, worker.sandbox.path);
  if (!existsSync(workspaceDir)) {
    throw new Error(`worker sandbox 不存在：${workspaceDir}`);
  }

  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const promptPath = join(dir, "agent-prompt.md");
  const outputPath = join(workspaceDir, ".apex-agent", `result-${worker.worker_id}.json`);
  const prompt = buildWorkerAgentPrompt(worker, planNode, {
    semanticEvidenceType: worker.execution_class === "cognitive"
      ? cognitiveEvidenceType(worker.plan_node_id)
      : null,
    candidateDigest: worker.execution_class === "cognitive"
      ? cognitiveEvidenceCandidateDigest(root, worker)
      : null
  });
  writeFileSync(promptPath, prompt);
  rmSync(outputPath, { force: true });
  const protectedBefore = snapshotProtectedWorkspace(workspaceDir);

  const policy = loadExecutionPolicy(root);
  const preferred = options.adapter
    || worker.executor_id
    || worker.adapter
    || policy.permissions.adapter_fallback_order[0];
  const requiredCapabilities = options.requiredCapabilities || worker.required_capabilities || [];
  const resolved = options.command
    ? customExecutorResolution(preferred, options.command)
    : resolveWorkerExecutor(
      preferred,
      policy.permissions.adapter_fallback_order || [],
      policy.permissions.allowed_adapters,
      requiredCapabilities
    );
  const adapterInfo = resolved.info;
  const priorResults = readPriorAdapterResults(dir);
  const route = readJson(join(dir, "execution-route.json"), null);
  const modelSelection = resolveModelSelection({
    planNode,
    executionPolicy: policy,
    adapter: resolved.name,
    requestedModel: options.model || null,
    worker,
    route,
    priorResults
  });
  const modelChanged = worker.model_tier !== modelSelection.model_tier
    || worker.model_id !== modelSelection.model_id;
  const sessionId = modelChanged ? undefined : options.sessionId;
  const execution = resolved.executor.execute({
    executable: options.command || resolved.name,
    workspaceDir,
    prompt,
    outputSchemaPath: PROVIDER_AGENT_RESULT_SCHEMA,
    outputPath,
    model: modelSelection.model_id,
    profile: options.profile,
    timeoutMs: options.timeoutMs,
    sessionId
  });
  const structured = readAgentResult(outputPath);
  const rawAgentOutput = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  rmSync(outputPath, { force: true });
  const changes = collectWorkspaceChanges(projectDir, workspaceDir, worker.write_scope);
  const protectedChanges = diffProtectedWorkspace(protectedBefore, snapshotProtectedWorkspace(workspaceDir));
  changes.changed_files = Array.from(new Set([...changes.changed_files, ...protectedChanges])).sort();
  changes.out_of_scope_files = Array.from(new Set([...changes.out_of_scope_files, ...protectedChanges])).sort();
  const capabilityEvidence = structured.valid
    ? structured.value.capability_evidence || []
    : [];
  let semanticEvidence = null;
  let semanticEvidenceError = "";
  if (structured.valid && worker.execution_class === "cognitive") {
    try {
      semanticEvidence = validateWorkerSemanticEvidence(
        root,
        worker,
        structured.value.semantic_evidence
      );
    } catch (error) {
      semanticEvidenceError = error.message;
    }
  }
  let capabilityEvidenceValidation = {
    valid: true,
    required: [],
    submitted: [],
    missing: [],
    error: ""
  };
  if (structured.valid) {
    try {
      capabilityEvidenceValidation = {
        valid: true,
        ...assertCapabilityEvidence(
          worker.capability_bindings || [],
          capabilityEvidence,
          { requireAll: worker.capability_enforcement === "enforce" }
        ),
        error: ""
      };
    } catch (error) {
      capabilityEvidenceValidation = {
        valid: false,
        required: [],
        submitted: [],
        missing: [],
        error: error.message
      };
    }
  }
  const costEvaluation = evaluateRouteUsage(route, execution);
  const budgetFailed = costEvaluation.status === "FAIL"
    || (costEvaluation.status === "UNKNOWN" && route?.usage_policy === "fail");
  const success = execution.exit_code === 0
    && structured.valid
    && structured.value.verdict === "pass"
    && changes.out_of_scope_files.length === 0
    && changes.unsupported_files.length === 0
    && !budgetFailed
    && capabilityEvidenceValidation.valid
    && semanticEvidenceError === ""
    && (worker.output_contract !== "patch" || changes.operations.length > 0);
  const failureKind = success
    ? null
    : budgetFailed
      ? "budget_exceeded"
      : !capabilityEvidenceValidation.valid
      ? "contract_error"
      : semanticEvidenceError
        ? "contract_error"
      : classifyFailure(execution, structured, changes, worker);
  const timestamp = now();
  const adapterResult = {
    schema_version: SCHEMA_VERSION,
    result_id: shortId("adapter"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    adapter: resolved.name,
    executor_id: resolved.id,
    adapter_version: adapterInfo.version,
    model_tier: modelSelection.model_tier,
    requested_model: modelSelection.model_id,
    reported_model: execution.reported_model || null,
    session_id: execution.session_id || null,
    executable: execution.executable,
    status: success ? "PASS" : "FAIL",
    failure_kind: failureKind,
    command: execution.command,
    summary: structured.value?.summary || (success ? "worker executor completed" : "worker executor failed"),
    exit_code: execution.exit_code,
    duration_ms: execution.duration_ms,
    stdout_tail: execution.stdout_tail,
    stderr_tail: execution.stderr_tail,
    changed_files: changes.changed_files,
    out_of_scope_files: changes.out_of_scope_files,
    unsupported_files: changes.unsupported_files,
    usage: execution.usage || {
      input_tokens: null,
      output_tokens: null,
      tool_calls: null
    },
    cost_evaluation: costEvaluation,
    capability_evidence_status: {
      enforcement: worker.capability_enforcement || "shadow",
      submitted: capabilityEvidenceValidation.submitted,
      missing: capabilityEvidenceValidation.missing,
      error: capabilityEvidenceValidation.error
    },
    semantic_evidence_status: {
      required: worker.execution_class === "cognitive",
      valid: semanticEvidenceError === "",
      error: semanticEvidenceError
    },
    refs: [
      `${worker.namespace}/agent-prompt.md`,
      structured.valid
        ? `${worker.namespace}/agent-result.json`
        : `${worker.namespace}/agent-output-invalid.txt`
    ],
    created_at: timestamp
  };
  let patch = null;
  if (success && changes.operations.length > 0) {
    patch = {
      schema_version: SCHEMA_VERSION,
      patch_id: shortId("patch"),
      worker_id: worker.worker_id,
      run_id: worker.run_id,
      plan_node_id: worker.plan_node_id,
      summary: structured.value.summary,
      changed_files: changes.changed_files,
      operations: changes.operations,
      evidence_refs: splitList(structured.value.evidence_refs),
      status: "submitted",
      created_at: timestamp,
      updated_at: timestamp
    };
    assertPatchWithinBudget(root, patch);
  }

  const expectedWorkerUpdatedAt = worker.updated_at;
  return withProjectTransaction(projectDir, {
    kind: "worker-execution-commit",
    idempotencyKey: [
      "worker-execution-commit",
      worker.worker_id,
      Number(worker.attempt || 0) + 1,
      resolved.id
    ].join(":")
  }, () => commitWorkerExecution(root, {
    workerId: worker.worker_id,
    executionClaimToken,
    expectedWorkerStatus: expectedStatus,
    expectedWorkerUpdatedAt,
    adapterResult,
    patch,
    success,
    structured,
    changes,
    execution,
    resolved,
    modelSelection,
    modelChanged,
    semanticEvidence,
    rawAgentOutput,
    capabilityEvidence,
    timestamp
  })).result;
}

function commitWorkerExecution(root, input) {
  const worker = findWorker(root, input.workerId);
  if (
    worker.status !== input.expectedWorkerStatus
    || worker.updated_at !== input.expectedWorkerUpdatedAt
    || (
      input.executionClaimToken
      && worker.execution_claim_token !== input.executionClaimToken
    )
  ) {
    throw new Error(`worker execution commit 遇到并发状态变化：${worker.worker_id}`);
  }
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const capabilityEvidenceRefs = persistCapabilityEvidence(
    dir,
    worker.namespace,
    input.capabilityEvidence
  );
  let semanticEvidenceRef = null;
  if (input.semanticEvidence) {
    semanticEvidenceRef = `${worker.namespace}/cognitive-evidence.json`;
    writeJson(join(dir, "cognitive-evidence.json"), input.semanticEvidence);
  }
  input.adapterResult.refs = Array.from(new Set([
    ...input.adapterResult.refs,
    ...capabilityEvidenceRefs,
    ...(semanticEvidenceRef ? [semanticEvidenceRef] : [])
  ]));
  if (input.structured.valid) {
    writeFileSync(
      join(dir, "agent-result.json"),
      input.rawAgentOutput || `${JSON.stringify(input.structured.value)}\n`
    );
    rmSync(join(dir, "agent-output-invalid.txt"), { force: true });
  } else {
    rmSync(join(dir, "agent-result.json"), { force: true });
    writeFileSync(
      join(dir, "agent-output-invalid.txt"),
      input.rawAgentOutput || input.adapterResult.stderr_tail || "missing structured output"
    );
  }
  writeJson(join(dir, `adapter-result-${input.adapterResult.result_id}.json`), input.adapterResult);
  const run = loadRun(root, worker.run_id);
  let artifact;
  if (input.patch) {
    persistPatchBundle(root, input.patch);
    worker.status = "patch_submitted";
    artifact = createArtifact(root, run, "execute", {
      type: "patch",
      title: `${input.resolved.name}Patch：${worker.plan_node_id}`,
      body: input.structured.value.summary,
      refs: [
        patchBundleRef(worker, input.patch.patch_id),
        `${worker.namespace}/agent-result.json`,
        ...capabilityEvidenceRefs,
        ...input.changes.changed_files
      ],
      timestamp: input.timestamp
    });
  } else {
    worker.status = input.success ? "evidence_submitted" : "blocked";
    artifact = createArtifact(root, run, "execute", {
      type: "evidence",
      title: `${input.resolved.name}Adapter：${input.adapterResult.status}`,
      body: [
        input.adapterResult.summary,
        `exit_code=${input.adapterResult.exit_code}`,
        `out_of_scope=${input.changes.out_of_scope_files.join(",") || "none"}`,
        `unsupported=${input.changes.unsupported_files.join(",") || "none"}`
      ].join("\n"),
      refs: input.adapterResult.refs,
      timestamp: input.timestamp
    });
  }

  worker.last_adapter = input.resolved.name;
  worker.initial_model_tier = input.modelSelection.initial_model_tier;
  worker.model_tier = input.modelSelection.model_tier;
  worker.model_id = input.modelSelection.model_id;
  worker.model_reason = input.modelSelection.model_reason;
  if (input.modelChanged) {
    worker.session_id = null;
    worker.session_adapter = null;
  }
  if (input.execution.session_id) {
    worker.session_id = input.execution.session_id;
    worker.session_adapter = input.resolved.name;
  }
  worker.attempt = Number(worker.attempt || 0) + 1;
  worker.execution_claim_token = null;
  worker.execution_claimed_at = null;
  worker.execution_claim_expires_at = null;
  worker.updated_at = input.timestamp;
  const routePath = join(dir, "execution-route.json");
  const route = readJson(routePath, null);
  if (route) {
    route.initial_model_tier = input.modelSelection.initial_model_tier;
    route.model_tier = input.modelSelection.model_tier;
    route.model_id = input.modelSelection.model_id;
    route.model_reason = input.modelSelection.model_reason;
    route.retry_action = input.modelSelection.retry_action;
    writeJson(routePath, route);
  }
  writeJson(join(dir, "worker.json"), worker);
  const event = appendEvent(root, `worker.adapter.${input.resolved.name}`, "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    result_id: input.adapterResult.result_id,
    status: input.adapterResult.status,
    worker_status: worker.status,
    patch_id: input.patch?.patch_id || null,
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { adapterResult: input.adapterResult, patch: input.patch, artifact };
}

function persistCapabilityEvidence(dir, namespace, evidenceItems = []) {
  return evidenceItems.map((evidence) => {
    const name = `capability-evidence-${evidence.capability_id}.json`;
    writeJson(join(dir, name), evidence);
    return `${namespace}/${name}`;
  });
}

function readPriorAdapterResults(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.startsWith("adapter-result-") && file.endsWith(".json"))
    .map((file) => readJson(join(dir, file), null))
    .filter(Boolean)
    .sort((left, right) =>
      String(left.created_at || "").localeCompare(String(right.created_at || ""))
    );
}

function customExecutorResolution(executorId, executable) {
  const executor = getWorkerExecutor(executorId);
  return {
    id: executorId,
    name: executorId,
    executor,
    adapter: executor,
    info: normalizeExecutorInspection(executorId, executor.inspect(executable)),
    fallback: false
  };
}

function snapshotProtectedWorkspace(workspaceDir) {
  const values = new Map();
  for (const relativePath of [".apex-v2", ".apex-agent", "sandbox.json"]) {
    const target = join(workspaceDir, relativePath);
    if (!existsSync(target)) continue;
    if (statSync(target).isFile()) {
      values.set(relativePath, fileHash(target));
      continue;
    }
    for (const file of listFilesRecursive(target)) {
      const relativeFile = relative(workspaceDir, file);
      if (/^\.apex-agent\/[^/]+-home\//.test(relativeFile)) continue;
      values.set(relativeFile, fileHash(file));
    }
  }
  return values;
}

function diffProtectedWorkspace(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

function listFilesRecursive(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursive(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function buildWorkerAgentPrompt(worker, planNode, options = {}) {
  const allowedEvidenceRefs = options.allowedEvidenceRefs || worker.read_scope || [];
  const semanticEvidence = options.semanticEvidenceType
    ? `## Required Semantic Evidence

Return a \`semantic_evidence\` object with:
- evidence_type: ${options.semanticEvidenceType}
- objective: copy the Objective exactly, character for character
- source_refs, claims, uncertainties, and acceptance_mapping
${options.candidateDigest
    ? `- candidate_digest: copy exactly ${options.candidateDigest}`
    : ""}
- acceptance_mapping[].evidence_ref must match one source_refs value exactly.
- do not rewrite, normalize, shorten, or guess any evidence ref.
- allowed evidence refs include:
${lines(allowedEvidenceRefs)}
`
    : "";
  return `You are an isolated coding worker in Apex Forge V2.

## Objective

${planNode.objective}

## Deliverables

${lines(planNode.deliverables)}

## Read Scope

${lines(worker.read_scope)}

## Write Scope

${lines(worker.write_scope)}

## Required Evidence

${lines(planNode.required_evidence)}

## Internal Capability Protocols

${capabilityProtocols(planNode.capability_bindings || [])}

## Capability Invocation Refs

${lines(worker.capability_invocation_refs || [])}

${semanticEvidence}
${options.semanticEvidenceType
    ? `## Cognitive Verdict Semantics

- Set top-level verdict to "pass" when the requested analysis and typed evidence are complete, even when the analysis discovers defects or recommends blocking a merge.
- Put product risks and defects in claims, findings, residual_risks, and merge_posture.
- Set top-level verdict to "fail" only when you cannot complete the requested analysis or cannot produce valid evidence.
`
    : ""}
## Verification

${lines(worker.verification)}

## Hard Rules

1. Work only inside the current workspace.
2. Modify only files covered by Write Scope.
3. Do not edit .apex-v2, sandbox.json, agent metadata, or git configuration.
4. Do not commit, merge, push, or create branches.
5. Keep the implementation minimal and do not perform unrelated refactors.
6. Run the relevant verification commands before finishing.
7. If blocked, return verdict "fail" and explain the exact blocker.
8. Your final response must satisfy the provided JSON output schema.
`;
}

function capabilityProtocols(bindings) {
  if (bindings.length === 0) return "None";
  assertCapabilityContextBudget(bindings);
  return bindings.map((binding) => `### ${binding.capability_id}@${binding.capability_version}

Required output: ${binding.output_contract}
Typed input: ${binding.input_contract}

${readCapabilityProtocol(binding.protocol_ref).trim()}
`).join("\n");
}

export function collectWorkspaceChanges(projectDir, workspaceDir, writeScope) {
  const projectFiles = listWorkspaceFiles(projectDir);
  const sandboxFiles = listWorkspaceFiles(workspaceDir);
  const allFiles = new Set([...projectFiles, ...sandboxFiles]);
  const changedFiles = [];
  const outOfScopeFiles = [];
  const unsupportedFiles = [];
  const operations = [];

  for (const file of Array.from(allFiles).sort()) {
    const projectPath = join(projectDir, file);
    const sandboxPath = join(workspaceDir, file);
    const projectExists = existsSync(projectPath);
    const sandboxExists = existsSync(sandboxPath);
    if (projectExists && sandboxExists && buffersEqual(projectPath, sandboxPath)) continue;
    if (!projectExists && !sandboxExists) continue;

    changedFiles.push(file);
    if (!isFileAllowedByScope(file, writeScope)) {
      outOfScopeFiles.push(file);
      continue;
    }
    if (!sandboxExists) {
      unsupportedFiles.push(`${file}:delete`);
      continue;
    }
    const next = readFileSync(sandboxPath);
    if (isBinary(next)) {
      unsupportedFiles.push(`${file}:binary`);
      continue;
    }
    if (!projectExists) {
      operations.push({ op: "write_text", path: file, content: next.toString("utf8") });
      continue;
    }
    const previous = readFileSync(projectPath);
    if (isBinary(previous)) {
      unsupportedFiles.push(`${file}:binary`);
      continue;
    }
    operations.push({
      op: "replace_text",
      path: file,
      old_text: previous.toString("utf8"),
      new_text: next.toString("utf8")
    });
  }

  return {
    changed_files: changedFiles,
    out_of_scope_files: outOfScopeFiles,
    unsupported_files: unsupportedFiles,
    operations
  };
}

function readAgentResult(path) {
  if (!existsSync(path)) {
    return { valid: false, value: null, error: "agent-result.json missing" };
  }
  try {
    const value = normalizeProviderAgentResult(readJson(path));
    const result = validateContract("agent-result.schema.json", value, path);
    return {
      valid: result.valid,
      value,
      error: result.valid ? "" : result.errors.map((item) => `${item.instance_path || "/"} ${item.message}`).join("; ")
    };
  } catch (error) {
    return { valid: false, value: null, error: error.message };
  }
}

export function normalizeProviderAgentResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = structuredClone(value);
  if (normalized.semantic_evidence === null) {
    delete normalized.semantic_evidence;
    return normalized;
  }
  const evidence = normalized.semantic_evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return normalized;
  }
  const common = [
    "schema_version",
    "evidence_type",
    "objective",
    "source_refs",
    "claims",
    "uncertainties",
    "acceptance_mapping",
    "created_at"
  ];
  const specific = {
    context: ["affected_files", "constraints", "unknowns"],
    risk: ["failure_paths", "blast_radius", "mitigations", "rollback"],
    design: ["slices", "dependencies", "verification", "rollback"],
    review: ["candidate_digest", "findings", "residual_risks", "merge_posture"]
  }[evidence.evidence_type] || [];
  const allowed = new Set([...common, ...specific]);
  for (const key of Object.keys(evidence)) {
    if (!allowed.has(key)) delete evidence[key];
  }
  return normalized;
}

function classifyFailure(execution, structured, changes, worker) {
  if (execution.timed_out) return "timeout";
  if (changes.out_of_scope_files.length > 0) return "scope_violation";
  if (changes.unsupported_files.length > 0) return "unsupported_change";
  if (execution.exit_code !== 0) return "execution_error";
  if (!structured.valid) return "contract_error";
  if (structured.value?.verdict === "fail") return "agent_reported_failure";
  if (worker.output_contract === "patch" && changes.operations.length === 0) return "no_patch";
  return "unknown";
}

function listWorkspaceFiles(root) {
  const files = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_WORKSPACE_NAMES.has(entry.name)) continue;
      const path = join(dir, entry.name);
      const relativePath = relative(root, path);
      if (relativePath.startsWith(".apex-v2/")) {
        const contextRoot = relativePath.split("/")[1];
        if (!ALLOWED_CONTEXT_ROOTS.has(contextRoot)) continue;
      }
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  walk(root);
  return files;
}

function buffersEqual(leftPath, rightPath) {
  const leftStat = statSync(leftPath);
  const rightStat = statSync(rightPath);
  if (leftStat.size !== rightStat.size) return false;
  return readFileSync(leftPath).equals(readFileSync(rightPath));
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

function lines(items) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}
