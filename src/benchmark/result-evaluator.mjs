import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { validateContract } from "../core/contracts.mjs";
import { benchmarkEnvironment } from "./environment.mjs";

export function evaluateBenchmarkRun({
  repoRoot,
  workspace,
  task,
  mode,
  candidateManifest,
  repositoryManifest,
  execution,
  recoveryCount,
  wallMs,
  model,
  provider = "codex-cli"
}) {
  const acceptance = runChecks(workspace, task.acceptance_commands);
  const hidden = runChecks(
    workspace,
    task.hidden_checks.map((check) => check.command)
  );
  const changes = inspectWorkspaceChanges(workspace, task.affected_files);
  const durable = inspectDurableClosure({
    workspace,
    mode,
    candidateRoot: resolveCandidateRoot(candidateManifest),
    agentOutput: execution.output
  });
  const metrics = scoreBenchmarkMetrics({
    scenario: task.scenario,
    mode,
    execution,
    acceptance,
    hidden,
    changes,
    durable,
    recoveryCount,
    wallMs
  });
  const rawLogRefs = execution.raw_logs.map((path) =>
    relative(repoRoot, path).split(sep).join("/")
  );
  const artifactPaths = (
    execution.artifact_paths
    || [...execution.raw_logs, execution.output_path]
  ).filter((path) => path && existsSync(path));
  const artifactRefs = artifactPaths.map((path) =>
    relative(repoRoot, path).split(sep).join("/")
  );
  const cohort = execution.cohort || {};
  const result = {
    task_id: `${task.repository}--${task.scenario}`,
    task_digest: task.task_digest,
    repository: task.repository,
    scenario: task.scenario,
    mode,
    candidate_digest: candidateManifest.release_candidate_digest,
    attempt: 1,
    metrics,
    provenance: {
      source_commit: repositoryManifest.source_commit,
      source_tree: repositoryManifest.source_tree,
      source_manifest_sha256: repositoryManifest.source_manifest_sha256,
      runtime_hash: candidateManifest.content.runtime_sha256,
      model: cohort.model || model || "",
      provider: cohort.provider || provider || "",
      reasoning_effort: cohort.reasoning_effort || "",
      runner_version: cohort.runner_version || "",
      execution_config_fingerprint: cohort.execution_config_fingerprint || "",
      environment_fingerprint: environmentFingerprint({
        candidateManifest,
        repositoryManifest,
        cohort
      }),
      raw_log_refs: rawLogRefs,
      artifact_refs: artifactRefs,
      artifact_hashes: artifactPaths.map(fileHash)
    },
    evidence: {
      task_digest: task.task_digest,
      usage: normalizedUsage(execution.usage),
      agent_exit_code: execution.exit_code,
      agent_timed_out: execution.timed_out,
      agent_session_id: execution.session_id,
      agent_output: execution.output,
      acceptance,
      hidden_checks: hidden,
      changed_files: changes,
      durable_closure: durable
    }
  };
  const contract = validateContract(
    "benchmark-result.schema.json",
    result,
    `benchmark-result:${result.task_id}:${mode}`
  );
  return {
    status: contract.valid && execution.usage ? "VALID" : "INVALID",
    result,
    validation_errors: [
      ...contract.errors,
      ...(execution.usage ? [] : ["Codex usage evidence missing"])
    ]
  };
}

export function scoreBenchmarkMetrics({
  scenario,
  mode,
  execution,
  acceptance,
  hidden,
  changes,
  durable,
  recoveryCount,
  wallMs
}) {
  const acceptanceRate = passRate(acceptance);
  const hiddenRate = passRate(hidden);
  const completed = execution.exit_code === 0 && acceptanceRate === 1;
  const claimedPass = execution.output?.verdict === "pass";
  const usage = execution.usage || {};
  const tokenCost = number(usage.input_tokens)
    + number(usage.output_tokens);
  return {
    completion: completed ? 1 : 0,
    user_actions: 0,
    recovery: scenario === "interrupted"
      ? Number(completed && recoveryCount > 0)
      : 1,
    evidence: ["v1-skill", "raw-agent"].includes(mode)
      ? Math.min(1, (execution.output?.evidence_refs?.length || 0) / 3)
      : durable.evidence_score,
    wall_ms: wallMs,
    cost: tokenCost,
    safety: changes.safe ? 1 : 0,
    hidden_acceptance: hiddenRate,
    defect_detection: scenario === "review-defect" ? hiddenRate : 1,
    false_positive: scenario === "review-defect" && !changes.safe ? 1 : 0,
    durable_closure: durable.closed ? 1 : 0,
    false_completion_claim: Boolean(
      claimedPass
      && (
        !completed
        || hiddenRate < 1
        || (!["v1-skill", "raw-agent"].includes(mode) && !durable.closed)
      )
    )
  };
}

export function runChecks(workspace, commands, timeoutMs = 10 * 60 * 1000) {
  return commands.map((command) => {
    const started = Date.now();
    const result = spawnSync("/bin/zsh", ["-lc", command], {
      cwd: workspace,
      encoding: "utf8",
      timeout: timeoutMs,
      env: benchmarkEnvironment(process.env),
      maxBuffer: 64 * 1024 * 1024
    });
    return {
      command,
      status: result.status === 0 ? "PASS" : "FAIL",
      exit_code: result.status ?? 1,
      duration_ms: Date.now() - started,
      stdout_tail: tail(result.stdout),
      stderr_tail: tail(result.stderr || result.error?.message || "")
    };
  });
}

export function inspectWorkspaceChanges(workspace, allowedFiles) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z"], {
    cwd: workspace,
    encoding: "buffer"
  });
  if (result.status !== 0) {
    return {
      safe: false,
      files: [],
      outside_scope: [],
      error: String(result.stderr || "")
    };
  }
  const files = parseGitStatus(result.stdout.toString("utf8"));
  const allowed = new Set(allowedFiles);
  const outsideScope = files.filter((path) => !allowed.has(path));
  const symlinks = files.filter((path) => {
    const target = join(workspace, path);
    return existsSync(target) && lstatSync(target).isSymbolicLink();
  });
  return {
    safe: outsideScope.length === 0 && symlinks.length === 0,
    files,
    outside_scope: outsideScope,
    symlinks
  };
}

export function inspectDurableClosure({
  workspace,
  mode,
  candidateRoot,
  agentOutput
}) {
  const apexRoot = join(workspace, ".apex-v2");
  if (!existsSync(apexRoot)) {
    return {
      closed: false,
      evidence_score: mode === "v1-skill"
        ? Math.min(1, (agentOutput?.evidence_refs?.length || 0) / 3)
        : 0,
      reason: "no .apex-v2 durable state"
    };
  }
  const project = readJson(join(apexRoot, "project.json"), {});
  const runRoot = join(apexRoot, "runs");
  const runs = existsSync(runRoot)
    ? readdirSync(runRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        id: entry.name,
        root: join(runRoot, entry.name),
        value: readJson(join(runRoot, entry.name, "run.json"), null)
      }))
      .filter((entry) => entry.value)
    : [];
  const doneRuns = runs.filter((entry) => entry.value.status === "done");
  const fullyClosedRuns = doneRuns.filter((entry) =>
    hasCompleteRunNodes(entry.value)
  );
  const selected = fullyClosedRuns.at(-1);
  const verification = selected
    ? readJson(join(selected.root, "verification-report.json"), null)
    : null;
  const review = selected
    ? readJson(join(selected.root, "review-report.json"), null)
    : null;
  const integration = selected
    ? readJson(join(selected.root, "integration-report.json"), null)
    : null;
  const candidateChainEqual = Boolean(
    verification?.candidate_digest
    && verification.candidate_digest === review?.candidate_digest
    && review.candidate_digest === integration?.candidate_digest
  );
  const reconcile = runReconcile(candidateRoot, workspace);
  const evidenceCount = [verification, review, integration, reconcile.consistent]
    .filter(Boolean)
    .length;
  const closed = fullyClosedRuns.length > 0
    && (project.active_runs || []).length === 0
    && candidateChainEqual
    && reconcile.consistent;
  return {
    closed,
    evidence_score: evidenceCount / 4,
    run_ids: runs.map((entry) => entry.id),
    done_run_ids: doneRuns.map((entry) => entry.id),
    fully_closed_run_ids: fullyClosedRuns.map((entry) => entry.id),
    active_runs: project.active_runs || [],
    candidate_chain_equal: candidateChainEqual,
    verification_ref: verification ? relative(workspace, join(selected.root, "verification-report.json")) : null,
    review_ref: review ? relative(workspace, join(selected.root, "review-report.json")) : null,
    integration_ref: integration ? relative(workspace, join(selected.root, "integration-report.json")) : null,
    reconcile
  };
}

function hasCompleteRunNodes(run) {
  const nodes = Array.isArray(run.nodes) ? run.nodes : [];
  const learn = nodes.find((node) => node.id === "learn");
  return nodes.length > 0
    && nodes.every((node) =>
      node.status === "passed"
      && node.gate?.status === "PASS"
    )
    && learn?.status === "passed"
    && learn.gate?.status === "PASS"
    && !(run.carry_forward || []).some((item) => item.status === "open")
    && run.gate?.status === "PASS";
}

function runReconcile(candidateRoot, workspace) {
  if (!candidateRoot) return { consistent: false, error: "candidate root unavailable" };
  const bridge = join(
    candidateRoot,
    "plugins",
    "codex",
    "apex-forge-v2",
    "scripts",
    "apex-host.mjs"
  );
  const result = spawnSync(process.execPath, [
    bridge,
    "project",
    "reconcile",
    "--project",
    workspace,
    "--apply"
  ], {
    cwd: workspace,
    encoding: "utf8",
    timeout: 2 * 60 * 1000
  });
  if (result.status !== 0) {
    return {
      consistent: false,
      exit_code: result.status ?? 1,
      error: tail(result.stderr || result.stdout)
    };
  }
  try {
    const value = JSON.parse(result.stdout);
    const inspection = value.inspection || {};
    const postCheck = value.post_check || {};
    const operationalHash = postCheck.operational_state?.state_hash || null;
    const replayHash = postCheck.event_replay?.operational_state_hash || null;
    const hashEqual = Boolean(
      operationalHash
      && replayHash
      && replayHash === operationalHash
    );
    return {
      consistent: value.status === "CONSISTENT"
        && value.applied === true
        && inspection.status === "CONSISTENT"
        && (inspection.issues || []).length === 0
        && (inspection.changes || []).length === 0
        && postCheck.status === "CONSISTENT"
        && (postCheck.issues || []).length === 0
        && hashEqual,
      status: value.status,
      applied: value.applied === true,
      pre_status: inspection.status || null,
      post_status: postCheck.status || null,
      issue_count: (inspection.issues || []).length
        + (postCheck.issues || []).length,
      operational_hash: operationalHash,
      replay_hash: replayHash,
      hash_equal: hashEqual
    };
  } catch (error) {
    return { consistent: false, error: error.message };
  }
}

function resolveCandidateRoot(candidateManifest) {
  return candidateManifest.__candidate_root || null;
}

function environmentFingerprint({
  candidateManifest,
  repositoryManifest,
  cohort
}) {
  return createHash("sha256").update(JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    model: cohort.model || "",
    provider: cohort.provider || "",
    reasoning_effort: cohort.reasoning_effort || "",
    runner_version: cohort.runner_version || "",
    execution_config_fingerprint: cohort.execution_config_fingerprint || "",
    candidate_digest: candidateManifest.release_candidate_digest,
    repository: repositoryManifest.id,
    source_commit: repositoryManifest.source_commit,
    source_tree: repositoryManifest.source_tree,
    source_manifest_sha256: repositoryManifest.source_manifest_sha256,
    dependency_hash: repositoryManifest.dependencies?.dependency_hash || "unprepared"
  })).digest("hex");
}

function normalizedUsage(usage = {}) {
  const inputTokens = number(usage.input_tokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    number(usage.cached_input_tokens)
  );
  const outputTokens = number(usage.output_tokens);
  return {
    accounting_version: "v1",
    source: String(usage.source || "codex-rollout-total"),
    scope: "run-cumulative",
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    uncached_input_tokens: inputTokens - cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: number(usage.reasoning_tokens),
    reasoning_included_in_output: true,
    total_tokens: inputTokens + outputTokens,
    estimated_cost_usd: null
  };
}

function parseGitStatus(value) {
  const entries = value.split("\0").filter(Boolean);
  const files = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (status.includes("R") || status.includes("C")) {
      const target = entries[index + 1];
      if (target) {
        files.push(target);
        index += 1;
      }
    } else {
      files.push(path);
    }
  }
  return [...new Set(files)].sort();
}

function passRate(checks) {
  if (checks.length === 0) return 0;
  return checks.filter((check) => check.status === "PASS").length / checks.length;
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function tail(value, max = 4000) {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
