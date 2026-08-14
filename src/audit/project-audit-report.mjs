// Product audit presentation is outside the provider-neutral Kernel.
import { bullet } from "../lib/common.mjs";

export function buildAuditChecks(summary) {
  return [
    auditCheck("continuous-intake", summary.intake_total >= 1 && summary.intake_accepted === summary.intake_total, "持续接收和治理新需求", [`intake_total=${summary.intake_total}`, `intake_accepted=${summary.intake_accepted}`], "需要所有 intake 都有明确 triage。"),
    auditCheck("project-knowledge", summary.knowledge_version >= 1 && summary.learning_applied > 0, "项目共享知识库持续更新并吸收学习", [`knowledge_version=${summary.knowledge_version}`, `learning_applied=${summary.learning_applied}`], "需要通过 governance 写回学习。"),
    auditCheck("multi-run-factory", summary.runs_total >= 3 && summary.active_runs === 0, "项目级 run 工厂能持续创建并收束多个 run", [`runs_total=${summary.runs_total}`, `active_runs=${summary.active_runs}`], "需要多个 run 且无堆积 active run。"),
    auditCheck("evidence-gates", summary.artifacts_total >= summary.runs_total && summary.evidence_artifacts >= 1, "关键 gate 使用 artifact evidence", [`artifacts_total=${summary.artifacts_total}`, `evidence_artifacts=${summary.evidence_artifacts}`], "需要有足够 artifact 作为 gate 证据。"),
    auditCheck("automation-tests", summary.test_execution_status === "PASS" && summary.test_count > 0 && summary.test_count === summary.test_pass && summary.test_fail === 0 && summary.verification_reports >= 1, "自动测试覆盖核心生产线并有 verification report", [`execution=${summary.test_execution_status}`, `command=${summary.test_execution_command}`, `exit_code=${summary.test_execution_exit_code}`, `test_count=${summary.test_count}`, `test_pass=${summary.test_pass}`, `test_fail=${summary.test_fail}`, `verification_reports=${summary.verification_reports}`], "需要当前测试真实执行并全部通过，同时存在 verification report。"),
    auditCheck("audit-evidence-integrity", summary.test_execution_status === "PASS" && summary.test_count === summary.test_pass && summary.test_fail === 0, "Audit 使用当前执行证据而不是测试文本或 capability 自声明", [`execution=${summary.test_execution_status}`, `tests=${summary.test_count}`, `pass=${summary.test_pass}`, `fail=${summary.test_fail}`, `duration_ms=${summary.test_execution_duration_ms}`], "需要执行当前测试，跳过或失败不能产生 Audit PASS。"),
    auditCheck("merge-conflict", summary.resolution_count >= 1 && summary.merged_integrations >= 1, "支持冲突检测、resolution 和成功合并", [`resolution_count=${summary.resolution_count}`, `merged_integrations=${summary.merged_integrations}`], "需要至少一个 resolution 和 merged integration。"),
    auditCheck("low-code-path", summary.noop_integrations >= 1, "支持无代码变更 no-op integration，避免为交付而交付代码", [`noop_integrations=${summary.noop_integrations}`], "需要 evidence/decision-only run 能完成。"),
    auditCheck("sandbox-isolation", summary.worker_sandbox_ready >= 1 && summary.worktree_or_fallback_tested, "worker 具备隔离 sandbox/worktree 路径", [`worker_sandbox_ready=${summary.worker_sandbox_ready}`, `worktree_or_fallback_tested=${summary.worktree_or_fallback_tested}`], "需要 sandbox ready 且 worktree/fallback 路径被验证。"),
    auditCheck("task-aware-planning", summary.task_aware_plan_feature && summary.task_aware_plans >= 1, "PlanGraph 按具体 intake 和项目上下文生成，而不是复用固定模板", [`feature=${summary.task_aware_plan_feature}`, `task_aware_plans=${summary.task_aware_plans}`], "需要任务感知 PlanGraph 的机器能力声明和真实 run evidence。"),
    auditCheck("complete-plan-gate", summary.complete_plan_gate_feature && summary.fully_covered_plans >= 1, "execute 只有在全部 PlanGraph 节点完成后才能通过", [`feature=${summary.complete_plan_gate_feature}`, `fully_covered_plans=${summary.fully_covered_plans}`], "需要至少一个全节点 worker 覆盖的 run 证明调度不会提前收口。"),
    auditCheck("staged-patch-verification", summary.staged_verification_feature && summary.staged_verification_reports >= 1, "verification 在隔离 workspace 物化候选 patch 后运行", [`feature=${summary.staged_verification_feature}`, `staged_verification_reports=${summary.staged_verification_reports}`], "需要至少一个包含真实 patch operations 的 staged verification PASS 报告。"),
    auditCheck("codex-coding-agent", summary.codex_agent_feature && summary.codex_available && summary.codex_patch_runs >= 1, "真实 Codex worker 能在隔离 workspace 产出受 write_scope 约束的 patch", [`feature=${summary.codex_agent_feature}`, `codex_available=${summary.codex_available}`, `codex_version=${summary.codex_version}`, `codex_patch_runs=${summary.codex_patch_runs}`], "需要本机 Codex 可用，并至少完成一次真实 Codex patch run。"),
    auditCheck("state-reconciliation", summary.reconciliation_feature && summary.event_log_issues === 0 && summary.successful_reconciliations >= 1, "event log 完整且 ProjectState 漂移可检测、可安全修复", [`feature=${summary.reconciliation_feature}`, `event_log_issues=${summary.event_log_issues}`, `successful_reconciliations=${summary.successful_reconciliations}`], "需要完整 event log 和至少一次 post-check CONSISTENT 的 reconciliation。"),
    auditCheck("policy-controlled-retry", summary.retry_policy_feature && summary.retry_policy_present && summary.policy_retry_events >= 1, "worker retry 受最大尝试次数和 failure_kind policy 约束", [`feature=${summary.retry_policy_feature}`, `retry_policy_present=${summary.retry_policy_present}`, `policy_retry_events=${summary.policy_retry_events}`], "需要 retry policy 文件和至少一次 policy-enforced retry 事件。"),
    auditCheck("runtime-contract-registry", summary.contract_registry_feature && summary.contract_scan_status === "PASS" && summary.contract_errors === 0, "核心持久化对象在写入前和项目校验时执行 JSON Schema contract", [`feature=${summary.contract_registry_feature}`, `schema_count=${summary.contract_schema_count}`, `validated_contracts=${summary.validated_contracts}`, `contract_errors=${summary.contract_errors}`], "需要 Contract Registry 启用且全项目 contract scan 无错误。"),
    auditCheck("partial-pass-carry-forward", summary.carry_forward_feature && summary.carry_forward_handled >= 1 && summary.carry_forward_open === 0, "PARTIAL_PASS 残余风险可暂停 run，并通过 evidence 或 human acceptance 显式收束", [`feature=${summary.carry_forward_feature}`, `carry_total=${summary.carry_forward_total}`, `carry_handled=${summary.carry_forward_handled}`, `carry_open=${summary.carry_forward_open}`], "需要至少一次已处理 carry-forward dogfood，且不能遗留 open carry。"),
    auditCheck("execution-budget-approval", summary.execution_governance_feature && summary.approvals_approved >= 1 && summary.approvals_pending === 0, "patch/agent 执行受预算约束，critical 或敏感 merge 需要内容指纹 approval", [`feature=${summary.execution_governance_feature}`, `approvals_total=${summary.approvals_total}`, `approvals_approved=${summary.approvals_approved}`, `approvals_pending=${summary.approvals_pending}`], "需要至少一次已批准的高风险 merge dogfood，且不能遗留 pending approval。"),
    auditCheck("risk-register-metrics", summary.risk_metrics_feature && summary.risks_handled >= 1 && summary.metrics_snapshot_present, "质量信号进入长期 Risk Register，并生成项目 metrics/eval snapshot", [`feature=${summary.risk_metrics_feature}`, `risks_open=${summary.risks_open}`, `risks_handled=${summary.risks_handled}`, `metrics_snapshot_present=${summary.metrics_snapshot_present}`], "需要至少一条已处理风险和持久化 metrics snapshot。"),
    auditCheck("multi-agent-adapters", summary.multi_adapter_feature && summary.available_agent_adapters.length >= 2, "coding worker 具备多 adapter registry 和显式 fallback 能力", [`feature=${summary.multi_adapter_feature}`, `available=${summary.available_agent_adapters.join(",")}`], "需要至少两个可用 coding-agent CLI，并由 registry 显式解析。"),
    auditCheck("runtime-adapter-failover", summary.adapter_failover_feature && summary.adapter_fallback_events >= 1, "retryable adapter failure 能保留证据、重置 sandbox 并切换 runtime", [`feature=${summary.adapter_failover_feature}`, `fallback_events=${summary.adapter_fallback_events}`], "需要至少一次项目级 adapter failover dogfood。"),
    auditCheck("quality-risk-attempt-synthesis", summary.quality_risk_synthesis_feature && summary.multi_attempt_summaries >= 1, "质量失败进入风险治理，多 adapter attempts 汇总为单一 worker evidence", [`feature=${summary.quality_risk_synthesis_feature}`, `worker_summaries=${summary.worker_summaries}`, `multi_attempt_summaries=${summary.multi_attempt_summaries}`], "需要至少一份包含多次 adapter attempt 的 worker summary。"),
    auditCheck("adapter-session-resume", summary.adapter_session_feature && summary.adapter_session_results >= 1, "Claude/Gemini session metadata 被持久化并可通过 worker resume 继续", [`feature=${summary.adapter_session_feature}`, `session_results=${summary.adapter_session_results}`], "需要至少一个持久化 adapter session result。"),
    auditCheck("metrics-quality-gate", summary.quality_regression_feature && summary.metrics_snapshot_present && summary.latest_quality_status === "PASS", "项目 metrics 阈值能阻止质量回归时创建新 run", [`feature=${summary.quality_regression_feature}`, `metrics_snapshot_present=${summary.metrics_snapshot_present}`, `latest_quality_status=${summary.latest_quality_status}`], "需要最新 metrics snapshot 通过质量阈值。"),
    auditCheck("adapter-capability-drift", summary.adapter_capability_drift_status === "PASS" && summary.adapter_capability_blocking_changes === 0, "adapter capability 基线无阻断性退化", [`status=${summary.adapter_capability_drift_status}`, `blocking_changes=${summary.adapter_capability_blocking_changes}`], "需要重录已确认的 adapter capability 基线或修复 runtime。"),
    auditCheck("adapter-baseline-governance", summary.adapter_baseline_governance_feature && summary.adapter_baseline_approvals >= 1, "adapter capability 基线更新受 diff fingerprint approval 约束", [`feature=${summary.adapter_baseline_governance_feature}`, `approved_baseline_changes=${summary.adapter_baseline_approvals}`], "需要至少一次项目级基线变化审批 dogfood。"),
    auditCheck("live-adapter-smoke", summary.live_adapter_smoke_feature && summary.latest_adapter_smoke_mode === "live" && summary.latest_adapter_smoke_status === "PASS" && summary.live_adapter_smoke_passes >= 3, "Codex/Claude/Gemini 真实 structured-output smoke 全部通过", [`feature=${summary.live_adapter_smoke_feature}`, `mode=${summary.latest_adapter_smoke_mode}`, `status=${summary.latest_adapter_smoke_status}`, `passes=${summary.live_adapter_smoke_passes}`], "需要记录三种 runtime 全部 PASS 的 live smoke report。"),
    auditCheck("adapter-smoke-freshness", summary.latest_adapter_smoke_age_hours != null && summary.latest_adapter_smoke_age_hours <= summary.adapter_smoke_max_age_hours, `adapter live smoke 未超过 ${summary.adapter_smoke_max_age_hours} 小时有效期`, [`age_hours=${summary.latest_adapter_smoke_age_hours}`, `max_age_hours=${summary.adapter_smoke_max_age_hours}`], "需要重新执行并记录 live adapter smoke。"),
    auditCheck("adapter-smoke-auto-refresh", summary.adapter_smoke_auto_refresh_feature && summary.adapter_smoke_auto_refresh_enabled, "待调度任务遇到过期 live smoke 时由 policy 自动刷新", [`feature=${summary.adapter_smoke_auto_refresh_feature}`, `enabled=${summary.adapter_smoke_auto_refresh_enabled}`], "需要启用 adapter smoke 自动刷新能力和 quality policy。"),
    auditCheck("failure-notification-policy", summary.failure_notification_feature && summary.failure_notification_policy_enabled && summary.failure_notification_events.includes("adapter.smoke.failed"), "adapter smoke 失败进入持久化、可去重的通知 outbox", [`feature=${summary.failure_notification_feature}`, `enabled=${summary.failure_notification_policy_enabled}`, `queued=${summary.notifications_queued}`], "需要启用失败通知 policy 并订阅 adapter.smoke.failed。"),
    auditCheck("adapter-capability-version-history", summary.adapter_trend_history_feature && summary.adapter_history_snapshots >= 1, "adapter capability/version/smoke 观测形成 append-only 趋势历史", [`feature=${summary.adapter_trend_history_feature}`, `snapshots=${summary.adapter_history_snapshots}`, `version_changes=${summary.adapter_history_version_changes}`], "需要至少记录一次 adapter observation。"),
    auditCheck("capability-discoverability", summary.capability_groups >= 5 && summary.capability_commands >= 20, "项目能力有机器可读 manifest，便于维护和审计", [`capability_groups=${summary.capability_groups}`, `capability_commands=${summary.capability_commands}`], "需要 capabilities.json 覆盖主要命令面。")
  ];
}

function auditCheck(id, pass, claim, evidence, gap) {
  return {
    id,
    status: pass ? "PASS" : "FAIL",
    claim,
    evidence,
    gap: pass ? "" : gap
  };
}

export function renderAuditMarkdown(report) {
  return `# Project Audit

audit_id: ${report.audit_id}
status: ${report.status}
created_at: ${report.created_at}

## Objective

${report.objective}

## Checks

${report.checks.map((check) => `### ${check.id}: ${check.status}

${check.claim}

Evidence:
${bullet(check.evidence)}

Gap: ${check.gap || "无"}
`).join("\n")}

## Summary

\`\`\`json
${JSON.stringify(report.summary, null, 2)}
\`\`\`
`;
}
