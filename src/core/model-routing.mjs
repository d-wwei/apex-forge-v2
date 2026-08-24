const AGENT_MODEL_TIERS = ["cheap", "standard", "strong"];
const MODEL_TIERS = [...AGENT_MODEL_TIERS, "deterministic"];
const IMMEDIATE_ESCALATION_FAILURES = new Set([
  "agent_reported_failure",
  "no_patch"
]);
const DELAYED_ESCALATION_FAILURES = new Set([
  "timeout",
  "contract_error"
]);
const ADAPTER_FALLBACK_FAILURES = new Set(["execution_error"]);
const NON_ESCALATING_FAILURES = new Set([
  "scope_violation",
  "unsupported_change",
  "budget_exceeded"
]);

export function defaultModelRoutingPolicy() {
  return {
    tier_order: [...AGENT_MODEL_TIERS],
    default_agent_tier: "standard",
    executor_models: {
      codex: {
        cheap: "gpt-5.6-luna",
        standard: "gpt-5.6-terra",
        strong: "gpt-5.6-sol"
      }
    }
  };
}

export function resolveModelSelection({
  planNode = {},
  executionPolicy = {},
  adapter = null,
  requestedModel = null,
  worker = null,
  route = null,
  priorResults = []
}) {
  const policy = normalizedModelRoutingPolicy(executionPolicy?.model_routing);
  const executionClass = planNode.execution_class
    || worker?.execution_class
    || legacyExecutionClass(planNode);
  const deterministic = ["deterministic_check", "human_decision"].includes(executionClass);
  const declaredTier = planNode.model_tier || null;

  if (declaredTier != null && !MODEL_TIERS.includes(declaredTier)) {
    throw new Error(`model_tier 无效：${declaredTier}`);
  }
  if (deterministic && declaredTier && declaredTier !== "deterministic") {
    throw new Error(`deterministic node 不能声明 Agent 模型档位：${declaredTier}`);
  }
  if (!deterministic && declaredTier === "deterministic") {
    throw new Error("Agent node 不能声明 deterministic 模型档位");
  }

  if (deterministic) {
    if (requestedModel) {
      throw new Error("deterministic node 不接受 CLI model override");
    }
    return {
      initial_model_tier: "deterministic",
      model_tier: "deterministic",
      model_id: null,
      model_reason: [declaredTier ? "plan_node=deterministic" : "execution_class=deterministic"],
      retry_action: "initial"
    };
  }

  const initialTier = firstAgentTier([
    worker?.initial_model_tier,
    route?.initial_model_tier,
    declaredTier,
    policy.default_agent_tier
  ]);
  const startingTier = strongestTier(policy, [
    initialTier,
    worker?.model_tier,
    route?.model_tier
  ]);
  const retry = retryModelDecision(startingTier, priorResults, policy);
  let modelTier = retry.model_tier;
  let modelId = modelForTier(policy, adapter, modelTier);
  const reasons = [];

  if (declaredTier) reasons.push(`plan_node=${declaredTier}`);
  else if (worker?.initial_model_tier || route?.initial_model_tier) {
    reasons.push(`initial_tier=${initialTier}`);
  } else {
    reasons.push(`default=${initialTier}`);
  }
  if (retry.reason) reasons.push(retry.reason);

  if (requestedModel) {
    const requestedTier = tierForModel(policy, adapter, requestedModel);
    if (!requestedTier) {
      throw new Error(`无法判定 CLI model 的模型档位：${requestedModel}`);
    }
    if (tierRank(policy, requestedTier) < tierRank(policy, modelTier)) {
      throw new Error(
        `CLI model 不能降低节点最低模型档位：${requestedModel}=${requestedTier} < ${modelTier}`
      );
    }
    modelTier = requestedTier;
    modelId = requestedModel;
    reasons.push(`cli_model=${requestedModel}`);
  }

  return {
    initial_model_tier: initialTier,
    model_tier: modelTier,
    model_id: modelId,
    model_reason: Array.from(new Set(reasons)),
    retry_action: retry.action
  };
}

function retryModelDecision(currentTier, results, policy) {
  const failures = (results || []).filter((result) => result?.status === "FAIL");
  const latest = failures.at(-1);
  if (!latest) {
    return {
      model_tier: currentTier,
      action: "initial",
      reason: null
    };
  }

  const failureKind = latest.failure_kind || "unknown";
  if (IMMEDIATE_ESCALATION_FAILURES.has(failureKind)) {
    const nextTier = raiseTier(policy, currentTier);
    return {
      model_tier: nextTier,
      action: nextTier === currentTier ? "same_tier_retry" : "escalate",
      reason: nextTier === currentTier
        ? `retry_at_max_tier=${failureKind}`
        : `escalated_after=${failureKind}`
    };
  }

  if (DELAYED_ESCALATION_FAILURES.has(failureKind)) {
    const failuresAtTier = failures.filter((result) =>
      result.model_tier === currentTier
      && DELAYED_ESCALATION_FAILURES.has(result.failure_kind)
    ).length;
    if (failuresAtTier >= 2) {
      const nextTier = raiseTier(policy, currentTier);
      return {
        model_tier: nextTier,
        action: nextTier === currentTier ? "same_tier_retry" : "escalate",
        reason: nextTier === currentTier
          ? `retry_at_max_tier=${failureKind}`
          : `escalated_after=repeated_${failureKind}`
      };
    }
    return {
      model_tier: currentTier,
      action: "same_tier_retry",
      reason: `same_tier_retry=${failureKind}`
    };
  }

  if (ADAPTER_FALLBACK_FAILURES.has(failureKind)) {
    return {
      model_tier: currentTier,
      action: "adapter_fallback",
      reason: `adapter_fallback=${failureKind}`
    };
  }

  if (NON_ESCALATING_FAILURES.has(failureKind)) {
    return {
      model_tier: currentTier,
      action: "blocked",
      reason: `model_escalation_blocked=${failureKind}`
    };
  }

  return {
    model_tier: currentTier,
    action: "same_tier_retry",
    reason: `same_tier_retry=${failureKind}`
  };
}

function normalizedModelRoutingPolicy(value) {
  const defaults = defaultModelRoutingPolicy();
  return {
    tier_order: Array.isArray(value?.tier_order) && value.tier_order.length > 0
      ? value.tier_order.filter((tier) => AGENT_MODEL_TIERS.includes(tier))
      : defaults.tier_order,
    default_agent_tier: AGENT_MODEL_TIERS.includes(value?.default_agent_tier)
      ? value.default_agent_tier
      : defaults.default_agent_tier,
    executor_models: {
      ...defaults.executor_models,
      ...(value?.executor_models || {})
    }
  };
}

function strongestTier(policy, candidates) {
  const valid = candidates.filter((tier) => AGENT_MODEL_TIERS.includes(tier));
  return valid.slice(1)
    .reduce((strongest, tier) =>
      tierRank(policy, tier) > tierRank(policy, strongest) ? tier : strongest,
    valid[0] || policy.default_agent_tier);
}

function firstAgentTier(candidates) {
  return candidates.find((tier) => AGENT_MODEL_TIERS.includes(tier)) || "standard";
}

function tierRank(policy, tier) {
  const index = policy.tier_order.indexOf(tier);
  return index < 0 ? policy.tier_order.indexOf(policy.default_agent_tier) : index;
}

function raiseTier(policy, tier) {
  const index = tierRank(policy, tier);
  return policy.tier_order[Math.min(index + 1, policy.tier_order.length - 1)];
}

function modelForTier(policy, adapter, tier) {
  if (!adapter || tier === "deterministic") return null;
  return policy.executor_models?.[adapter]?.[tier] || null;
}

function tierForModel(policy, adapter, model) {
  const entries = Object.entries(policy.executor_models?.[adapter] || {});
  return entries.find(([, modelId]) => modelId === model)?.[0] || null;
}

function legacyExecutionClass(planNode) {
  if (planNode.adapter === "human" || planNode.output_contract === "decision") {
    return "human_decision";
  }
  if (planNode.adapter === "shell") return "deterministic_check";
  if (planNode.output_contract === "patch") return "workspace_patch";
  return "cognitive";
}
