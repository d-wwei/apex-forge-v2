import { normalizeExecutionCapabilities } from "../contracts/execution-capability.mjs";

export function routeExecution(planNode, executionPolicy, options = {}) {
  const executionClass = planNode.execution_class || legacyExecutionClass(planNode);
  const requestedMode = options.mode || null;
  const preferredMode = planNode.preferred_mode || legacyPreferredMode(executionClass);
  const hints = {
    estimated_duration_minutes: Number(planNode.execution_hints?.estimated_duration_minutes || 0),
    requires_isolation: Boolean(planNode.execution_hints?.requires_isolation),
    requires_resume: Boolean(planNode.execution_hints?.requires_resume),
    background: Boolean(planNode.execution_hints?.background),
    requires_parallel_execution: Boolean(planNode.execution_hints?.requires_parallel_execution)
  };
  const router = executionPolicy?.execution_router || {
    factory_min_duration_minutes: 30,
    force_factory_risks: ["critical"],
    factory_on_isolation: true,
    factory_on_resume: true,
    factory_on_background: true,
    factory_on_parallel_execution: true
  };
  const reasons = [];
  let mode = preferredMode;

  if (executionClass === "cognitive") {
    mode = "interactive";
    reasons.push("cognitive_host");
  } else if (executionClass === "deterministic_check") {
    mode = "deterministic";
    reasons.push("deterministic_check");
  } else if (executionClass === "human_decision") {
    mode = "human";
    reasons.push("human_decision");
  } else {
    if (executionPolicy?.interactive_workspace_patch?.enabled !== true) {
      mode = "factory";
      reasons.push("interactive_workspace_patch_disabled");
    }
    if (router.force_factory_risks?.includes(planNode.risk)) {
      mode = "factory";
      reasons.push(`risk=${planNode.risk}`);
    }
    if (hints.estimated_duration_minutes >= router.factory_min_duration_minutes) {
      mode = "factory";
      reasons.push(`duration>=${router.factory_min_duration_minutes}`);
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
      (executionClass === "cognitive" && requestedMode !== "interactive")
      || (executionClass === "deterministic_check" && requestedMode !== "deterministic")
      || (executionClass === "human_decision" && requestedMode !== "human")
    ) {
      throw new Error(`execution mode override 与 execution_class 不兼容：${executionClass} -> ${requestedMode}`);
    }
    if (
      executionClass === "workspace_patch"
      && requestedMode === "interactive"
      && executionPolicy?.interactive_workspace_patch?.enabled !== true
    ) {
      throw new Error("execution policy 禁止 Interactive workspace_patch override");
    }
    mode = requestedMode;
    reasons.push(`user_override=${requestedMode}`);
  }
  if (reasons.length === 0) reasons.push(`preferred_mode=${mode}`);

  return {
    mode,
    preferred_mode: preferredMode,
    user_override: requestedMode,
    reasons: Array.from(new Set(reasons)),
    hints,
    required_capabilities: normalizeExecutionCapabilities(planNode.required_capabilities || [])
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
