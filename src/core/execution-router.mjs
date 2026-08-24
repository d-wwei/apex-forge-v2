import { normalizeExecutionCapabilities } from "../contracts/execution-capability.mjs";
import { resolveModelSelection } from "./model-routing.mjs";

export function routeExecution(planNode, executionPolicy, options = {}) {
  const executionClass = planNode.execution_class || legacyExecutionClass(planNode);
  const requestedMode = options.mode || null;
  const preferredMode = planNode.preferred_mode || legacyPreferredMode(executionClass);
  const delegatedSubagent = planNode.delegation?.eligible === true
    && planNode.delegation?.default === true
    && planNode.delegation?.main_agent_required !== true;
  const hints = {
    estimated_duration_minutes: Number(planNode.execution_hints?.estimated_duration_minutes || 0),
    requires_isolation: Boolean(planNode.execution_hints?.requires_isolation),
    requires_resume: Boolean(planNode.execution_hints?.requires_resume),
    background: Boolean(planNode.execution_hints?.background),
    requires_parallel_execution: Boolean(planNode.execution_hints?.requires_parallel_execution)
  };
  const router = executionPolicy?.execution_router || {
    force_factory_risks: ["critical"],
    factory_on_isolation: true,
    factory_on_resume: true,
    factory_on_background: true,
    factory_on_parallel_execution: true
  };
  const reasons = [];
  let mode = delegatedSubagent ? "factory" : preferredMode;

  if (executionClass === "cognitive") {
    if (delegatedSubagent) {
      mode = "factory";
      reasons.push("delegated_subagent");
    } else {
      mode = "interactive";
      reasons.push(
        planNode.delegation?.main_agent_required === true
          ? "main_agent_required"
          : "cognitive_host"
      );
    }
  } else if (executionClass === "deterministic_check") {
    mode = "deterministic";
    reasons.push("deterministic_check");
  } else if (executionClass === "human_decision") {
    mode = "human";
    reasons.push("human_decision");
  } else {
    if (delegatedSubagent) reasons.push("delegated_subagent");
    if (executionPolicy?.interactive_workspace_patch?.enabled !== true) {
      mode = "factory";
      reasons.push("interactive_workspace_patch_disabled");
    }
    if (router.force_factory_risks?.includes(planNode.risk)) {
      mode = "factory";
      reasons.push(`risk=${planNode.risk}`);
    }
    for (const [enabled, required, reason] of [
      [router.factory_on_isolation, hints.requires_isolation, "requires_isolation"],
      [router.factory_on_resume, hints.requires_resume, "requires_resume"],
      [router.factory_on_background, hints.background, "background"],
      [router.factory_on_parallel_execution, hints.requires_parallel_execution, "parallel_execution"]
    ]) {
      if (enabled && required) {
        mode = "factory";
        reasons.push(reason);
      }
    }
  }

  if (requestedMode) {
    if (!["interactive", "factory", "deterministic", "human"].includes(requestedMode)) {
      throw new Error(`execution mode override 无效：${requestedMode}`);
    }
    if (
      (
        executionClass === "cognitive"
        && requestedMode !== "interactive"
        && !(
          requestedMode === "factory"
          && planNode.delegation?.eligible === true
          && planNode.delegation?.main_agent_required !== true
        )
      )
      || (executionClass === "deterministic_check" && requestedMode !== "deterministic")
      || (executionClass === "human_decision" && requestedMode !== "human")
      || (executionClass === "workspace_patch" && !["interactive", "factory"].includes(requestedMode))
    ) {
      throw new Error(`execution mode override 与 execution_class 不兼容：${executionClass} -> ${requestedMode}`);
    }
    if (
      requestedMode === "factory"
      && planNode.delegation?.main_agent_required === true
    ) {
      throw new Error("execution mode override 不能绕过 main_agent_required");
    }
    if (
      executionClass === "workspace_patch"
      && requestedMode === "interactive"
      && executionPolicy?.interactive_workspace_patch?.enabled !== true
    ) {
      throw new Error("execution policy 禁止 Interactive workspace_patch override");
    }
    const hardFactoryReasons = reasons.filter((reason) =>
      reason.startsWith("risk=")
      || ["requires_isolation", "requires_resume", "background", "parallel_execution"].includes(reason)
    );
    if (
      executionClass === "workspace_patch"
      && requestedMode === "interactive"
      && hardFactoryReasons.length > 0
    ) {
      throw new Error(`execution mode override 不能绕过强制 Factory：${hardFactoryReasons.join(",")}`);
    }
    mode = requestedMode;
    reasons.push(`user_override=${requestedMode}`);
  }
  if (reasons.length === 0) reasons.push(`preferred_mode=${mode}`);

  const methodPackId = planNode.method_pack_id || "legacy";
  const governor = executionPolicy?.cost_governor;
  const costBudget = governor?.enabled === false
    ? null
    : governor?.method_pack_budgets?.[methodPackId] || governor?.default_budget || null;
  const budgetStatus = costBudget ? "within_budget" : "not_configured";
  if (
    costBudget
    && !["deterministic_check", "human_decision"].includes(executionClass)
    && hints.estimated_duration_minutes > costBudget.max_wall_minutes
    && options.allowBudgetOverride !== true
  ) {
    throw new Error(
      `Cost Governor 拒绝预计超限 route：${hints.estimated_duration_minutes}/${costBudget.max_wall_minutes} minutes`
    );
  }

  const modelSelection = resolveModelSelection({
    planNode,
    executionPolicy,
    adapter: options.adapter || planNode.adapter || null,
    requestedModel: options.model || null
  });

  return {
    mode,
    preferred_mode: preferredMode,
    user_override: requestedMode,
    reasons: Array.from(new Set(reasons)),
    hints,
    required_capabilities: normalizeExecutionCapabilities(planNode.required_capabilities || []),
    method_pack_id: methodPackId,
    cost_budget: costBudget,
    budget_status: budgetStatus,
    usage_policy: governor?.unknown_usage || "record",
    ...modelSelection
  };
}

export function evaluateRouteUsage(route, execution) {
  const budget = route?.cost_budget;
  if (!budget) return { status: "NOT_CONFIGURED", exceeded: [], unknown: [] };
  const usage = execution?.usage || {};
  const measurements = [
    ["wall_minutes", execution?.duration_ms == null ? null : execution.duration_ms / 60000, budget.max_wall_minutes],
    ["agent_turns", usage.agent_turns, budget.max_agent_turns],
    ["tool_calls", usage.tool_calls, budget.max_tool_calls],
    ["input_tokens", usage.input_tokens, budget.max_input_tokens],
    ["output_tokens", usage.output_tokens, budget.max_output_tokens]
  ];
  const exceeded = measurements
    .filter(([, actual, limit]) => actual != null && actual > limit)
    .map(([metric, actual, limit]) => ({ metric, actual, limit }));
  const unknown = measurements
    .filter(([, actual]) => actual == null)
    .map(([metric]) => metric);
  return {
    status: exceeded.length > 0 ? "FAIL" : unknown.length > 0 ? "UNKNOWN" : "PASS",
    exceeded,
    unknown
  };
}

function legacyExecutionClass(planNode) {
  if (planNode.adapter === "human" || planNode.output_contract === "decision") return "human_decision";
  if (planNode.adapter === "shell") return "deterministic_check";
  if (planNode.output_contract === "patch") return "workspace_patch";
  return "cognitive";
}

function legacyPreferredMode(executionClass) {
  if (executionClass === "deterministic_check") return "deterministic";
  if (executionClass === "human_decision") return "human";
  if (executionClass === "cognitive") return "interactive";
  return "factory";
}
