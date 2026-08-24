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
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
  loadRun,
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
  createWorkerForPlanNode,
  ensureWorkerSandboxReady,
  executeWorkerShell,
  findGitRoot,
  findPatch,
  findPatchWithPath,
  findWorker,
  getWorkers,
  isFileAllowedByScope,
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
import { handleHostCommand } from "./commands/host.mjs";
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

function main() {
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
      handleProject(subcommand, parseArgs(rest));
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

  const candidates = [
    {
      target_file: "knowledge/decisions.md",
      proposed_change: "Apex Forge V2 的持续交付闭环采用 artifact evidence gate：run 节点 PASS 必须引用当前节点 artifact，review 必须基于 verification report 和 merge queue，integration 必须在 review PASS 后应用 merge queue。",
      evidence_refs: [
        `.apex-v2/runs/${run.run_id}/run.json`,
        `.apex-v2/runs/${run.run_id}/verification-report.json`,
        `.apex-v2/runs/${run.run_id}/review-report.json`,
        `.apex-v2/runs/${run.run_id}/integration-report.json`
      ],
      confidence: 0.95
    },
    {
      target_file: "knowledge/test-map.md",
      proposed_change: "当前最小回归组为 npm test、node --check src/apex-v2.mjs、strict project validate、schemas JSON parse；verification report 必须记录每条命令的 exit code 和输出尾部。",
      evidence_refs: [`.apex-v2/runs/${run.run_id}/verification-report.json`, "tests/apex-v2.test.mjs"],
      confidence: 0.95
    },
    {
      target_file: "knowledge/danger-zones.md",
      proposed_change: "merge queue 状态重算不得回滚已 merged patch；同文件 patch 必须生成 conflict report 并阻塞相关 worker，直到 coordinator 串行处理。",
      evidence_refs: [`.apex-v2/runs/${run.run_id}/merge-queue.json`, "src/apex-v2.mjs", "tests/apex-v2.test.mjs"],
      confidence: 0.9
    }
  ];

  const proposalsPath = join(root, "learning", "proposals.json");
  const proposals = readJson(proposalsPath, []);
  const created = [];
  for (const candidate of candidates) {
    const existing = proposals.find((proposal) =>
      proposal.source_run_id === run.run_id &&
      proposal.target_file === candidate.target_file &&
      proposal.proposed_change === candidate.proposed_change
    );
    if (existing) {
      created.push(existing);
      continue;
    }
    const proposal = {
      schema_version: SCHEMA_VERSION,
      id: shortId("learning"),
      source_run_id: run.run_id,
      target_file: candidate.target_file,
      proposed_change: candidate.proposed_change,
      evidence_refs: candidate.evidence_refs,
      confidence: candidate.confidence,
      status: "proposed",
      created_at: timestamp,
      updated_at: timestamp
    };
    proposals.push(proposal);
    created.push(proposal);
  }
  writeJson(proposalsPath, proposals);
  writeJson(join(root, "runs", run.run_id, "learning-report.json"), {
    schema_version: SCHEMA_VERSION,
    report_id: shortId("learning-report"),
    run_id: run.run_id,
    created_at: timestamp,
    proposal_ids: created.map((proposal) => proposal.id)
  });
  const artifact = createArtifact(root, run, "learn", {
    type: "decision",
    title: "Learning：已生成治理提案",
    body: `已生成 ${created.length} 条 learning proposals，等待 governance approval。`,
    refs: [
      ".apex-v2/learning/proposals.json",
      `.apex-v2/runs/${run.run_id}/learning-report.json`
    ],
    timestamp
  });
  const event = appendEvent(root, "learning.proposed", "apex-v2", {
    run_id: run.run_id,
    proposal_ids: created.map((proposal) => proposal.id),
    artifact_id: artifact.artifact_id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { proposals: created, artifact_id: artifact.artifact_id };
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
    const event = appendEvent(root, "learning.approved", "apex-v2", { proposal_id: approved.id });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    return approved;
  }).result;
  console.log(JSON.stringify(proposal, null, 2));
}

function applyLearning(args) {
  const root = requireStore(projectRoot(args));
  const id = required(args, "id");
  const proposal = withProjectTransaction(resolve(root, ".."), {
    kind: "learning-apply",
    idempotencyKey: `learning-apply:${id}`
  }, () => {
    const applied = updateLearningProposal(root, id, (item) => {
      if (item.status !== "approved") throw new Error(`只有 approved proposal 可以 apply，当前状态：${item.status}`);
      appendLearningToKnowledge(root, item);
      item.status = "applied";
      item.updated_at = now();
    });
    const knowledgeVersion = bumpKnowledgeVersion(root);
    const event = appendEvent(root, "learning.applied", "apex-v2", {
      proposal_id: applied.id,
      target_file: applied.target_file,
      knowledge_version: knowledgeVersion
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
    return applied;
  }).result;
  console.log(JSON.stringify(proposal, null, 2));
}

function handleProject(subcommand, args) {
  if (subcommand === "git") {
    handleGitDeliveryCommand(args._[0], args);
    return;
  }
  if (subcommand === "tick") {
    projectTick(args);
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

function projectTick(args) {
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

  if (args["run-agents"]) {
    const refreshedProject = readJson(projectPath);
    const limit = effectiveAgentLimit(root, Math.max(1, Number(args["agent-limit"] || 1)));
    agentRuns = runReadyCodingAgents(root, refreshedProject.active_runs, limit, args);
  }

  if (args["collect-results"]) {
    const refreshedProject = readJson(projectPath);
    collectedResults = collectWorkerResults(root, refreshedProject.active_runs);
  }

  if (args["complete-execute"]) {
    const refreshedProject = readJson(projectPath);
    completedExecuteRuns = completeReadyExecuteNodes(root, refreshedProject.active_runs);
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
    learnedRuns = learnReadyRuns(root, refreshedProject.active_runs, Boolean(args["apply-learning"]));
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
    adapter_smoke_refresh: adapterSmokeRefresh,
    remaining_ready: readJson(roadmapPath).nodes.filter((node) => node.status === "ready").length,
    active_runs: readJson(projectPath).active_runs
  }, null, 2));
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
    const result = generateReviewInternal(root, run);
    if (result.report.status === "PASS") {
      passNode(root, run.run_id, "review", result.artifact_id, "project tick 自动完成 review report。");
    }
    out.push({ run_id: run.run_id, status: result.report.status, artifact_id: result.artifact_id });
  }
  return out;
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

function learnReadyRuns(root, runIds, applyLearning) {
  const out = [];
  for (const runId of runIds) {
    const run = loadRun(root, runId);
    if (getRunNode(run, "integrate").status !== "passed") continue;
    if (getRunNode(run, "learn").status !== "pending") continue;
    const transition = withProjectTransaction(resolve(root, ".."), {
      kind: "learning-governance",
      idempotencyKey: `learning-governance:${run.run_id}:${applyLearning ? "apply" : "propose"}`
    }, () => learnReadyRunTransaction(root, run, applyLearning)).result;
    out.push(transition);
  }
  return out;
}

function learnReadyRunTransaction(root, run, applyLearning) {
  const result = proposeLearningInternal(root, run);
  const proposalIds = result.proposals.map((proposal) => proposal.id);
  const applied = [];
  if (applyLearning) {
    for (const proposalId of proposalIds) {
      const proposal = getLearningProposal(root, proposalId);
      if (proposal.status === "proposed") {
        updateLearningProposal(root, proposalId, (item) => {
          item.status = "approved";
          item.updated_at = now();
        });
      }
      const updated = getLearningProposal(root, proposalId);
      if (updated.status === "approved") {
        updateLearningProposal(root, proposalId, (item) => {
          appendLearningToKnowledge(root, item);
          item.status = "applied";
          item.updated_at = now();
        });
        applied.push(proposalId);
      }
    }
    if (applied.length > 0) {
      const knowledgeVersion = bumpKnowledgeVersion(root);
      appendEvent(root, "learning.applied", "apex-v2", {
        run_id: run.run_id,
        proposal_ids: applied,
        knowledge_version: knowledgeVersion,
        via: "project.tick"
      });
    }
    passNode(root, run.run_id, "learn", result.artifact_id, "project tick 自动完成 learning governance。");
  }
  return { run_id: run.run_id, proposal_ids: proposalIds, applied, artifact_id: result.artifact_id };
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

function runReadyCodingAgents(root, runIds, limit, args) {
  const out = [];
  const executorIds = new Set(inspectWorkerExecutors().map((item) => item.executor_id));
  const requestedSandbox = normalizeEnum(args["agent-sandbox"] || "worktree", ["scratch", "worktree"], "agent-sandbox");
  const timeoutMs = effectiveAgentTimeout(root, Number(args["agent-timeout-ms"] || 30 * 60 * 1000));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--agent-timeout-ms 必须是正整数");
  }

  for (const runId of runIds) {
    if (out.length >= limit) break;
    const run = loadRun(root, runId);
    const plan = loadPlanGraph(root, runId);
    for (const worker of getWorkers(root, runId)) {
      if (out.length >= limit) break;
      const executorId = worker.executor_id || worker.adapter;
      if (worker.status !== "active" || !executorIds.has(executorId)) continue;
      try {
        assertAdapterAllowed(root, executorId);
        initializeWorkerSandbox(root, worker, requestedSandbox);
        const planNode = getPlanNode(plan, worker.plan_node_id);
        const result = executeWorkerExecutor(root, worker, planNode, {
          command: args["agent-command"] ? String(args["agent-command"]) : undefined,
          adapter: executorId,
          model: args["agent-model"] ? String(args["agent-model"]) : undefined,
          profile: args["agent-profile"] ? String(args["agent-profile"]) : undefined,
          timeoutMs,
          requiredCapabilities: worker.required_capabilities || []
        });
        let queueStatus = null;
        if (result.patch) {
          const queue = enqueuePatchInternal(root, run, result.patch);
          queueStatus = queue.conflicts.length > 0 ? "blocked_conflict" : "queued";
        }
        out.push({
          run_id: runId,
          worker_id: worker.worker_id,
          plan_node_id: worker.plan_node_id,
          status: result.adapterResult.status,
          patch_id: result.patch?.patch_id || null,
          queue_status: queueStatus,
          artifact_id: result.artifact.artifact_id
        });
      } catch (error) {
        worker.status = "blocked";
        worker.updated_at = now();
        writeJson(join(workerDir(root, worker.run_id, worker.worker_id), "worker.json"), worker);
        out.push({
          run_id: runId,
          worker_id: worker.worker_id,
          plan_node_id: worker.plan_node_id,
          status: "FAIL",
          error: error.message
        });
      }
    }
  }
  return out;
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
    if (getRunNode(run, "execute").status !== "pending") continue;
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
    const workersByPlanNode = new Map(workers.map((worker) => [worker.plan_node_id, worker]));
    if (plan.nodes.some((node) => !workersByPlanNode.has(node.id))) continue;
    if (workers.some((worker) => !workerSuccessfullyCompleted(worker))) continue;

    const evidenceRefs = [];
    let ready = true;
    const decisionQueue = readDecisionQueue(root, runId);

    for (const worker of workers) {
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
  let available = Math.max(0, project.wip_limits.parallel_workers - countOpenWorkers(root));
  if (available <= 0) return dispatched;

  for (const runId of runIds) {
    if (available <= 0) break;
    const run = loadRun(root, runId);
    if (getRunNode(run, "plan_graph").status !== "passed") continue;
    if (getRunNode(run, "execute").status !== "pending") continue;

    const plan = loadPlanGraph(root, runId);
    const workers = getWorkers(root, runId);
    const existingPlanNodeIds = new Set(workers.map((worker) => worker.plan_node_id));
    const completedPlanNodeIds = new Set(
      workers.filter(workerSuccessfullyCompleted).map((worker) => worker.plan_node_id)
    );
    const readyNodes = plan.nodes.filter((node) =>
      !existingPlanNodeIds.has(node.id) &&
      node.dependencies.every((dependency) => completedPlanNodeIds.has(dependency))
    );

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

function countOpenWorkers(root) {
  const runsDir = join(root, "runs");
  if (!existsSync(runsDir)) return 0;
  let count = 0;
  for (const runEntry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    for (const worker of getWorkers(root, runEntry.name)) {
      if (["active", "claimed", "patch_submitted", "blocked"].includes(worker.status)) count += 1;
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

main();
