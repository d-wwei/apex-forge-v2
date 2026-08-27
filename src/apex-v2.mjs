#!/usr/bin/env node
// Apex Forge V2 project-kernel CLI. Resolver path A.

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./cli/args.mjs";
import { printHelp } from "./cli/help.mjs";
import {
  appendEvent,
  projectRoot,
  requireStore,
  SCHEMA_VERSION,
  storeRoot,
  updateProject
} from "./core/store.mjs";
import {
  closeRunIfComplete,
  createRunNode,
  getRunNode,
  haltRun,
  loadRun,
  recordRunClosure,
  requirePassedNode,
  runHandoffTemplate,
  writeRun
} from "./core/run-state.mjs";
import {
  assertArtifact,
  createArtifact,
  listAllArtifacts,
  listArtifactsForRun,
  readDirectoryJsonFiles
} from "./core/artifacts.mjs";
import {
  addIntakeItem,
  compareRoadmapPriority,
  createRoadmapNodeFromIntake,
  listIntakeItems,
  promoteRoadmapNode,
  triageIntakeItem
} from "./core/intake-roadmap.mjs";
import {
  applyPatchOperations,
  claimWorkerExecution,
  createWorkerForPlanNode,
  ensureWorkerSandboxReady,
  executeWorkerShell,
  findGitRoot,
  findPatch,
  findPatchWithPath,
  findWorker,
  getWorkers,
  isFileAllowedByScope,
  recoverExpiredWorkerExecutions,
  updatePatchBundle,
  workerDir
} from "./core/worker.mjs";
import {
  buildTaskPlanGraph,
  renderPlanGraphMarkdown,
  validatePlanGraph
} from "./core/plan-graph.mjs";
import { executeWorkerExecutor } from "./core/worker-execution.mjs";
import { inspectWorkerExecutors } from "./executors/registry.mjs";
import {
  applyProjectReconciliation,
  inspectEventLog,
  inspectProjectConsistency
} from "./core/reconcile.mjs";
import { inspectOperationalIntegrity } from "./core/operational-state.mjs";
import { withProjectTransaction } from "./core/project-transaction.mjs";
import {
  contractRegistry,
  migrateLegacyContracts,
  scanProjectContracts,
  validatePersistedValue
} from "./core/contracts.mjs";
import {
  assertAdapterAllowed,
  assertPatchWithinBudget,
  decideApproval,
  effectiveAgentLimit,
  effectiveAgentTimeout,
  ensureAdapterBaselineApproval,
  ensureMergeApproval,
  migrateApprovalRecords
} from "./core/governance.mjs";
import {
  addRisk,
  listRisks,
  resolveConflictRisks,
  syncCarryRisk,
  syncConflictRisks,
  syncReviewRisk,
  syncVerificationRisk,
  updateRisk
} from "./core/risks.mjs";
import { buildProjectMetrics } from "./core/metrics.mjs";
import { runProjectHeartbeat } from "./core/heartbeat.mjs";
import { KNOWLEDGE_FILES } from "./core/knowledge-constants.mjs";
import {
  buildProjectInventory,
  handleKnowledgeCommand
} from "./commands/knowledge.mjs";
import {
  createRunForRoadmapNode,
  generateRunPlanInternal,
  handleRunCommand
} from "./commands/run.mjs";
import { handleArtifactCommand } from "./commands/artifact.mjs";
import {
  handleApprovalCommand,
  handleContractsCommand,
  handleNotificationCommand,
  handleRiskCommand
} from "./commands/governance.mjs";
import {
  handleIntakeCommand,
  handleRoadmapCommand
} from "./commands/intake-roadmap.mjs";
import { handleCapabilityCommand } from "./commands/capability.mjs";
import { capabilityOutputRequiredFields } from "./core/capability-evidence.mjs";
import {
  claimHostAction,
  handleHostCommand,
  listHostActions
} from "./commands/host.mjs";
import {
  handleDecisionCommand,
  handleNegativeControlCommand
} from "./commands/dsh-lifecycle.mjs";
import {
  evaluateAdapterCapabilityDrift,
  fallbackWorkerInternal,
  handleWorkerCommand,
  initializeWorkerSandbox,
  latestWorkerAdapterResult,
  retryWorkerInternal
} from "./commands/worker.mjs";
import {
  applyMergeInternal,
  enqueuePatchInternal,
  generateReviewInternal,
  handleMergeCommand,
  handleReviewCommand,
  handleVerifyCommand,
  runVerificationInternal
} from "./commands/integration.mjs";
import {
  initProject,
  status,
  validateProject
} from "./commands/project-workspace.mjs";
import { handleGitDeliveryCommand } from "./commands/git-delivery.mjs";
import {
  defaultExecutionPolicy,
  defaultGatePolicy,
  defaultQualityPolicy,
  defaultRetryPolicy
} from "./core/policy-defaults.mjs";
import {
  heartbeatSchedulerStatus,
  installHeartbeatScheduler
} from "./core/heartbeat-scheduler.mjs";
import {
  heartbeatDaemonStatus,
  startHeartbeatDaemon,
  stopHeartbeatDaemon
} from "./core/heartbeat-daemon-control.mjs";
import {
  hasExecutedTest,
  runProjectAuditTests
} from "./core/project-audit.mjs";
import {
  buildAuditChecks,
  renderAuditMarkdown
} from "./audit/project-audit-report.mjs";
import { buildAuditSummary as collectAuditSummary } from "./audit/project-audit-summary.mjs";
import { buildWorkerSummary } from "./core/worker-results.mjs";
import { runAdapterSmoke } from "./core/adapter-smoke.mjs";
import { runWorkerJobs } from "./core/worker-supervisor.mjs";
import { acquireSchedulerLock } from "./core/scheduler-lock.mjs";
import {
  buildAdapterTrend,
  recordAdapterObservation,
  recordAdapterSmokeReport,
  refreshStaleAdapterSmoke
} from "./core/adapter-observability.mjs";
import {
  acknowledgeNotification,
  defaultNotificationPolicy,
  dispatchNotifications,
  listNotifications,
  migrateNotificationState
} from "./core/notifications.mjs";
import {
  assertSafeRelativePath,
  atomicWriteFile,
  bullet,
  dirnameForPath,
  ensureDir,
  normalizeEnum,
  now,
  readJson,
  registerJsonWriteValidator,
  required,
  shortId,
  splitList,
  tail,
  writeJson,
  writeTextIfMissing
} from "./lib/common.mjs";

registerJsonWriteValidator(validatePersistedValue);

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);

  try {
    if (!command || command === "help" || command === "--help") {
      printHelp();
      return;
    }

    if (command === "init") {
      initProject(parseArgs([subcommand, ...rest]));
      return;
    }

    if (command === "status") {
      status(parseArgs([subcommand, ...rest]));
      return;
    }

    if (command === "validate") {
      validateProject(parseArgs([subcommand, ...rest]));
      return;
    }

    if (command === "intake") {
      handleIntakeCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "roadmap") {
      handleRoadmapCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "capability") {
      handleCapabilityCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "run") {
      handleRunCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "artifact") {
      handleArtifactCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "knowledge") {
      handleKnowledgeCommand(subcommand, parseArgs(rest), { appendAppliedLearning });
      return;
    }

    if (command === "worker") {
      handleWorkerCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "host") {
      handleHostCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "decision") {
      handleDecisionCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "negative-control") {
      handleNegativeControlCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "merge") {
      handleMergeCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "verify") {
      handleVerifyCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "review") {
      handleReviewCommand(subcommand, parseArgs(rest));
      return;
    }

    if (command === "learn") {
      handleLearn(subcommand, parseArgs(rest));
      return;
    }

    if (command === "project") {
      await handleProject(subcommand, parseArgs(rest));
      return;
    }

    if (command === "contracts") {
      handleContractsCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "approval") {
      handleApprovalCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "risk") {
      handleRiskCommand(subcommand, parseArgs(rest));
      return;
    }
    if (command === "notification") {
      handleNotificationCommand(subcommand, parseArgs(rest));
      return;
    }

    throw new Error(`未知命令：${command}`);
  } catch (error) {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  }
}

function handleLearn(subcommand, args) {
  if (subcommand === "propose") {
    proposeLearning(args);
    return;
  }
  if (subcommand === "list") {
    listLearning(args);
    return;
  }
  if (subcommand === "approve") {
    approveLearning(args);
    return;
  }
  if (subcommand === "apply") {
    applyLearning(args);
    return;
  }
  throw new Error(`未知 learn 子命令：${subcommand || "(空)"}`);
}

function proposeLearning(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const result = proposeLearningInternal(root, run);
  console.log(JSON.stringify(result, null, 2));
}

function proposeLearningInternal(root, run) {
  requirePassedNode(run, "integrate");
  const timestamp = now();
  const verification = readJson(join(root, "runs", run.run_id, "verification-report.json"), null);
  const review = readJson(join(root, "runs", run.run_id, "review-report.json"), null);
  const integration = readJson(join(root, "runs", run.run_id, "integration-report.json"), null);
  if (!verification || verification.status !== "PASS") throw new Error("缺少 PASS verification-report，不能生成 learning proposal");
  if (!review || review.status !== "PASS") throw new Error("缺少 PASS review-report，不能生成 learning proposal");
  if (!integration || !["MERGED", "NOOP"].includes(integration.status)) throw new Error("缺少 MERGED/NOOP integration-report，不能生成 learning proposal");

  const candidates = (review.non_blocking_findings || [])
    .map((finding) => String(finding).match(/^learning:\s*(.+)$/i)?.[1]?.trim())
    .filter((finding) => finding && finding.length >= 20)
    .map((finding) => ({
      target_file: "knowledge/decisions.md",
      proposed_change: finding,
      evidence_refs: [
        `.apex-v2/runs/${run.run_id}/review-report.json`,
        `.apex-v2/runs/${run.run_id}/verification-report.json`,
        `.apex-v2/runs/${run.run_id}/integration-report.json`
      ],
      confidence: 0.9
    }));

  const proposalsPath = join(root, "learning", "proposals.json");
  const jobsPath = join(root, "learning", "jobs.json");
  const proposals = readJson(proposalsPath, []);
  const jobs = readJson(jobsPath, []);
  const created = [];
  const queuedJobs = [];
  for (const candidate of candidates) {
    const existing = proposals.find((item) =>
      item.target_file === candidate.target_file
      && item.proposed_change === candidate.proposed_change
    );
    if (existing) continue;
    const proposal = {
      schema_version: SCHEMA_VERSION,
      id: shortId("learning"),
      source_run_id: run.run_id,
      target_file: candidate.target_file,
      proposed_change: candidate.proposed_change,
      evidence_refs: candidate.evidence_refs,
      confidence: candidate.confidence,
      status: "proposed",
      apply_job_id: null,
      apply_receipt_id: null,
      applied_at: null,
      created_at: timestamp,
      updated_at: timestamp
    };
    proposals.push(proposal);
    let job = jobs.find((item) => item.proposal_id === proposal.id);
    if (!job) {
      job = {
        schema_version: SCHEMA_VERSION,
        job_id: shortId("learning-job"),
        run_id: run.run_id,
        proposal_id: proposal.id,
        status: proposal.status === "approved"
          ? "queued"
          : proposal.status === "applied"
            ? "applied"
            : "waiting_approval",
        attempt: 0,
        idempotency_key: `learning-apply-job-v1:${proposal.id}`,
        requested_at: timestamp,
        started_at: null,
        completed_at: null,
        receipt_id: proposal.apply_receipt_id || null,
        error: null,
        updated_at: timestamp
      };
      jobs.push(job);
    }
    proposal.apply_job_id = job.job_id;
    proposal.updated_at = timestamp;
    created.push(proposal);
    queuedJobs.push(job);
  }
  writeJson(proposalsPath, proposals);
  writeJson(jobsPath, jobs);
  const reportPath = join(root, "runs", run.run_id, "learning-report.json");
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("learning-report"),
    run_id: run.run_id,
    created_at: timestamp,
    proposal_ids: created.map((proposal) => proposal.id),
    queue_job_ids: queuedJobs.map((job) => job.job_id),
    completion_kind: created.length > 0 ? "proposal_queued" : "no_change",
    proposal_artifact_id: null
  };
  writeJson(reportPath, report);
  const artifact = createArtifact(root, run, "learn", {
    type: "decision",
    title: created.length > 0
      ? "Learning：已生成治理提案"
      : "Learning：无新增可复用规则",
    body: created.length > 0
      ? `已生成 ${created.length} 条 learning proposals，等待 governance approval。`
      : "Review 未提出新的跨任务规则，跳过 learning proposal。",
    refs: [
      ".apex-v2/learning/proposals.json",
      `.apex-v2/runs/${run.run_id}/learning-report.json`
    ],
    timestamp
  });
  report.proposal_artifact_id = artifact.artifact_id;
  writeJson(reportPath, report);
  const event = appendEvent(root, "learning.proposed", "apex-v2", {
    run_id: run.run_id,
    proposal_ids: created.map((proposal) => proposal.id),
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    proposals: created,
    jobs: queuedJobs,
    artifact_id: artifact.artifact_id
  };
}

function listLearning(args) {
  const root = requireStore(projectRoot(args));
  const proposals = readJson(join(root, "learning", "proposals.json"), []);
  const status = args.status ? String(args.status) : null;
  console.log(JSON.stringify(status ? proposals.filter((proposal) => proposal.status === status) : proposals, null, 2));
}

function approveLearning(args) {
  const root = requireStore(projectRoot(args));
  const id = required(args, "id");
  const proposal = withProjectTransaction(resolve(root, ".."), {
    kind: "learning-approve",
    idempotencyKey: `learning-approve:${id}`
  }, () => {
    const approved = updateLearningProposal(root, id, (item) => {
      if (item.status !== "proposed") throw new Error(`只有 proposed proposal 可以 approve，当前状态：${item.status}`);
      item.status = "approved";
      item.updated_at = now();
    });
    queueApprovedLearningJob(root, approved);
    const event = appendEvent(root, "learning.approved", "apex-v2", { proposal_id: approved.id });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    return approved;
  }).result;
  console.log(JSON.stringify(proposal, null, 2));
}

function applyLearning(args) {
  const root = requireStore(projectRoot(args));
  const id = required(args, "id");
  const proposal = getLearningProposal(root, id);
  if (proposal.status !== "approved" && proposal.status !== "applied") {
    throw new Error(`只有 approved proposal 可以 apply，当前状态：${proposal.status}`);
  }
  if (proposal.status === "applied" && proposal.apply_receipt_id) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }
  const job = queueApprovedLearningJob(root, proposal);
  const [result] = processLearningJobs(root, {
    limit: 1,
    jobId: job.job_id
  });
  if (!result || result.status !== "APPLIED") {
    throw new Error(result?.error || `learning job 未应用：${job.job_id}`);
  }
  console.log(JSON.stringify(getLearningProposal(root, id), null, 2));
}

async function handleProject(subcommand, args) {
  if (subcommand === "git") {
    handleGitDeliveryCommand(args._[0], args);
    return;
  }
  if (subcommand === "tick") {
    await projectTick(args);
    return;
  }
  if (subcommand === "drain") {
    await projectDrain(args);
    return;
  }
  if (subcommand === "heartbeat") {
    const action = args._[0];
    if (action === "install") {
      console.log(JSON.stringify(installHeartbeatScheduler(projectRoot(args), {
        intervalMinutes: Number(args["interval-minutes"] || 60),
        envFile: args["env-file"] ? String(args["env-file"]) : undefined,
        activate: Boolean(args.activate)
      }), null, 2));
      return;
    }
    if (action === "status") {
      console.log(JSON.stringify(heartbeatSchedulerStatus(projectRoot(args)), null, 2));
      return;
    }
    if (action === "daemon-start") {
      console.log(JSON.stringify(startHeartbeatDaemon(projectRoot(args), {
        intervalMinutes: Number(args["interval-minutes"] || 60)
      }), null, 2));
      return;
    }
    if (action === "daemon-status") {
      console.log(JSON.stringify(heartbeatDaemonStatus(projectRoot(args)), null, 2));
      return;
    }
    if (action === "daemon-stop") {
      console.log(JSON.stringify(stopHeartbeatDaemon(projectRoot(args)), null, 2));
      return;
    }
    console.log(JSON.stringify(runProjectHeartbeat(requireStore(projectRoot(args)), {
      forceNotifications: Boolean(args["force-notifications"])
    }), null, 2));
    return;
  }
  if (subcommand === "audit") {
    auditProject(args);
    return;
  }
  if (subcommand === "reconcile") {
    reconcileProject(args);
    return;
  }
  if (subcommand === "metrics") {
    projectMetrics(args);
    return;
  }
  if (subcommand === "quality") {
    projectQuality(args);
    return;
  }
  throw new Error(`未知 project 子命令：${subcommand || "(空)"}`);
}

function projectMetrics(args) {
  const root = requireStore(projectRoot(args));
  const snapshot = buildProjectMetrics(root);
  if (args.record) {
    ensureDir(join(root, "metrics"));
    writeJson(join(root, "metrics", `${snapshot.snapshot_id}.json`), snapshot);
    writeJson(join(root, "metrics", "latest.json"), snapshot);
    const event = appendEvent(root, "project.metrics.recorded", "apex-v2", { snapshot_id: snapshot.snapshot_id });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  console.log(JSON.stringify(snapshot, null, 2));
}

function projectQuality(args) {
  const action = args._[0];
  if (action !== "set") throw new Error(`未知 project quality 动作：${action || "(空)"}`);
  const root = requireStore(projectRoot(args));
  const path = join(root, "policies", "quality.json");
  const policy = readJson(path);
  const mappings = [
    ["max-open-risks", "max_open_risks"],
    ["max-verification-failures", "max_verification_failures"],
    ["max-adapter-failure-rate", "max_adapter_failure_rate"],
    ["max-cycle-regression-percent", "max_cycle_regression_percent"]
  ];
  for (const [argName, field] of mappings) {
    if (args[argName] == null) continue;
    const value = Number(args[argName]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${argName} 必须是非负数字`);
    policy.thresholds[field] = value;
  }
  if (args["adapter-smoke-max-age-hours"] != null) {
    const value = Number(args["adapter-smoke-max-age-hours"]);
    if (!Number.isFinite(value) || value < 1) throw new Error("--adapter-smoke-max-age-hours 必须是不小于 1 的数字");
    policy.adapter_smoke_max_age_hours = value;
  }
  if (args["adapter-smoke-refresh-timeout-ms"] != null) {
    const value = Number(args["adapter-smoke-refresh-timeout-ms"]);
    if (!Number.isInteger(value) || value < 1000) throw new Error("--adapter-smoke-refresh-timeout-ms 必须是不小于 1000 的整数");
    policy.adapter_smoke_refresh_timeout_ms = value;
  }
  if (args["adapter-smoke-auto-refresh"] != null) {
    const value = String(args["adapter-smoke-auto-refresh"]);
    if (!["true", "false"].includes(value)) throw new Error("--adapter-smoke-auto-refresh 只能是 true 或 false");
    policy.adapter_smoke_auto_refresh = value === "true";
  }
  if (args["adapter-observation-interval-hours"] != null) {
    const value = Number(args["adapter-observation-interval-hours"]);
    if (!Number.isInteger(value) || value < 1) throw new Error("--adapter-observation-interval-hours 必须是正整数");
    policy.adapter_observation_interval_hours = value;
  }
  if (args["rolling-window-days"] != null) {
    const value = Number(args["rolling-window-days"]);
    if (!Number.isInteger(value) || value < 1) throw new Error("--rolling-window-days 必须是正整数");
    policy.rolling_window_days = value;
  }
  if (args["rolling-run-count"] != null) {
    const value = Number(args["rolling-run-count"]);
    if (!Number.isInteger(value) || value < 1) throw new Error("--rolling-run-count 必须是正整数");
    policy.rolling_run_count = value;
  }
  policy.updated_at = now();
  writeJson(path, policy);
  const event = appendEvent(root, "quality.policy.updated", "human", {
    thresholds: policy.thresholds,
    adapter_smoke_max_age_hours: policy.adapter_smoke_max_age_hours,
    adapter_smoke_auto_refresh: policy.adapter_smoke_auto_refresh,
    adapter_smoke_refresh_timeout_ms: policy.adapter_smoke_refresh_timeout_ms,
    adapter_observation_interval_hours: policy.adapter_observation_interval_hours,
    rolling_window_days: policy.rolling_window_days,
    rolling_run_count: policy.rolling_run_count
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify(policy, null, 2));
}

function reconcileProject(args) {
  const root = requireStore(projectRoot(args));
  const timestamp = now();
  const inspection = inspectProjectConsistency(root);
  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("reconcile"),
    created_at: timestamp,
    status: inspection.status,
    applied: false,
    inspection,
    post_check: null
  };

  if (args.apply) {
    if (inspection.status === "INVALID") {
      throw new Error(`reconcile 拒绝 apply：event/state integrity 有 ${inspection.issues.length} 个问题`);
    }
    applyProjectReconciliation(root, inspection);
    const operational = inspectOperationalIntegrity(root);
    const event = appendEvent(root, "project.reconciled", "apex-v2", {
      report_id: report.report_id,
      change_count: inspection.changes.length,
      active_runs: inspection.derived.active_runs,
      knowledge_version: inspection.derived.knowledge_version,
      operational_state_hash: operational.state_hash,
      operational_state: operational.state
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    report.applied = true;
    report.status = inspection.changes.length > 0 ? "REPAIRED" : "CONSISTENT";
    report.post_check = inspectProjectConsistency(root);
    const reportDir = join(root, "reconciliations");
    ensureDir(reportDir);
    writeJson(join(reportDir, `${report.report_id}.json`), report);
  }

  console.log(JSON.stringify(report, null, 2));
}

async function projectTick(args) {
  const root = requireStore(projectRoot(args));
  const timestamp = now();
  const intakePath = join(root, "intake", "items.json");
  const roadmapPath = join(root, "roadmap", "graph.json");
  const projectPath = join(root, "project.json");
  const intake = readJson(intakePath, []);
  const roadmap = readJson(roadmapPath);
  const project = readJson(projectPath);
  const promoted = [];
  const createdRuns = [];
  const advancedRuns = [];
  let dispatchedWorkers = [];
  let retriedWorkers = [];
  let fallbackWorkers = [];
  let workerRuns = [];
  let agentRuns = [];
  let collectedResults = [];
  let completedExecuteRuns = [];
  let verifiedRuns = [];
  let reviewedRuns = [];
  let integratedRuns = [];
  let learnedRuns = [];
  let learningJobs = [];
  let agentScheduler = null;
  let adapterSmokeRefresh = {
    attempted: false,
    reason: "no-ready-nodes",
    status: null,
    smoke_id: null
  };

  for (const item of intake) {
    if (item.triage.status !== "accepted") continue;
    if (roadmap.nodes.some((node) => node.source_intake_id === item.id)) continue;
    const node = createRoadmapNodeFromIntake(item, timestamp);
    roadmap.nodes.push(node);
    if (item.triage.target_milestone && !roadmap.milestones.includes(item.triage.target_milestone)) {
      roadmap.milestones.push(item.triage.target_milestone);
    }
    promoted.push(node);
    appendEvent(root, "roadmap.promoted", "apex-v2", { roadmap_node_id: node.id, intake_id: item.id, via: "project.tick" });
  }

  roadmap.updated_at = timestamp;
  writeJson(roadmapPath, roadmap);

  let activeRunSlots = Math.max(0, project.wip_limits.active_runs - project.active_runs.length);
  let activeNodeSlots = Math.max(0, roadmap.wip_limits.active_nodes - roadmap.nodes.filter((node) => node.status === "active").length);
  const readyNodes = roadmap.nodes
    .filter((node) => node.status === "ready")
    .sort(compareRoadmapPriority);
  const qualityPolicy = readJson(join(root, "policies", "quality.json"));
  const latestMetrics = readJson(join(root, "metrics", "latest.json"), null);
  if (readyNodes.length > 0 && qualityPolicy.block_new_runs_on_failure && latestMetrics?.evaluation?.status === "FAIL") {
    throw new Error(`quality gate 阻止创建新 run：${latestMetrics.evaluation.failures.join(",")}`);
  }
  if (readyNodes.length > 0) {
    adapterSmokeRefresh = refreshStaleAdapterSmoke(root, qualityPolicy, {
      trigger: "project.tick"
    });
  }
  const latestSmoke = readJson(join(root, "adapters", "latest-live-smoke.json"), null);
  if (readyNodes.length > 0 && qualityPolicy.block_new_runs_on_smoke_failure && latestSmoke?.status === "FAIL") {
    throw new Error(`adapter smoke gate 阻止创建新 run：${latestSmoke.results.filter((item) => item.status === "FAIL").map((item) => item.adapter).join(",")}`);
  }
  if (readyNodes.length > 0 && latestSmoke && Date.now() - Date.parse(latestSmoke.generated_at) > qualityPolicy.adapter_smoke_max_age_hours * 3600000) {
    throw new Error("adapter smoke gate 阻止创建新 run：latest smoke 已过期");
  }
  const adapterDrift = evaluateAdapterCapabilityDrift(root);
  if (readyNodes.length > 0 && adapterDrift.baseline_generated_at && adapterDrift.status === "FAIL") {
    throw new Error(`adapter capability gate 阻止创建新 run：${adapterDrift.changes.filter((item) => item.severity === "blocking").map((item) => `${item.adapter}:${item.kind}`).join(",")}`);
  }

  for (const node of readyNodes) {
    if (activeRunSlots <= 0 || activeNodeSlots <= 0) break;
    const run = createRunForRoadmapNode(root, node.id, timestamp);
    createdRuns.push(run);
    activeRunSlots -= 1;
    activeNodeSlots -= 1;
  }

  if (args.advance) {
    const refreshedProject = readJson(projectPath);
    for (const runId of refreshedProject.active_runs) {
      const advanced = advanceRunPlanning(root, runId);
      if (advanced.actions.length > 0) advancedRuns.push(advanced);
    }
  }

  if (args["run-agents"]) {
    const limit = effectiveAgentLimit(root, Math.max(1, Number(args["agent-limit"] || 1)));
    const releaseScheduler = acquireSchedulerLock(resolve(root, ".."));
    try {
      agentScheduler = await runProjectAgentScheduler(root, limit, args);
    } finally {
      releaseScheduler();
    }
    dispatchedWorkers = agentScheduler.dispatched_workers;
    retriedWorkers = agentScheduler.retried_workers;
    fallbackWorkers = agentScheduler.fallback_workers;
    workerRuns = agentScheduler.worker_runs;
    agentRuns = agentScheduler.agent_runs;
    collectedResults = agentScheduler.collected_results;
    completedExecuteRuns = agentScheduler.completed_execute_runs;
  } else {
    if (args.dispatch) {
      const refreshedProject = readJson(projectPath);
      dispatchedWorkers = dispatchReadyWorkers(root, refreshedProject.active_runs, {
        mode: args["execution-mode"] ? String(args["execution-mode"]) : null
      });
    }

    if (args["retry-workers"]) {
      const refreshedProject = readJson(projectPath);
      const limit = Math.max(1, Number(args["retry-limit"] || 1));
      retriedWorkers = retryBlockedWorkers(root, refreshedProject.active_runs, limit);
    }
    if (args["fallback-agents"]) {
      const refreshedProject = readJson(projectPath);
      const limit = Math.max(1, Number(args["fallback-limit"] || 1));
      fallbackWorkers = fallbackBlockedAgents(root, refreshedProject.active_runs, limit);
    }

    if (args["run-workers"]) {
      const refreshedProject = readJson(projectPath);
      const limit = Math.max(1, Number(args["worker-limit"] || 1));
      workerRuns = runReadyWorkerAdapters(root, refreshedProject.active_runs, limit);
    }

    if (args["collect-results"]) {
      const refreshedProject = readJson(projectPath);
      collectedResults = collectWorkerResults(root, refreshedProject.active_runs);
    }

    if (args["complete-execute"]) {
      const refreshedProject = readJson(projectPath);
      completedExecuteRuns = completeReadyExecuteNodes(root, refreshedProject.active_runs);
    }
  }

  if (args.verify) {
    const refreshedProject = readJson(projectPath);
    verifiedRuns = verifyReadyRuns(root, refreshedProject.active_runs, projectRoot(args));
  }

  if (args.review) {
    const refreshedProject = readJson(projectPath);
    reviewedRuns = reviewReadyRuns(root, refreshedProject.active_runs);
  }

  if (args.integrate) {
    const refreshedProject = readJson(projectPath);
    integratedRuns = integrateReadyRuns(root, refreshedProject.active_runs);
  }

  if (args.learn) {
    const refreshedProject = readJson(projectPath);
    learnedRuns = learnReadyRuns(root, refreshedProject.active_runs);
  }

  if (args["apply-learning"]) {
    approveLearningForRuns(root, learnedRuns);
  }
  if (args["learning-worker"] || args["apply-learning"]) {
    learningJobs = processLearningJobs(root, {
      limit: Math.max(1, Number(args["learning-limit"] || 3))
    });
  }

  const event = appendEvent(root, "project.tick", "apex-v2", {
    promoted: promoted.map((node) => node.id),
    created_runs: createdRuns.map((run) => run.run_id),
    advanced_runs: advancedRuns,
    dispatched_workers: dispatchedWorkers,
    retried_workers: retriedWorkers,
    fallback_workers: fallbackWorkers,
    worker_runs: workerRuns,
    agent_runs: agentRuns,
    collected_results: collectedResults,
    completed_execute_runs: completedExecuteRuns,
    verified_runs: verifiedRuns,
    reviewed_runs: reviewedRuns,
    integrated_runs: integratedRuns,
    learned_runs: learnedRuns,
    learning_jobs: learningJobs,
    agent_scheduler: agentScheduler,
    adapter_smoke_refresh: adapterSmokeRefresh
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });

  console.log(JSON.stringify({
    promoted,
    created_runs: createdRuns,
    advanced_runs: advancedRuns,
    dispatched_workers: dispatchedWorkers,
    retried_workers: retriedWorkers,
    fallback_workers: fallbackWorkers,
    worker_runs: workerRuns,
    agent_runs: agentRuns,
    collected_results: collectedResults,
    completed_execute_runs: completedExecuteRuns,
    verified_runs: verifiedRuns,
    reviewed_runs: reviewedRuns,
    integrated_runs: integratedRuns,
    learned_runs: learnedRuns,
    learning_jobs: learningJobs,
    agent_scheduler: agentScheduler,
    adapter_smoke_refresh: adapterSmokeRefresh,
    remaining_ready: readJson(roadmapPath).nodes.filter((node) => node.status === "ready").length,
    active_runs: readJson(projectPath).active_runs
  }, null, 2));
}

async function projectDrain(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const releaseScheduler = acquireSchedulerLock(resolve(root, ".."));
  const maxSteps = Math.max(1, Number(args["max-steps"] || 20));
  const transitions = [];
  let stopReason = "max-steps";

  try {
    for (let step = 1; step <= maxSteps; step += 1) {
    const runIds = readJson(join(root, "project.json")).active_runs;
    if (runIds.length === 0) {
      stopReason = "no-active-runs";
      break;
    }

    const advanced = runIds.map((runId) => advanceRunPlanning(root, runId))
      .filter((item) => item.actions.length > 0);
    const recovered = recoverExpiredWorkerExecutions(root, runIds, "project.drain");
    const collected = collectWorkerResults(root, runIds);
    const completed = completeReadyExecuteNodes(root, runIds);
    const verified = verifyReadyRuns(root, runIds, projectDir);
    const reviewed = reviewReadyRuns(root, runIds);
    const integrated = integrateReadyRuns(root, runIds);
    const learned = learnReadyRuns(root, runIds);
    const dispatched = dispatchReadyWorkers(root, runIds, {
      mode: args["execution-mode"]
        ? String(args["execution-mode"])
        : "interactive"
    });

    transitions.push({
      step,
      advanced,
      recovered,
      collected,
      completed,
      verified,
      reviewed,
      integrated,
      learned,
      dispatched
    });

    const actions = listHostActions(root);
    const hostId = args["host-id"] ? String(args["host-id"]) : null;
    const selectable = actions.find((action) =>
      action.status === "active"
      || (hostId && action.status === "claimed" && action.claimed_by === hostId)
    );
    if (selectable) {
      const claimed = hostId
        ? claimHostAction(root, selectable.worker_id, hostId)
        : null;
      console.log(JSON.stringify({
        status: "ACTION_REQUIRED",
        stop_reason: "waiting-for-agent",
        transitions,
        next_action: controllerAction(selectable, claimed, {
          compact: Boolean(args.compact),
          projectDir
        })
      }, null, 2));
      return;
    }

    const progress = [
      ...advanced,
      ...recovered,
      ...collected,
      ...completed,
      ...verified,
      ...reviewed,
      ...integrated,
      ...learned,
      ...dispatched
    ].length;
      if (progress === 0) {
        stopReason = actions.length > 0 ? "claimed-by-other-host" : "blocked";
        break;
      }
    }

    console.log(JSON.stringify({
      status: readJson(join(root, "project.json")).active_runs.length === 0
        ? "COMPLETE"
        : "BLOCKED",
      stop_reason: stopReason,
      transitions,
      next_action: null
    }, null, 2));
  } finally {
    releaseScheduler();
  }
}

function controllerAction(action, claimed, options = {}) {
  const planNodeId = action.plan_node_id;
  const actionType = planNodeId === "delivery-design"
    ? "plan"
    : planNodeId === "delivery-implementation" || planNodeId === "delivery-tests"
      ? "implement"
      : planNodeId === "delivery-risk-challenger"
        ? "risk_challenge"
        : planNodeId === "delivery-review"
          ? "review"
          : "decision";
  const fullClaim = claimed?.action || null;
  const claim = options.compact && fullClaim
    ? {
        action_id: fullClaim.action_id,
        claim_token: fullClaim.claim_token,
        fencing_token: fullClaim.fencing_token,
        lease_expires_at: fullClaim.lease_expires_at
      }
    : fullClaim;
  return {
    action_type: actionType,
    worker_id: action.worker_id,
    run_id: action.run_id,
    objective: action.objective,
    workspace: claimed?.workspace?.workspace_path || action.workspace_path || null,
    context_refs: action.read_scope,
    required_output: action.output_contract,
    candidate_digest: action.candidate_digest,
    verification_ref: action.verification_ref,
    patch_refs: action.patch_refs,
    risk_refs: action.risk_refs,
    budget: {
      model_tier: action.model_tier || null,
      lease_expires_at: claimed?.action?.lease_expires_at || action.lease_expires_at
    },
    claim_token: fullClaim?.claim_token || null,
    claim,
    capability_enforcement: action.capability_enforcement || "shadow",
    capability_bindings: options.compact
      ? (action.capability_bindings || []).map((binding) => ({
          capability_id: binding.capability_id,
          capability_version: binding.capability_version,
          output_contract: binding.output_contract,
          required: binding.required
        }))
      : action.capability_bindings,
    submission_contract: hostSubmissionContract(action, actionType, {
      projectDir: options.projectDir,
      claim: fullClaim
    })
  };
}

function hostSubmissionContract(action, actionType, options = {}) {
  const claim = options.claim || null;
  const enforceCapabilities = action.capability_enforcement === "enforce";
  const evidenceType = {
    plan: "design",
    risk_challenge: "risk",
    review: "review"
  }[actionType] || null;
  const semanticFields = {
    design: ["slices", "dependencies", "verification", "rollback"],
    risk: ["failure_paths", "blast_radius", "mitigations", "rollback"],
    review: ["candidate_digest", "findings", "residual_risks", "merge_posture"]
  };
  return {
    command: "host submit-current",
    evidence_argument: "--evidence-artifact-file",
    format: "unified-v1",
    required_cli_values: {
      project_dir: options.projectDir || null,
      host_id: claim?.host_id || null,
      summary: "<concise completed-action summary>",
      evidence_file: `/private/tmp/apex-evidence-${action.worker_id}.json`
    },
    semantic_evidence: evidenceType
      ? {
          evidence_type: evidenceType,
          objective_must_equal: action.objective,
          field_constraints: semanticEvidenceFieldConstraints(
            evidenceType,
            action
          ),
          required_fields: [
            "schema_version",
            "evidence_type",
            "objective",
            "source_refs",
            "claims",
            "uncertainties",
            "acceptance_mapping",
            ...semanticFields[evidenceType],
            "created_at"
          ]
        }
      : null,
    capability_outputs: (action.capability_bindings || []).map((binding) => {
      const schema = contractRegistry().schemas.get(
        `${binding.output_contract}.schema.json`
      );
      return {
        capability_id: binding.capability_id,
        capability_version: binding.capability_version,
        output_contract: binding.output_contract,
        required: binding.required,
        required_for_submission: enforceCapabilities && binding.required,
        ...(enforceCapabilities
          ? {
              required_output_fields: capabilityOutputRequiredFields(
                binding.output_contract
              ),
              output_field_constraints: summarizeRequiredProperties(schema)
            }
          : {})
      };
    }),
    evidence_template: {
      schema_version: "unified-v1",
      semantic_evidence: semanticEvidenceTemplate(evidenceType, action),
      capability_outputs: []
    },
    rules: [
      "Only schema_version, semantic_evidence, and capability_outputs are allowed at the top level.",
      "Use semantic_evidence as an object; do not JSON-stringify it.",
      "Use capability_outputs[].output as an object; do not flatten output fields.",
      "In shadow mode, omit capability output unless it was actually executed; never synthesize evidence.",
      "Every acceptance_mapping.evidence_ref must exactly match one source_refs entry.",
      "Do not read CLI source or schema files unless this contract is rejected."
    ]
  };
}

function semanticEvidenceTemplate(evidenceType, action) {
  if (!evidenceType) return null;
  const sourceRef = action.read_scope?.[0] || ".apex-v2/intake/items.json";
  const base = {
    schema_version: "v0",
    evidence_type: evidenceType,
    objective: action.objective,
    source_refs: [sourceRef],
    claims: ["<specific source-backed claim>"],
    uncertainties: [],
    acceptance_mapping: [{
      criterion: "<acceptance criterion>",
      evidence_ref: sourceRef,
      status: "supported"
    }],
    created_at: "<ISO-8601 timestamp>"
  };
  if (evidenceType === "design") {
    return {
      ...base,
      slices: ["<implementation slice>"],
      dependencies: [],
      verification: ["<verification command>"],
      rollback: ["<rollback step>"]
    };
  }
  if (evidenceType === "risk") {
    return {
      ...base,
      failure_paths: ["<failure path>"],
      blast_radius: ["<affected surface>"],
      mitigations: ["<mitigation>"],
      rollback: ["<rollback step>"]
    };
  }
  return {
    ...base,
    candidate_digest: action.candidate_digest,
    findings: [],
    residual_risks: [],
    merge_posture: "approve"
  };
}

function semanticEvidenceFieldConstraints(evidenceType, action) {
  const constraints = {
    schema_version: { const: "v0" },
    evidence_type: { const: evidenceType },
    objective: { const: action.objective },
    source_refs: { type: "array", minItems: 1 },
    claims: { type: "array", minItems: 1 },
    uncertainties: { type: "array" },
    acceptance_mapping: {
      type: "array",
      minItems: 1,
      item_required: ["criterion", "evidence_ref", "status"],
      status_enum: ["supported", "partial", "unverified"]
    },
    created_at: { type: "string" }
  };
  if (evidenceType === "design") {
    return {
      ...constraints,
      slices: { type: "array", minItems: 1 },
      dependencies: { type: "array" },
      verification: { type: "array", minItems: 1 },
      rollback: { type: "array", minItems: 1 }
    };
  }
  if (evidenceType === "risk") {
    return {
      ...constraints,
      failure_paths: { type: "array", minItems: 1 },
      blast_radius: { type: "array", minItems: 1 },
      mitigations: { type: "array", minItems: 1 },
      rollback: { type: "array", minItems: 1 }
    };
  }
  return {
    ...constraints,
    candidate_digest: {
      const: action.candidate_digest,
      pattern: "^[a-f0-9]{64}$"
    },
    findings: { type: "array" },
    residual_risks: { type: "array" },
    merge_posture: { enum: ["approve", "conditional", "block"] }
  };
}

function summarizeRequiredProperties(schema) {
  return Object.fromEntries((schema?.required || []).map((name) => [
    name,
    summarizeSchemaProperty(schema?.properties?.[name])
  ]));
}

function summarizeSchemaProperty(property) {
  if (!property || typeof property !== "object") return {};
  const summary = {};
  for (const key of ["type", "enum", "const", "minItems", "minimum", "pattern"]) {
    if (property[key] != null) summary[key] = property[key];
  }
  if (property.items?.required) {
    summary.item_required = property.items.required;
  }
  return summary;
}

function auditProject(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const timestamp = now();
  const objective = String(args.objective || "把 Apex Forge V2 实现为项目级半自动化产研工厂：持续接收需求、多线并行研发、自动测试、最高证据、自动合并与冲突处理。");
  const testExecution = runProjectAuditTests(projectDir, {
    command: "npm test",
    skip: Boolean(args["skip-tests"])
  });
  const summary = collectAuditSummary(root, projectDir, testExecution, {
    evaluateAdapterCapabilityDrift,
    findFilesByName,
    findRunFiles,
    getWorkers,
    listRunStates,
    workerSuccessfullyCompleted
  });
  const checks = buildAuditChecks(summary);
  const status = checks.every((check) => check.status === "PASS")
    ? "PASS"
    : checks.some((check) => check.status === "FAIL")
      ? "FAIL"
      : "PARTIAL";
  const report = {
    schema_version: SCHEMA_VERSION,
    audit_id: shortId("audit"),
    created_at: timestamp,
    objective,
    status,
    checks,
    summary
  };
  const auditDir = join(root, "audits");
  ensureDir(auditDir);
  writeJson(join(auditDir, `${report.audit_id}.json`), report);
  writeFileSync(join(auditDir, `${report.audit_id}.md`), renderAuditMarkdown(report));
  const event = appendEvent(root, "project.audit", "apex-v2", {
    audit_id: report.audit_id,
    status: report.status
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  if (args["create-intake"]) {
    const createdIntake = createIntakeFromAuditGaps(root, report);
    console.log(JSON.stringify({ report, created_intake: createdIntake }, null, 2));
    return;
  }
  console.log(JSON.stringify(report, null, 2));
}

function createIntakeFromAuditGaps(root, report) {
  const path = join(root, "intake", "items.json");
  const items = readJson(path, []);
  const created = [];
  for (const check of report.checks.filter((item) => item.status !== "PASS")) {
    const dedupe = `audit-gap:${check.id}`;
    const existing = items.find((item) => item.evidence_refs?.includes(dedupe) && item.triage.status !== "rejected");
    if (existing) continue;
    const timestamp = now();
    const intake = {
      schema_version: SCHEMA_VERSION,
      id: shortId("intake"),
      source: "project-audit",
      type: "tech_debt",
      title: `Audit gap：${check.claim}`,
      description: `${check.gap}\n\nEvidence:\n${check.evidence.join("\n")}`,
      priority: check.status === "FAIL" ? "P1" : "P2",
      risk: check.status === "FAIL" ? "high" : "medium",
      affected_area: `audit/${check.id}`,
      evidence_refs: [
        dedupe,
        `.apex-v2/audits/${report.audit_id}.json`,
        `.apex-v2/audits/${report.audit_id}.md`
      ],
      triage: {
        status: "new",
        decision: null,
        target_milestone: null,
        reason: null
      },
      created_at: timestamp,
      updated_at: timestamp
    };
    items.push(intake);
    created.push(intake);
  }
  writeJson(path, items);
  if (created.length > 0) {
    const event = appendEvent(root, "audit.intake.created", "apex-v2", {
      audit_id: report.audit_id,
      intake_ids: created.map((item) => item.id)
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  return created;
}

function verifyReadyRuns(root, runIds, projectDir) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "execute").status !== "passed") continue;
    if (getRunNode(run, "verify").status !== "pending") continue;
    const result = runVerificationInternal(root, run, projectDir);
    if (result.report.status === "PASS") {
      passNode(root, run.run_id, "verify", result.artifact_id, "project tick 自动完成 verification report。");
    }
    out.push({ run_id: run.run_id, status: result.report.status, artifact_id: result.artifact_id });
  }
  return out;
}

function reviewReadyRuns(root, runIds) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "verify").status !== "passed") continue;
    if (getRunNode(run, "review").status !== "pending") continue;
    const plan = loadPlanGraph(root, runId);
    if (usesPostVerificationReview(plan)) {
      const reviewWorker = latestWorkerForPlanNode(
        getWorkers(root, runId).filter((worker) =>
          workerCountsForCurrentStage(root, run, worker)
        ),
        "delivery-review"
      );
      if (!reviewWorker || !workerSuccessfullyCompleted(reviewWorker)) continue;
    }
    const result = generateReviewInternal(root, run);
    if (result.report.status === "PASS") {
      passNode(root, run.run_id, "review", result.artifact_id, "project tick 自动完成 review report。");
      resolveGovernedRework(root, run.run_id);
    } else if (
      usesPostVerificationReview(plan)
      && governedReviewRequestsRework(root, run.run_id)
    ) {
      reopenGovernedCandidate(root, run.run_id, result.report);
    }
    out.push({ run_id: run.run_id, status: result.report.status, artifact_id: result.artifact_id });
  }
  return out;
}

function governedReviewRequestsRework(root, runId) {
  const reviewWorker = latestWorkerForPlanNode(
    getWorkers(root, runId),
    "delivery-review"
  );
  if (!reviewWorker) return false;
  const dir = workerDir(root, runId, reviewWorker.worker_id);
  const artifact = readdirSync(dir)
    .filter((name) =>
      name.startsWith("evidence-artifact-") && name.endsWith(".json")
    )
    .map((name) => readJson(join(dir, name), null))
    .filter(Boolean)
    .sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at))
    )
    .at(-1);
  const evidence = artifact?.sections?.find((section) =>
    section.kind === "semantic"
  )?.content;
  return ["block", "conditional"].includes(evidence?.merge_posture);
}

function reopenGovernedCandidate(root, runId, report) {
  return withProjectTransaction(resolve(root, ".."), {
    kind: "review-rework",
    idempotencyKey: `review-rework:${runId}:${report.candidate_digest}`
  }, () => {
    const run = loadRun(root, runId);
    const timestamp = now();
    for (const nodeId of ["execute", "verify", "review"]) {
      const node = getRunNode(run, nodeId);
      node.status = "pending";
      node.started_at = null;
      node.completed_at = null;
      node.evidence_refs = [];
      node.gate = null;
    }
    run.status = "active";
    run.updated_at = timestamp;
    writeRun(root, run);

    const queuePath = join(root, "runs", runId, "merge-queue.json");
    const queue = readJson(queuePath, {
      schema_version: SCHEMA_VERSION,
      run_id: runId,
      updated_at: timestamp,
      items: [],
      conflicts: [],
      resolutions: []
    });
    for (const item of queue.items) {
      if (item.status === "merged" || item.status === "dropped") continue;
      item.status = "dropped";
      const patchInfo = findPatchWithPath(root, runId, item.patch_id);
      patchInfo.patch.status = "dropped";
      patchInfo.patch.updated_at = timestamp;
      updatePatchBundle(root, patchInfo.patch);
      const worker = findWorker(root, item.worker_id);
      worker.status = "dropped";
      worker.updated_at = timestamp;
      writeJson(join(
        workerDir(root, worker.run_id, worker.worker_id),
        "worker.json"
      ), worker);
    }
    queue.conflicts = [];
    queue.updated_at = timestamp;
    writeJson(queuePath, queue);

    const path = join(root, "runs", runId, "rework-request.json");
    const previous = readJson(path, null);
    const request = {
      schema_version: SCHEMA_VERSION,
      run_id: runId,
      generation: Number(previous?.generation || 0) + 1,
      status: "open",
      candidate_digest: report.candidate_digest,
      findings: report.blocking_findings,
      superseded_worker_ids: getWorkers(root, runId)
        .filter((worker) => [
          "delivery-implementation",
          "delivery-tests",
          "delivery-review"
        ].includes(worker.plan_node_id))
        .map((worker) => worker.worker_id),
      requested_at: timestamp,
      resolved_at: null
    };
    writeJson(path, request);
    const event = appendEvent(root, "review.rework.requested", "apex-v2", {
      run_id: runId,
      generation: request.generation,
      candidate_digest: request.candidate_digest,
      findings: request.findings
    });
    updateProject(root, {
      last_event_id: event.event_id,
      updated_at: event.timestamp
    });
    return request;
  }).result;
}

function resolveGovernedRework(root, runId) {
  const path = join(root, "runs", runId, "rework-request.json");
  const request = readJson(path, null);
  if (!request || request.status !== "open") return null;
  return withProjectTransaction(resolve(root, ".."), {
    kind: "review-rework-resolve",
    idempotencyKey: [
      "review-rework-resolve",
      runId,
      request.generation,
      request.candidate_digest
    ].join(":")
  }, () => {
    const current = readJson(path, null);
    if (!current || current.status !== "open") return current;
    current.status = "resolved";
    current.resolved_at = now();
    writeJson(path, current);
    const event = appendEvent(root, "review.rework.resolved", "apex-v2", {
      run_id: runId,
      generation: current.generation,
      candidate_digest: current.candidate_digest
    });
    updateProject(root, {
      last_event_id: event.event_id,
      updated_at: event.timestamp
    });
    return current;
  }).result;
}

function integrateReadyRuns(root, runIds) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "review").status !== "passed") continue;
    if (getRunNode(run, "integrate").status !== "pending") continue;
    try {
      const result = applyMergeInternal(root, run);
      passNode(root, run.run_id, "integrate", result.artifact_id, `project tick 自动完成 integration：${result.report.status}`);
      out.push({ run_id: run.run_id, status: result.report.status, artifact_id: result.artifact_id });
    } catch (error) {
      out.push({ run_id: run.run_id, status: "BLOCKED", error: error.message });
    }
  }
  return out;
}

function learnReadyRuns(root, runIds) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "integrate").status !== "passed") continue;
    if (getRunNode(run, "learn").status !== "pending") continue;
    const transition = withProjectTransaction(resolve(root, ".."), {
      kind: "learning-governance",
      idempotencyKey: `learning-governance-v2:${run.run_id}:proposal-queued`
    }, () => learnReadyRunTransaction(root, run)).result;
    out.push(transition);
  }
  return out;
}

function learnReadyRunTransaction(root, run) {
  const result = proposeLearningInternal(root, run);
  const proposalIds = result.proposals.map((proposal) => proposal.id);
  const jobIds = result.jobs.map((job) => job.job_id);
  const current = loadRun(root, run.run_id);
  current.learning_proposal_ids = proposalIds;
  current.learning_apply_job_ids = jobIds;
  writeRun(root, current);
  passNode(
    root,
    run.run_id,
    "learn",
    result.artifact_id,
    "learning proposal 已进入 durable queue；apply 在交付关闭后异步执行。"
  );
  return {
    run_id: run.run_id,
    proposal_ids: proposalIds,
    queue_job_ids: jobIds,
    applied: [],
    artifact_id: result.artifact_id
  };
}

async function runProjectAgentScheduler(root, limit, args) {
  const policy = readJson(join(root, "policies", "execution.json"));
  const configuredCycles = Number(
    args["agent-cycles"]
    || policy.budgets?.max_agent_cycles_per_tick
    || 12
  );
  if (!Number.isInteger(configuredCycles) || configuredCycles <= 0) {
    throw new Error("--agent-cycles 必须是正整数");
  }
  const aggregate = {
    max_cycles: configuredCycles,
    max_agent_runs: Number(policy.budgets?.max_agent_runs_per_tick || limit),
    cycles: [],
    stop_reason: "max-cycles",
    dispatched_workers: [],
    retried_workers: [],
    fallback_workers: [],
    worker_runs: [],
    agent_runs: [],
    collected_results: [],
    completed_execute_runs: [],
    recovered_workers: [],
    terminalized_runs: []
  };
  let remainingAgentRuns = aggregate.max_agent_runs;

  for (let cycle = 1; cycle <= configuredCycles; cycle += 1) {
    const runIds = readJson(join(root, "project.json")).active_runs;
    if (runIds.length === 0) {
      aggregate.stop_reason = "no-active-runs";
      break;
    }

    const recovered = recoverExpiredWorkerExecutions(root, runIds);
    const fallback = fallbackBlockedAgents(root, runIds, limit);
    const retry = retryBlockedWorkers(root, runIds, limit);
    const dispatched = dispatchReadyWorkers(root, runIds, {
      mode: args["execution-mode"] ? String(args["execution-mode"]) : null,
      limit
    });
    const deterministic = runReadyWorkerAdapters(root, runIds, limit);
    const batchLimit = Math.min(limit, remainingAgentRuns);
    const agents = batchLimit > 0
      ? await runReadyCodingAgents(root, runIds, batchLimit, args)
      : [];
    remainingAgentRuns -= agents.filter((item) => item.status !== "STALE").length;
    const collected = collectWorkerResults(root, runIds);
    const completed = completeReadyExecuteNodes(root, runIds);
    const terminalized = haltTerminallyBlockedRuns(root, runIds);
    const progressCount = [
      ...fallback.filter((item) => item.status === "FALLBACK_READY"),
      ...recovered,
      ...retry.filter((item) => item.status === "RETRY_READY"),
      ...dispatched,
      ...deterministic,
      ...agents.filter((item) => item.status !== "STALE"),
      ...collected,
      ...completed,
      ...terminalized
    ].length;

    aggregate.fallback_workers.push(...fallback);
    aggregate.recovered_workers.push(...recovered);
    aggregate.retried_workers.push(...retry);
    aggregate.dispatched_workers.push(...dispatched);
    aggregate.worker_runs.push(...deterministic);
    aggregate.agent_runs.push(...agents);
    aggregate.collected_results.push(...collected);
    aggregate.completed_execute_runs.push(...completed);
    aggregate.terminalized_runs.push(...terminalized);
    aggregate.cycles.push({
      cycle,
      progress_count: progressCount,
      recovered_workers: recovered.map((item) => item.worker_id),
      dispatched_workers: dispatched.map((item) => item.worker_id),
      fallback_workers: fallback
        .filter((item) => item.status === "FALLBACK_READY")
        .map((item) => item.worker_id),
      retried_workers: retry
        .filter((item) => item.status === "RETRY_READY")
        .map((item) => item.worker_id),
      deterministic_workers: deterministic.map((item) => item.worker_id),
      agent_workers: agents.map((item) => item.worker_id),
      collected_workers: collected.map((item) => item.worker_id),
      completed_runs: completed.map((item) => item.run_id),
      terminalized_runs: terminalized.map((item) => item.run_id)
    });

    if (terminalized.length > 0) {
      aggregate.stop_reason = "terminal-failure";
      break;
    }
    if (remainingAgentRuns <= 0) {
      aggregate.stop_reason = "agent-run-budget";
      break;
    }
    if (progressCount === 0) {
      aggregate.stop_reason = schedulerStopReason(root, runIds);
      break;
    }
    if (cycle === configuredCycles) {
      aggregate.stop_reason = "max-cycles";
    }
  }

  return aggregate;
}

function haltTerminallyBlockedRuns(root, runIds) {
  const candidates = runIds.map((runId) => ({
    runId,
    workers: getWorkers(root, runId)
  })).filter(({ workers }) => {
    const blocked = workers.some((worker) => worker.status === "blocked");
    const stillRunning = workers.some((worker) =>
      ["active", "running", "claimed"].includes(worker.status)
    );
    return blocked && !stillRunning;
  });
  if (candidates.length === 0) return [];

  const retryPolicy = readJson(join(root, "policies", "retry.json"));
  const executionPolicy = readJson(join(root, "policies", "execution.json"));
  const availableExecutors = new Set(
    inspectWorkerExecutors()
      .filter((item) => item.available)
      .map((item) => item.adapter)
  );
  const halted = [];

  for (const { runId, workers } of candidates) {
    const blockedWorkers = workers.filter((worker) => worker.status === "blocked");
    const terminalWorkers = blockedWorkers.filter((worker) =>
      !blockedWorkerCanRecover(
        root,
        worker,
        retryPolicy,
        executionPolicy,
        availableExecutors
      )
    );
    if (terminalWorkers.length !== blockedWorkers.length) continue;

    const transition = withProjectTransaction(resolve(root, ".."), {
      kind: "run-terminal-worker-failure",
      idempotencyKey: `run-terminal-worker-failure:${runId}`
    }, () => {
      const run = loadRun(root, runId);
      if (run.status !== "active") return null;
      const timestamp = now();
      const executeNode = getRunNode(run, "execute");
      const blocking = terminalWorkers.map((worker) => worker.worker_id);
      const reason = `worker 恢复路径已耗尽：${blocking.join(", ")}`;
      executeNode.status = "halted";
      executeNode.started_at = executeNode.started_at || timestamp;
      executeNode.completed_at = timestamp;
      executeNode.evidence_refs = [];
      executeNode.gate = {
        status: "HALT",
        reason,
        blocking,
        carry_forward_ids: []
      };
      run.gate = executeNode.gate;
      haltRun(root, run, timestamp);
      writeRun(root, run);
      appendEvent(root, "run.node.completed", "apex-v2", {
        run_id: run.run_id,
        node_id: executeNode.id,
        gate: "HALT",
        evidence_refs: [],
        blocking,
        via: "project.tick"
      });
      const event = appendEvent(root, "run.halted", "apex-v2", {
        run_id: run.run_id,
        roadmap_node_id: run.roadmap_node_id,
        node_id: executeNode.id,
        reason,
        blocking_worker_ids: blocking,
        via: "project.tick"
      });
      updateProject(root, {
        last_event_id: event.event_id,
        updated_at: event.timestamp
      });
      return {
        run_id: run.run_id,
        status: "HALTED",
        blocking_worker_ids: blocking,
        reason
      };
    }).result;
    if (transition) halted.push(transition);
  }

  return halted;
}

function blockedWorkerCanRecover(
  root,
  worker,
  retryPolicy,
  executionPolicy,
  availableExecutors
) {
  const latest = latestWorkerAdapterResult(root, worker);
  const failureKind = latest?.failure_kind || "unknown";
  const adapter = worker.last_adapter || worker.executor_id || worker.adapter;
  const maxAttempts = Number(retryPolicy.max_attempts?.[adapter] || 1);
  const retryable = retryPolicy.auto_retry?.enabled === true
    && retryPolicy.auto_retry.retryable_failure_kinds.includes(failureKind)
    && Number(worker.attempt || 0) < maxAttempts;
  if (retryable) return true;

  const permissions = executionPolicy.permissions || {};
  if (!permissions.adapter_fallback_failure_kinds?.includes(failureKind)) {
    return false;
  }
  const order = permissions.adapter_fallback_order || [];
  const start = Math.max(-1, order.indexOf(adapter));
  return order.slice(start + 1).some((candidate) =>
    permissions.allowed_adapters?.includes(candidate)
    && availableExecutors.has(candidate)
  );
}

function schedulerStopReason(root, runIds) {
  const workers = runIds.flatMap((runId) => getWorkers(root, runId));
  if (workers.some((worker) =>
    worker.adapter === "host"
    && ["active", "claimed"].includes(worker.status)
  )) {
    return "waiting-for-coordinator";
  }
  if (workers.some((worker) => worker.status === "blocked")) {
    return "blocked";
  }
  if (workers.some((worker) => worker.status === "running")) {
    return "worker-running";
  }
  return "drained";
}

function runReadyWorkerAdapters(root, runIds, limit) {
  const out = [];
  for (const runId of runIds) {
    if (out.length >= limit) break;
    for (const worker of getWorkers(root, runId)) {
      if (out.length >= limit) break;
      if (worker.status !== "active") continue;
      if ((worker.adapter || "shell") !== "shell") continue;
      const command = chooseWorkerCommand(worker);
      if (!command) continue;
      const result = executeWorkerShell(root, worker, command, "project.tick");
      out.push({
        run_id: worker.run_id,
        worker_id: worker.worker_id,
        plan_node_id: worker.plan_node_id,
        status: result.adapterResult.status,
        artifact_id: result.artifact.artifact_id,
        command
      });
    }
  }
  return out;
}

function retryBlockedWorkers(root, runIds, limit) {
  const out = [];
  const policy = readJson(join(root, "policies", "retry.json"));
  if (!policy.auto_retry.enabled) return out;
  for (const runId of runIds) {
    if (out.length >= limit) break;
    for (const worker of getWorkers(root, runId)) {
      if (out.length >= limit) break;
      if (worker.status !== "blocked") continue;
      try {
        const result = retryWorkerInternal(root, worker, "project.tick");
        out.push({
          run_id: runId,
          worker_id: worker.worker_id,
          status: "RETRY_READY",
          ...result.policy
        });
      } catch (error) {
        out.push({
          run_id: runId,
          worker_id: worker.worker_id,
          status: "NOT_RETRYABLE",
          reason: error.message
        });
      }
    }
  }
  return out;
}

function fallbackBlockedAgents(root, runIds, limit) {
  const out = [];
  const executorIds = new Set(inspectWorkerExecutors().map((item) => item.executor_id));
  for (const runId of runIds) {
    if (out.length >= limit) break;
    for (const worker of getWorkers(root, runId)) {
      if (out.length >= limit) break;
      if (worker.status !== "blocked" || !executorIds.has(worker.last_adapter || worker.executor_id || worker.adapter)) continue;
      try {
        const result = fallbackWorkerInternal(root, worker, "project.tick");
        out.push({ run_id: runId, worker_id: worker.worker_id, status: "FALLBACK_READY", from: result.from, to: result.to, failure_kind: result.failure_kind });
      } catch (error) {
        out.push({ run_id: runId, worker_id: worker.worker_id, status: "NO_FALLBACK", reason: error.message });
      }
    }
  }
  return out;
}

async function runReadyCodingAgents(root, runIds, limit, args) {
  const out = [];
  const executorIds = new Set(inspectWorkerExecutors().map((item) => item.executor_id));
  const requestedSandbox = normalizeEnum(args["agent-sandbox"] || "worktree", ["scratch", "worktree"], "agent-sandbox");
  const timeoutMs = effectiveAgentTimeout(root, Number(args["agent-timeout-ms"] || 30 * 60 * 1000));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--agent-timeout-ms 必须是正整数");
  }

  const selected = [];
  for (const runId of runIds) {
    if (selected.length >= limit) break;
    const run = loadRun(root, runId);
    const plan = loadPlanGraph(root, runId);
    for (const worker of getWorkers(root, runId)) {
      if (selected.length >= limit) break;
      const executorId = worker.executor_id || worker.adapter;
      if (worker.status !== "active" || !executorIds.has(executorId)) continue;
      let selection = {
        run,
        worker,
        planNode: null,
        executorId,
        claimToken: null,
        job: null
      };
      try {
        assertAdapterAllowed(root, executorId);
        const planNode = getPlanNode(plan, worker.plan_node_id);
        const claim = claimWorkerExecution(
          root,
          worker.worker_id,
          timeoutMs + 30000,
          "project.tick"
        );
        if (!claim.claimed) continue;
        selection = {
          ...selection,
          worker: claim.worker,
          planNode,
          claimToken: claim.claim_token
        };
        const initialized = initializeWorkerSandbox(
          root,
          claim.worker,
          requestedSandbox
        ).worker;
        selection = {
          ...selection,
          worker: initialized,
          planNode,
          executorId,
          claimToken: claim.claim_token,
          job: {
            id: initialized.worker_id,
            command: process.execPath,
            args: workerAgentChildArgs({
              projectDir: resolve(root, ".."),
              worker: initialized,
              executorId,
              timeoutMs,
              executionClaimToken: claim.claim_token,
              agentCommand: args["agent-command"],
              agentModel: args["agent-model"],
              agentProfile: args["agent-profile"]
            }),
            cwd: resolve(root, ".."),
            timeoutMs: timeoutMs + 15000,
            maxOutputBytes: 16 * 1024 * 1024
          }
        };
        selected.push(selection);
      } catch (error) {
        out.push(recordSupervisorFailure(root, selection, {
          status: "failed",
          command: process.execPath,
          args: [],
          stderr: error.message,
          stdout: "",
          exit_code: 1,
          duration_ms: 0,
          timed_out: false
        }));
      }
    }
  }
  const supervisorResults = await runWorkerJobs(
    selected.map((item) => item.job),
    {
      maxConcurrency: Math.max(1, Math.min(limit, selected.length || 1)),
      defaultTimeoutMs: timeoutMs + 15000
    }
  );
  for (const [index, supervised] of supervisorResults.entries()) {
    const selection = selected[index];
    if (supervised.status !== "succeeded") {
      out.push(recordSupervisorFailure(root, selection, supervised));
      continue;
    }
    let result;
    try {
      result = JSON.parse(supervised.stdout);
    } catch {
      out.push(recordSupervisorFailure(root, selection, {
        ...supervised,
        status: "failed",
        stderr: [
          supervised.stderr,
          "worker child returned invalid JSON"
        ].filter(Boolean).join("\n")
      }));
      continue;
    }
    let queueStatus = null;
    let queueError = null;
    if (result.patch) {
      try {
        const currentRun = loadRun(root, selection.run.run_id);
        const queue = enqueuePatchInternal(root, currentRun, result.patch);
        queueStatus = queue.conflicts.length > 0 ? "blocked_conflict" : "queued";
      } catch (error) {
        queueStatus = "enqueue_failed";
        queueError = error.message;
        const event = appendEvent(root, "worker.patch.enqueue.failed", "apex-v2", {
          run_id: selection.run.run_id,
          worker_id: selection.worker.worker_id,
          patch_id: result.patch.patch_id,
          error: error.message
        });
        updateProject(root, {
          last_event_id: event.event_id,
          updated_at: event.timestamp
        });
      }
    }
    out.push({
      run_id: selection.run.run_id,
      worker_id: selection.worker.worker_id,
      plan_node_id: selection.worker.plan_node_id,
      status: result.result?.status || "FAIL",
      patch_id: result.patch?.patch_id || null,
      queue_status: queueStatus,
      queue_error: queueError,
      artifact_id: result.artifact_id || null,
      supervisor_status: supervised.status,
      duration_ms: supervised.duration_ms
    });
  }
  return out;
}

function workerAgentChildArgs({
  projectDir,
  worker,
  executorId,
  timeoutMs,
  executionClaimToken,
  agentCommand,
  agentModel,
  agentProfile
}) {
  const values = [
    fileURLToPath(import.meta.url),
    "worker",
    "exec-agent",
    "--project",
    projectDir,
    "--worker-id",
    worker.worker_id,
    "--adapter",
    executorId,
    "--timeout-ms",
    String(timeoutMs),
    "--execution-claim-token",
    executionClaimToken
  ];
  if (agentCommand) values.push("--command", String(agentCommand));
  if (agentModel) values.push("--model", String(agentModel));
  if (agentProfile) values.push("--profile", String(agentProfile));
  return values;
}

function recordSupervisorFailure(root, selection, supervised) {
  return withProjectTransaction(resolve(root, ".."), {
    kind: "worker-supervisor-failure",
    idempotencyKey: [
      "worker-supervisor-failure",
      selection.worker.worker_id,
      selection.claimToken || "unclaimed",
      shortId("failure")
    ].join(":")
  }, () => recordSupervisorFailureTransaction(
    root,
    selection,
    supervised
  )).result;
}

function recordSupervisorFailureTransaction(root, selection, supervised) {
  const worker = findWorker(root, selection.worker.worker_id);
  if (
    (
      selection.claimToken
      && (
        worker.status !== "running"
        || worker.execution_claim_token !== selection.claimToken
      )
    )
    || (
      !selection.claimToken
      && (
        worker.status !== "active"
        || worker.updated_at !== selection.worker.updated_at
      )
    )
  ) {
    const event = appendEvent(root, "worker.supervisor.stale", "apex-v2", {
      run_id: worker.run_id,
      worker_id: worker.worker_id,
      expected_claim_token: selection.claimToken,
      current_status: worker.status,
      supervisor_status: supervised.status
    });
    updateProject(root, {
      last_event_id: event.event_id,
      updated_at: event.timestamp
    });
    return {
      run_id: worker.run_id,
      worker_id: worker.worker_id,
      plan_node_id: worker.plan_node_id,
      status: "STALE",
      error: supervised.stderr || supervised.status,
      supervisor_status: supervised.status
    };
  }
  const failureKind = supervised.timed_out ? "timeout" : "execution_error";
  const timestamp = now();
  const result = {
    schema_version: SCHEMA_VERSION,
    result_id: shortId("adapter"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    adapter: selection.executorId,
    executor_id: selection.executorId,
    model_tier: worker.model_tier || "standard",
    requested_model: worker.model_id || null,
    reported_model: null,
    status: "FAIL",
    failure_kind: failureKind,
    command: [supervised.command, ...(supervised.args || [])].join(" "),
    summary: supervised.stderr || `worker supervisor ${supervised.status}`,
    adapter_version: "",
    session_id: null,
    executable: supervised.command,
    exit_code: supervised.exit_code ?? 1,
    duration_ms: supervised.duration_ms || 0,
    stdout_tail: tail(supervised.stdout),
    stderr_tail: tail(supervised.stderr),
    changed_files: [],
    out_of_scope_files: [],
    unsupported_files: [],
    usage: {
      input_tokens: null,
      output_tokens: null,
      tool_calls: null,
      agent_turns: null
    },
    cost_evaluation: {
      status: "NOT_CONFIGURED",
      exceeded: [],
      unknown: []
    },
    capability_evidence_status: {
      enforcement: worker.capability_enforcement || "shadow",
      submitted: [],
      missing: (worker.capability_bindings || [])
        .filter((binding) => binding.required)
        .map((binding) => binding.capability_id),
      error: supervised.stderr || supervised.status
    },
    semantic_evidence_status: {
      required: worker.execution_class === "cognitive",
      valid: false,
      error: supervised.stderr || supervised.status
    },
    refs: [],
    created_at: timestamp
  };
  writeJson(
    join(
      workerDir(root, worker.run_id, worker.worker_id),
      `adapter-result-${result.result_id}.json`
    ),
    result
  );
  worker.status = "blocked";
  worker.last_adapter = selection.executorId;
  worker.attempt = Number(worker.attempt || 0) + 1;
  worker.execution_claim_token = null;
  worker.execution_claimed_at = null;
  worker.execution_claim_expires_at = null;
  worker.updated_at = timestamp;
  writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
  const event = appendEvent(root, "worker.supervisor.failed", "apex-v2", {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    result_id: result.result_id,
    failure_kind: failureKind,
    supervisor_status: supervised.status
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return {
    run_id: worker.run_id,
    worker_id: worker.worker_id,
    plan_node_id: worker.plan_node_id,
    status: "FAIL",
    error: result.summary,
    supervisor_status: supervised.status
  };
}

function chooseWorkerCommand(worker) {
  const candidates = worker.verification || [];
  return candidates.find((command) => command.includes("node --check"))
    || candidates.find((command) => command.includes("validate --project"))
    || candidates[0]
    || null;
}

function collectWorkerResults(root, runIds) {
  const collected = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (run.status !== "active") continue;
    const queue = readDecisionQueue(root, runId);
    for (const worker of getWorkers(root, runId)) {
      if (!["evidence_submitted", "decision_submitted"].includes(worker.status)) continue;
      if (queue.items.some((item) => item.worker_id === worker.worker_id)) continue;
      const artifacts = findArtifactsForWorker(root, runId, worker);
      const results = findAdapterResultsForWorker(root, worker);
      if (artifacts.length === 0 || results.length === 0) continue;
      const item = {
        worker_id: worker.worker_id,
        plan_node_id: worker.plan_node_id,
        kind: worker.status === "decision_submitted" ? "decision" : "evidence",
        status: "collected",
        artifact_ids: artifacts.map((artifact) => artifact.artifact_id),
        result_ids: results.map((result) => result.result_id)
      };
      queue.items.push(item);
      collected.push({ run_id: runId, ...item });
    }
    writeDecisionQueue(root, queue);
  }
  return collected;
}

function completeReadyExecuteNodes(root, runIds) {
  const completed = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    const executeNode = getRunNode(run, "execute");
    if (executeNode.status !== "pending") continue;
    const plan = loadPlanGraph(root, runId);
    const workers = getWorkers(root, runId);
    if (workers.length === 0) continue;
    const workersByPlanNode = latestWorkersByPlanNode(
      workers.filter((worker) => workerCountsForCurrentStage(
        root,
        run,
        worker
      ))
    );
    const executePlanNodes = usesPostVerificationReview(plan)
      ? plan.nodes.filter((node) => node.barrier_id !== "delivery-readiness")
      : plan.nodes;
    if (executePlanNodes.some((node) => !workersByPlanNode.has(node.id))) continue;
    const executeWorkers = executePlanNodes.map((node) =>
      workersByPlanNode.get(node.id)
    );
    if (executeWorkers.some((worker) => !workerSuccessfullyCompleted(worker))) continue;

    const evidenceRefs = [];
    let ready = true;
    const decisionQueue = readDecisionQueue(root, runId);

    for (const worker of executeWorkers) {
      if (["evidence_submitted", "decision_submitted"].includes(worker.status)) {
        const item = decisionQueue.items.find((entry) => entry.worker_id === worker.worker_id);
        if (!item) {
          ready = false;
          break;
        }
        evidenceRefs.push(...item.artifact_ids);
      } else if (["queued", "merged"].includes(worker.status)) {
        const artifacts = findArtifactsForWorker(root, runId, worker);
        if (artifacts.length === 0) {
          ready = false;
          break;
        }
        evidenceRefs.push(...artifacts.map((artifact) => artifact.artifact_id));
      } else {
        ready = false;
        break;
      }
    }

    const uniqueEvidenceRefs = Array.from(new Set(evidenceRefs));
    if (!ready || uniqueEvidenceRefs.length === 0) continue;
    passNode(root, runId, "execute", uniqueEvidenceRefs.join(","), "project tick 自动收集 worker result 并通过 execute。");
    completed.push({ run_id: runId, evidence_refs: uniqueEvidenceRefs });
  }
  return completed;
}

function readDecisionQueue(root, runId) {
  return readJson(join(root, "runs", runId, "decision-queue.json"), {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    updated_at: now(),
    items: []
  });
}

function writeDecisionQueue(root, queue) {
  queue.updated_at = now();
  writeJson(join(root, "runs", queue.run_id, "decision-queue.json"), queue);
}

function findArtifactsForWorker(root, runId, worker) {
  const artifactDir = join(root, "artifacts", runId);
  if (!existsSync(artifactDir)) return [];
  return readDirectoryJsonFiles(artifactDir)
    .map((file) => readJson(join(artifactDir, file)))
    .filter((artifact) => artifact.refs.some((ref) => ref.startsWith(`${worker.namespace}/`)));
}

function findAdapterResultsForWorker(root, worker) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  if (!existsSync(dir)) return [];
  const results = readdirSync(dir)
    .filter((file) => file.startsWith("adapter-result-") && file.endsWith(".json"))
    .map((file) => readJson(join(dir, file)));
  const hostResult = readJson(join(dir, "host-result.json"), null);
  if (hostResult) {
    results.push({
      result_id: hostResult.action_id,
      adapter: hostResult.host_id,
      status: hostResult.status === "completed" ? "PASS" : "FAIL",
      summary: hostResult.summary,
      created_at: hostResult.created_at
    });
  }
  return results;
}

function dispatchReadyWorkers(root, runIds, options = {}) {
  const project = readJson(join(root, "project.json"));
  const dispatched = [];
  const requestedLimit = Number.isInteger(Number(options.limit))
    ? Math.max(0, Number(options.limit))
    : Number.POSITIVE_INFINITY;
  let available = Math.min(
    requestedLimit,
    Math.max(0, project.wip_limits.parallel_workers - countOpenWorkers(root))
  );
  if (available <= 0) return dispatched;

  for (const runId of runIds) {
    if (available <= 0) break;
    const run = loadRun(root, runId);
    if (getRunNode(run, "plan_graph").status !== "passed") continue;

    const plan = loadPlanGraph(root, runId);
    const governedV2 = usesPostVerificationReview(plan);
    const executePending = getRunNode(run, "execute").status === "pending";
    const reviewPending = getRunNode(run, "review").status === "pending";
    if (!executePending && !(governedV2 && reviewPending)) continue;
    const workers = getWorkers(root, runId);
    const existingPlanNodeIds = new Set(
      workers.filter((worker) =>
        workerCountsForCurrentStage(root, run, worker)
      ).map((worker) => worker.plan_node_id)
    );
    const completedPlanNodeIds = new Set(
      workers.filter(workerSuccessfullyCompleted).map((worker) => worker.plan_node_id)
    );
    const readyNodes = plan.nodes.filter((node) => {
      if (existingPlanNodeIds.has(node.id)) return false;
      if (!node.dependencies.every((dependency) =>
        completedPlanNodeIds.has(dependency)
      )) return false;
      if (!governedV2) return executePending;
      if (node.barrier_id === "delivery-readiness") {
        return getRunNode(run, "verify").status === "passed";
      }
      return executePending;
    });

    for (const planNode of readyNodes) {
      if (available <= 0) break;
      const worker = createWorkerForPlanNode(root, run, planNode, options);
      dispatched.push({
        run_id: run.run_id,
        worker_id: worker.worker_id,
        plan_node_id: worker.plan_node_id
      });
      available -= 1;
    }
  }

  return dispatched;
}

function latestWorkersByPlanNode(workers) {
  const values = new Map();
  for (const worker of workers) {
    const previous = values.get(worker.plan_node_id);
    if (
      !previous
      || String(worker.created_at).localeCompare(String(previous.created_at)) > 0
    ) {
      values.set(worker.plan_node_id, worker);
    }
  }
  return values;
}

function usesPostVerificationReview(plan) {
  return ["quick", "governed_v2"].includes(plan.method_pack?.workflow);
}

function latestWorkerForPlanNode(workers, planNodeId) {
  return latestWorkersByPlanNode(
    workers.filter((worker) => worker.plan_node_id === planNodeId)
  ).get(planNodeId) || null;
}

function workerCountsForCurrentStage(root, run, worker) {
  const plan = loadPlanGraph(root, run.run_id);
  if (!usesPostVerificationReview(plan)) return true;
  const rework = readJson(join(
    root,
    "runs",
    run.run_id,
    "rework-request.json"
  ), null);
  if (
    rework?.status === "open"
    && [
      "delivery-implementation",
      "delivery-tests",
      "delivery-review"
    ].includes(
      worker.plan_node_id
    )
  ) {
    return !(rework.superseded_worker_ids || []).includes(worker.worker_id);
  }
  if (worker.plan_node_id === "delivery-review") {
    const verification = readJson(join(
      root,
      "runs",
      run.run_id,
      "verification-report.json"
    ), null);
    return Boolean(
      verification?.created_at
      && Date.parse(worker.created_at) > Date.parse(verification.created_at)
    );
  }
  return true;
}

function countOpenWorkers(root) {
  const runsDir = join(root, "runs");
  if (!existsSync(runsDir)) return 0;
  let count = 0;
  for (const runEntry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    for (const worker of getWorkers(root, runEntry.name)) {
      if (["active", "running", "claimed"].includes(worker.status)) count += 1;
    }
  }
  return count;
}

function workerSuccessfullyCompleted(worker) {
  return ["evidence_submitted", "decision_submitted", "queued", "merged"].includes(worker.status);
}

function advanceRunPlanning(root, runId) {
  const actions = [];
  let run = loadRun(root, runId);

  if (getRunNode(run, "mandate").status === "pending") {
    const artifact = createArtifact(root, run, "mandate", {
      type: "evidence",
      title: "Auto Mandate：由 accepted intake 和 roadmap node 生成",
      body: renderAutoMandate(root, run),
      refs: [".apex-v2/intake/items.json", ".apex-v2/roadmap/graph.json"],
      timestamp: now()
    });
    passNode(root, run.run_id, "mandate", artifact.artifact_id, "project tick 自动生成 mandate evidence。");
    actions.push({ node_id: "mandate", artifact_id: artifact.artifact_id });
    run = loadRun(root, runId);
  }

  if (getRunNode(run, "context").status === "pending") {
    const artifact = createArtifact(root, run, "context", {
      type: "evidence",
      title: `Auto Context：knowledge_version ${run.context_snapshot.knowledge_version}`,
      body: `当前 run 使用 ProjectKnowledgeBase snapshot ${run.context_snapshot.knowledge_version}，包含 ${run.context_snapshot.files.length} 个知识文件。`,
      refs: [".apex-v2/knowledge/manifest.json", ...run.context_snapshot.files.map((file) => `.apex-v2/${file}`)],
      timestamp: now()
    });
    passNode(root, run.run_id, "context", artifact.artifact_id, "project tick 自动确认 context snapshot。");
    actions.push({ node_id: "context", artifact_id: artifact.artifact_id });
    run = loadRun(root, runId);
  }

  if (getRunNode(run, "plan_graph").status === "pending") {
    const generated = generateRunPlanInternal(root, run);
    passNode(root, run.run_id, "plan_graph", generated.artifact_id, "project tick 自动生成并校验 plan graph。");
    actions.push({ node_id: "plan_graph", artifact_id: generated.artifact_id, plan_id: generated.plan.plan_id });
  }

  return { run_id: runId, actions };
}

function passNode(root, runId, nodeId, artifactIds, reason) {
  const run = loadRun(root, runId);
  const node = getRunNode(run, nodeId);
  const evidenceRefs = splitList(artifactIds);
  for (const artifactId of evidenceRefs) {
    assertArtifact(root, run.run_id, artifactId, nodeId);
  }
  const timestamp = now();
  node.status = "passed";
  node.started_at = node.started_at || timestamp;
  node.completed_at = timestamp;
  node.evidence_refs = evidenceRefs;
  node.gate = { status: "PASS", reason, blocking: [] };
  run.status = "active";
  run.updated_at = timestamp;
  run.gate = node.gate;
  closeRunIfComplete(root, run);
  writeRun(root, run);
  const event = appendEvent(root, "run.node.completed", "apex-v2", {
    run_id: run.run_id,
    node_id: node.id,
    gate: "PASS",
    evidence_refs: evidenceRefs,
    via: "project.tick"
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  recordRunClosure(root, run, "project.tick");
}

function renderAutoMandate(root, run) {
  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const intake = readJson(join(root, "intake", "items.json"), []);
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  const intakeItem = intake.find((item) => item.id === roadmapNode?.source_intake_id);
  return `目标：${roadmapNode?.title || run.roadmap_node_id}

来源 intake：${intakeItem?.id || "unknown"}

描述：${intakeItem?.description || ""}

优先级：${roadmapNode?.priority || "unknown"}
风险：${roadmapNode?.risk || "unknown"}

成功标准：进入 plan_graph 前，必须拥有 context snapshot 和可验证 PlanGraph。`;
}

function updateLearningProposal(root, id, updater) {
  const path = join(root, "learning", "proposals.json");
  const proposals = readJson(path, []);
  const proposal = proposals.find((item) => item.id === id);
  if (!proposal) throw new Error(`找不到 learning proposal：${id}`);
  updater(proposal);
  writeJson(path, proposals);
  return proposal;
}

function getLearningProposal(root, id) {
  const proposals = readJson(join(root, "learning", "proposals.json"), []);
  const proposal = proposals.find((item) => item.id === id);
  if (!proposal) throw new Error(`找不到 learning proposal：${id}`);
  return proposal;
}

function approveLearningForRuns(root, transitions) {
  for (const proposalId of transitions.flatMap((item) => item.proposal_ids || [])) {
    const proposal = getLearningProposal(root, proposalId);
    if (proposal.status !== "proposed") continue;
    withProjectTransaction(resolve(root, ".."), {
      kind: "learning-auto-approve",
      idempotencyKey: `learning-auto-approve:${proposalId}`
    }, () => {
      const approved = updateLearningProposal(root, proposalId, (item) => {
        item.status = "approved";
        item.updated_at = now();
      });
      queueApprovedLearningJob(root, approved);
      const event = appendEvent(root, "learning.approved", "apex-v2", {
        proposal_id: proposalId,
        via: "project.tick"
      });
      updateProject(root, {
        last_event_id: event.event_id,
        updated_at: event.timestamp
      });
      return approved;
    });
  }
}

function queueApprovedLearningJob(root, proposal) {
  const path = join(root, "learning", "jobs.json");
  const jobs = readJson(path, []);
  let job = jobs.find((item) =>
    item.job_id === proposal.apply_job_id
    || item.proposal_id === proposal.id
  );
  const timestamp = now();
  if (!job) {
    job = {
      schema_version: SCHEMA_VERSION,
      job_id: shortId("learning-job"),
      run_id: proposal.source_run_id,
      proposal_id: proposal.id,
      status: "queued",
      attempt: 0,
      idempotency_key: `learning-apply-job-v1:${proposal.id}`,
      requested_at: timestamp,
      started_at: null,
      completed_at: null,
      receipt_id: proposal.apply_receipt_id || null,
      error: null,
      updated_at: timestamp
    };
    jobs.push(job);
  } else if (job.status !== "applied") {
    job.status = "queued";
    job.error = null;
    job.updated_at = timestamp;
  }
  writeJson(path, jobs);
  if (proposal.apply_job_id !== job.job_id) {
    updateLearningProposal(root, proposal.id, (item) => {
      item.apply_job_id = job.job_id;
      item.updated_at = timestamp;
    });
  }
  return job;
}

function processLearningJobs(root, options = {}) {
  const limit = Math.max(1, Number(options.limit || 1));
  const snapshot = readJson(join(root, "learning", "jobs.json"), []);
  const selected = snapshot.filter((job) =>
    (!options.jobId || job.job_id === options.jobId)
    && (
      job.status === "queued"
      || (job.status === "failed" && Number(job.attempt || 0) < 3)
    )
  ).slice(0, limit);
  const results = [];

  for (const selectedJob of selected) {
    try {
      const result = withProjectTransaction(resolve(root, ".."), {
        kind: "learning-apply-job",
        idempotencyKey: selectedJob.idempotency_key
      }, () => applyLearningJobTransaction(root, selectedJob.job_id)).result;
      results.push(result);
    } catch (error) {
      const failed = withProjectTransaction(resolve(root, ".."), {
        kind: "learning-apply-job-failed",
        idempotencyKey: `learning-apply-job-failed:${selectedJob.job_id}:${shortId("attempt")}`
      }, () => {
        const path = join(root, "learning", "jobs.json");
        const jobs = readJson(path, []);
        const job = jobs.find((item) => item.job_id === selectedJob.job_id);
        if (!job || job.status === "applied") return job;
        job.status = "failed";
        job.attempt = Number(job.attempt || 0) + 1;
        job.error = error.message;
        job.completed_at = now();
        job.updated_at = job.completed_at;
        writeJson(path, jobs);
        const event = appendEvent(root, "learning.apply.failed", "apex-v2", {
          run_id: job.run_id,
          job_id: job.job_id,
          proposal_id: job.proposal_id,
          attempt: job.attempt,
          error: error.message
        });
        updateProject(root, {
          last_event_id: event.event_id,
          updated_at: event.timestamp
        });
        return job;
      }).result;
      results.push({
        job_id: selectedJob.job_id,
        proposal_id: selectedJob.proposal_id,
        status: "FAILED",
        attempt: failed?.attempt || selectedJob.attempt,
        error: error.message
      });
    }
  }
  return results;
}

function applyLearningJobTransaction(root, jobId) {
  const jobsPath = join(root, "learning", "jobs.json");
  const jobs = readJson(jobsPath, []);
  const job = jobs.find((item) => item.job_id === jobId);
  if (!job) throw new Error(`找不到 learning apply job：${jobId}`);
  if (job.status === "applied" && job.receipt_id) {
    return {
      job_id: job.job_id,
      proposal_id: job.proposal_id,
      receipt_id: job.receipt_id,
      status: "APPLIED",
      replayed: true
    };
  }

  const proposal = getLearningProposal(root, job.proposal_id);
  if (proposal.status !== "approved") {
    throw new Error(
      `learning apply job 等待 approval：${proposal.id}=${proposal.status}`
    );
  }
  const timestamp = now();
  job.status = "running";
  job.started_at = timestamp;
  job.completed_at = null;
  job.error = null;
  job.updated_at = timestamp;
  writeJson(jobsPath, jobs);

  const project = readJson(join(root, "project.json"));
  const knowledgeVersionBefore = Number(project.knowledge_version || 0);
  const appliedFile = appendLearningToKnowledge(root, proposal);
  const knowledgeVersionAfter = bumpKnowledgeVersion(root);
  const receipt = {
    schema_version: SCHEMA_VERSION,
    receipt_id: shortId("learning-receipt"),
    job_id: job.job_id,
    run_id: job.run_id,
    proposal_id: proposal.id,
    knowledge_version_before: knowledgeVersionBefore,
    knowledge_version_after: knowledgeVersionAfter,
    target_file: appliedFile.target_file,
    applied_content: appliedFile.applied_content,
    content_sha256: appliedFile.content_sha256,
    evidence_refs: proposal.evidence_refs,
    applied_at: now()
  };
  ensureDir(join(root, "learning", "receipts"));
  writeJson(
    join(root, "learning", "receipts", `receipt-${receipt.receipt_id}.json`),
    receipt
  );
  updateLearningProposal(root, proposal.id, (item) => {
    item.status = "applied";
    item.apply_job_id = job.job_id;
    item.apply_receipt_id = receipt.receipt_id;
    item.applied_at = receipt.applied_at;
    item.updated_at = receipt.applied_at;
  });

  job.status = "applied";
  job.attempt = Number(job.attempt || 0) + 1;
  job.completed_at = receipt.applied_at;
  job.receipt_id = receipt.receipt_id;
  job.updated_at = receipt.applied_at;
  writeJson(jobsPath, jobs);
  const event = appendEvent(root, "learning.applied", "apex-v2", {
    run_id: job.run_id,
    job_id: job.job_id,
    proposal_id: proposal.id,
    receipt_id: receipt.receipt_id,
    target_file: proposal.target_file,
    knowledge_version: knowledgeVersionAfter
  });
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
  return {
    job_id: job.job_id,
    proposal_id: proposal.id,
    receipt_id: receipt.receipt_id,
    status: "APPLIED",
    knowledge_version: knowledgeVersionAfter,
    replayed: false
  };
}

function appendLearningToKnowledge(root, proposal) {
  const target = join(root, proposal.target_file);
  if (!target.startsWith(join(root, "knowledge"))) {
    throw new Error(`learning proposal 只能写入 knowledge/：${proposal.target_file}`);
  }
  const section = renderAppliedLearningSection(proposal);
  const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (!existing.includes(`learning_id: ${proposal.id}`)) {
    writeFileSync(target, `${existing.trimEnd()}\n\n${section}\n`);
  }
  return {
    target_file: proposal.target_file,
    content_sha256: createHash("sha256")
      .update(section)
      .digest("hex"),
    applied_content: section
  };
}

function renderAppliedLearningSection(proposal) {
  return `## 已应用学习：${proposal.id}

learning_id: ${proposal.id}
source_run_id: ${proposal.source_run_id}
confidence: ${proposal.confidence}
status: applied

### 内容

${proposal.proposed_change}

### 证据

${bullet(proposal.evidence_refs)}
`;
}

function appendAppliedLearning(root) {
  const proposals = readJson(join(root, "learning", "proposals.json"), []);
  for (const proposal of proposals.filter((item) => item.status === "applied")) {
    appendLearningToKnowledge(root, proposal);
  }
}

function bumpKnowledgeVersion(root) {
  const timestamp = now();
  const manifestPath = join(root, "knowledge", "manifest.json");
  const manifest = readJson(manifestPath, { version: 0, files: [] });
  manifest.version = Number(manifest.version || 0) + 1;
  manifest.updated_at = timestamp;
  writeJson(manifestPath, manifest);
  updateProject(root, {
    knowledge_version: manifest.version,
    updated_at: timestamp
  });
  return manifest.version;
}

function loadPlanGraph(root, runId) {
  const plan = readJson(join(root, "runs", runId, "plan-graph.json"), null);
  if (!plan) throw new Error(`找不到 plan graph：${runId}`);
  return plan;
}

function getPlanNode(plan, planNodeId) {
  const node = plan.nodes.find((entry) => entry.id === planNodeId);
  if (!node) throw new Error(`找不到 plan node：${planNodeId}`);
  return node;
}

function listRunStates(root) {
  const runsDir = join(root, "runs");
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readJson(join(runsDir, entry.name, "run.json"), null))
    .filter(Boolean);
}

function findRunFiles(root, name) {
  const runsDir = join(root, "runs");
  if (!existsSync(runsDir)) return [];
  const out = [];
  for (const runEntry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    const file = join(runsDir, runEntry.name, name);
    if (existsSync(file)) out.push(file);
  }
  return out;
}

function findFilesByName(root, predicate) {
  const out = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && predicate(entry.name)) {
        out.push(path);
      }
    }
  }
  walk(root);
  return out;
}

await main();
