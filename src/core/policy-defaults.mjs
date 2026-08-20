export function defaultGatePolicy(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    human_gates: ["production_change", "destructive_operation", "external_api_side_effect", "security_sensitive_change", "knowledge_governance"],
    automatic_gates: ["schema_valid", "required_evidence_present", "no_untriaged_execution", "derived_views_not_worker_written"]
  };
}

export function defaultRetryPolicy(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    max_attempts: defaultRetryAttempts(),
    auto_retry: {
      enabled: true,
      reset_sandbox: true,
      retryable_failure_kinds: ["timeout", "execution_error", "contract_error", "agent_reported_failure"]
    },
    non_retryable_failure_kinds: ["scope_violation", "unsupported_change", "no_patch", "unknown"]
  };
}

export function defaultExecutionPolicy(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    interactive_workspace_patch: {
      enabled: true
    },
    interactive_host_claim: {
      lease_seconds: 1800
    },
    execution_router: {
      factory_min_duration_minutes: 30,
      force_factory_risks: ["critical"],
      factory_on_isolation: true,
      factory_on_resume: true,
      factory_on_background: true,
      factory_on_parallel_execution: true
    },
    budgets: {
      max_changed_files_per_patch: 20,
      max_patch_bytes: 1000000,
      max_agent_duration_ms: 1200000,
      max_agent_runs_per_tick: 3
    },
    permissions: {
      allowed_adapters: defaultAllowedExecutionAdapters(),
      adapter_fallback_order: [...DEFAULT_EXECUTOR_FALLBACK_ORDER],
      adapter_fallback_failure_kinds: ["timeout", "execution_error", "contract_error", "agent_reported_failure", "no_patch"],
      merge_approval_risks: ["critical"],
      sensitive_paths: [".github/", "infra/", "migrations/", "deploy/", "Dockerfile", "package-lock.json"]
    },
    approval: {
      ttl_minutes: 60,
      required_capabilities: { merge: "merge_apply", adapter_baseline: "adapter_baseline_update" }
    }
  };
}

export function defaultQualityPolicy(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    block_new_runs_on_failure: true,
    block_new_runs_on_smoke_failure: true,
    adapter_smoke_max_age_hours: 24,
    adapter_smoke_auto_refresh: true,
    adapter_smoke_refresh_timeout_ms: 180000,
    adapter_observation_interval_hours: 24,
    rolling_window_days: 7,
    rolling_run_count: 20,
    thresholds: {
      max_open_risks: 0,
      max_verification_failures: 0,
      max_adapter_failure_rate: 0.2,
      max_cycle_regression_percent: 50
    }
  };
}
import {
  DEFAULT_EXECUTOR_FALLBACK_ORDER,
  defaultAllowedExecutionAdapters,
  defaultRetryAttempts
} from "../executors/defaults.mjs";
