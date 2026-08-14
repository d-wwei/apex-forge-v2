import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "../lib/common.mjs";
import {
  inspectWorkerExecutor,
  inspectWorkerExecutors
} from "../executors/registry.mjs";
import { buildAdapterTrend } from "../core/adapter-observability.mjs";
import { listAllArtifacts } from "../core/artifacts.mjs";
import { inspectEventLog } from "../core/reconcile.mjs";
import { scanProjectContracts } from "../core/contracts.mjs";
import { hasExecutedTest } from "../core/project-audit.mjs";

export function buildAuditSummary(root, projectDir, testExecution, deps) {
  const { evaluateAdapterCapabilityDrift, findFilesByName, findRunFiles, getWorkers, listRunStates, workerSuccessfullyCompleted } = deps;
  const project = readJson(join(root, "project.json"));
  const intake = readJson(join(root, "intake", "items.json"), []);
  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const learning = readJson(join(root, "learning", "proposals.json"), []);
  const approvals = readJson(join(root, "approvals", "items.json"), []);
  const risks = readJson(join(root, "risks", "register.json"), []);
  const latestMetrics = readJson(join(root, "metrics", "latest.json"), null);
  const latestAdapterSmoke = readJson(join(root, "adapters", "latest-live-smoke.json"), null);
  const qualityPolicy = readJson(join(root, "policies", "quality.json"), null);
  const notificationPolicy = readJson(join(root, "policies", "notifications.json"), null);
  const notifications = readJson(join(root, "notifications", "outbox.json"), []);
  const adapterTrend = readJson(join(root, "adapters", "latest-trend.json"), buildAdapterTrend(root));
  const runs = listRunStates(root);
  const carryForward = runs.flatMap((run) => run.carry_forward || []);
  const artifacts = listAllArtifacts(root);
  const schemaCount = readdirSync(join(projectDir, "schemas")).filter((file) => file.endsWith(".json")).length;
  const capabilities = readJson(join(projectDir, "capabilities.json"), { groups: [] });
  const capabilityCommandCount = (capabilities.groups || []).reduce((sum, group) => sum + (group.commands?.length || 0), 0);
  const verificationReports = findRunFiles(root, "verification-report.json");
  const verificationReportData = verificationReports.map((file) => readJson(file));
  const reviewReports = findRunFiles(root, "review-report.json");
  const integrationReports = findRunFiles(root, "integration-report.json");
  const mergeQueues = findRunFiles(root, "merge-queue.json").map((file) => readJson(file));
  const allWorkers = runs.flatMap((run) => getWorkers(root, run.run_id));
  const adapterResults = findFilesByName(root, (name) => name.startsWith("adapter-result-") && name.endsWith(".json"))
    .map((file) => readJson(file));
  const workerSummaries = findFilesByName(root, (name) => name === "worker-summary.json").map((file) => readJson(file));
  const codexAdapter = inspectWorkerExecutor("codex");
  const agentAdapters = inspectWorkerExecutors();
  const adapterDrift = evaluateAdapterCapabilityDrift(root);
  const retryPolicy = readJson(join(root, "policies", "retry.json"), null);
  const eventLog = inspectEventLog(join(root, "events.jsonl"));
  const reconciliationReports = findFilesByName(root, (name) => name.startsWith("reconcile-") && name.endsWith(".json"))
    .map((file) => readJson(file));
  const contractReport = scanProjectContracts(projectDir);
  const planGraphs = findRunFiles(root, "plan-graph.json").map((file) => readJson(file));
  const taskAwarePlans = planGraphs.filter((plan) =>
    plan.source_intake_id
    && plan.source_title
    && Array.isArray(plan.planning_basis)
    && plan.nodes.some((node) => node.objective.includes(plan.source_title))
  );
  const fullyCoveredPlans = planGraphs.filter((plan) => {
    const workers = getWorkers(root, plan.run_id);
    return plan.nodes.every((node) =>
      workers.some((worker) => worker.plan_node_id === node.id && workerSuccessfullyCompleted(worker))
    );
  });
  const resolutionCount = findRunFiles(root, "resolutions").length + findFilesByName(root, (name) => name.startsWith("resolution-") && name.endsWith(".json")).length;
  const executed = (pattern) => hasExecutedTest(testExecution, pattern);
  const stagedVerificationFeature = executed("verify run 在 staged workspace")
    && executed("verify run 拒绝 changed_files 没有完整 operations");
  const contractRegistryFeature = executed("runtime contract gate 在无效 ProjectState 落盘前拒绝写入")
    && executed("contracts validate 定位绕过写入 gate 的持久化 contract 损坏");
  const executionGovernanceFeature = executed("execution policy 阻止超出 changed-files 预算的 patch")
    && executed("critical merge 必须通过内容指纹 approval 后才能 apply");

  return {
    project_name: project.project_name,
    knowledge_version: project.knowledge_version,
    intake_total: intake.length,
    intake_accepted: intake.filter((item) => item.triage.status === "accepted").length,
    roadmap_nodes: roadmap.nodes.length,
    roadmap_done: roadmap.nodes.filter((node) => node.status === "done").length,
    active_runs: project.active_runs.length,
    runs_total: runs.length,
    runs_done: runs.filter((run) => run.status === "done").length,
    carry_forward_total: carryForward.length,
    carry_forward_open: carryForward.filter((item) => item.status === "open").length,
    carry_forward_handled: carryForward.filter((item) => ["resolved", "accepted"].includes(item.status)).length,
    artifacts_total: artifacts.length,
    evidence_artifacts: artifacts.filter((artifact) => artifact.type === "evidence").length,
    patch_artifacts: artifacts.filter((artifact) => artifact.type === "patch").length,
    verification_reports: verificationReports.length,
    review_reports: reviewReports.length,
    integration_reports: integrationReports.length,
    learning_total: learning.length,
    learning_applied: learning.filter((item) => item.status === "applied").length,
    schema_count: schemaCount,
    test_execution_status: testExecution.status,
    test_execution_command: testExecution.command,
    test_execution_exit_code: testExecution.exit_code,
    test_execution_duration_ms: testExecution.duration_ms,
    test_count: testExecution.tests,
    test_pass: testExecution.pass,
    test_fail: testExecution.fail,
    capability_groups: capabilities.groups?.length || 0,
    capability_commands: capabilityCommandCount,
    task_aware_plan_feature: executed("plan graph 会按 intake 类型、标题和 affected area 生成任务相关范围"),
    complete_plan_gate_feature: executed("project tick --complete-execute 必须等待全部 PlanGraph 节点完成"),
    staged_verification_feature: stagedVerificationFeature,
    codex_agent_feature: executed("worker exec-agent 在 scratch 副本执行 Codex 并自动生成 patch bundle"),
    reconciliation_feature: executed("project reconcile 检测并修复 ProjectState、Roadmap 和 knowledge 漂移")
      && executed("project reconcile 在 event log 损坏时拒绝 apply"),
    retry_policy_feature: executed("worker retry 遵守 adapter 最大尝试次数并重置 sandbox"),
    contract_registry_feature: contractRegistryFeature,
    carry_forward_feature: executed("PARTIAL_PASS 必须声明 carry-forward"),
    execution_governance_feature: executionGovernanceFeature,
    risk_metrics_feature: executed("quality metrics FAIL 阻止新 run"),
    multi_adapter_feature: executed("adapter registry 检测多 CLI 并按显式 fallback order 解析"),
    adapter_failover_feature: executed("worker fallback 在 retryable adapter failure 后切换到下一个可用 runtime"),
    quality_risk_synthesis_feature: testExecution.status === "PASS" && workerSummaries.some((item) => item.attempts.length > 1),
    adapter_session_feature: executed("Claude/Gemini adapters 解析 structured output、session id 和 resume 参数"),
    adapter_baseline_governance_feature: executed("adapter capability 基线发生变化时必须审批后才能重录"),
    live_adapter_smoke_feature: executed("adapter smoke FAIL report 阻止新 run"),
    quality_regression_feature: executed("quality metrics FAIL 阻止新 run"),
    adapter_smoke_auto_refresh_feature: executed("project tick 在待调度任务遇到过期 live smoke 时自动刷新并继续创建 run"),
    failure_notification_feature: executed("live adapter smoke 失败按通知策略进入去重 outbox"),
    adapter_trend_history_feature: executed("adapter capability/version 观测形成 append-only 趋势历史"),
    codex_available: codexAdapter.available,
    codex_version: codexAdapter.version,
    codex_agent_runs: adapterResults.filter((result) => result.adapter === "codex").length,
    codex_patch_runs: adapterResults.filter((result) =>
      result.adapter === "codex"
      && result.status === "PASS"
      && result.executable === "codex"
      && result.changed_files?.length > 0
      && result.out_of_scope_files?.length === 0
    ).length,
    available_agent_adapters: agentAdapters.filter((item) => item.available).map((item) => item.adapter),
    adapter_fallback_events: eventLog.events.filter((event) => event.type === "worker.adapter.fallback").length,
    worker_summaries: workerSummaries.length,
    multi_attempt_summaries: workerSummaries.filter((item) => item.attempts.length > 1).length,
    adapter_session_results: adapterResults.filter((item) => item.session_id).length,
    adapter_capability_drift_status: adapterDrift.status,
    adapter_capability_blocking_changes: adapterDrift.changes.filter((item) => item.severity === "blocking").length,
    event_log_issues: eventLog.issues.length,
    reconciliation_reports: reconciliationReports.length,
    successful_reconciliations: reconciliationReports.filter((report) =>
      report.applied
      && report.post_check?.status === "CONSISTENT"
    ).length,
    retry_policy_present: Boolean(retryPolicy),
    policy_retry_events: eventLog.events.filter((event) =>
      event.type === "worker.retry.requested"
      && event.payload?.max_attempts
      && event.payload?.failure_kind
    ).length,
    contract_scan_status: contractReport.status,
    contract_schema_count: contractReport.schema_count,
    validated_contracts: contractReport.validated_contracts,
    contract_errors: contractReport.errors.length,
    approvals_total: approvals.length,
    approvals_approved: approvals.filter((item) => item.decision === "approved").length,
    approvals_pending: approvals.filter((item) => item.status === "pending").length,
    adapter_baseline_approvals: approvals.filter((item) => item.kind === "adapter_baseline" && item.decision === "approved").length,
    risks_open: risks.filter((item) => item.status === "open").length,
    risks_handled: risks.filter((item) => ["mitigated", "accepted", "closed"].includes(item.status)).length,
    metrics_snapshot_present: Boolean(latestMetrics),
    latest_quality_status: latestMetrics?.evaluation?.status || null,
    latest_adapter_smoke_status: latestAdapterSmoke?.status || null,
    latest_adapter_smoke_mode: latestAdapterSmoke?.mode || null,
    latest_adapter_smoke_age_hours: latestAdapterSmoke ? (Date.now() - Date.parse(latestAdapterSmoke.generated_at)) / 3600000 : null,
    adapter_smoke_max_age_hours: qualityPolicy?.adapter_smoke_max_age_hours || 24,
    live_adapter_smoke_passes: latestAdapterSmoke?.results?.filter((item) => item.status === "PASS").length || 0,
    adapter_smoke_auto_refresh_enabled: Boolean(qualityPolicy?.adapter_smoke_auto_refresh),
    failure_notification_policy_enabled: Boolean(notificationPolicy?.enabled),
    failure_notification_events: notificationPolicy?.notify_on || [],
    notifications_total: notifications.length,
    notifications_queued: notifications.filter((item) => item.status === "queued").length,
    adapter_history_snapshots: adapterTrend.snapshot_count || 0,
    adapter_history_version_changes: (adapterTrend.adapters || []).reduce((sum, item) => sum + item.version_changes.length, 0),
    plan_graphs_total: planGraphs.length,
    task_aware_plans: taskAwarePlans.length,
    fully_covered_plans: fullyCoveredPlans.length,
    staged_verification_reports: verificationReportData.filter((report) =>
      report.status === "PASS"
      && report.workspace?.mode === "staged-copy"
      && report.workspace.patch_ids.length > 0
      && report.workspace.unmaterialized_patch_ids.length === 0
    ).length,
    worker_total: allWorkers.length,
    worker_merged: allWorkers.filter((worker) => worker.status === "merged").length,
    worker_sandbox_ready: allWorkers.filter((worker) => worker.sandbox?.status === "ready").length,
    worktree_or_fallback_tested: allWorkers.some((worker) => worker.sandbox?.type === "worktree" || worker.sandbox?.fallback_reason),
    conflict_reports: mergeQueues.reduce((sum, queue) => sum + (queue.conflicts?.length || 0), 0),
    resolution_count: resolutionCount,
    noop_integrations: integrationReports.map((file) => readJson(file)).filter((report) => report.status === "NOOP").length,
    merged_integrations: integrationReports.map((file) => readJson(file)).filter((report) => report.status === "MERGED").length
  };
}
