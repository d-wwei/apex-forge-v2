import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  BUILTIN_EXECUTOR_IDS,
  defaultAllowedExecutionAdapters,
  defaultRetryAttempts
} from "../executors/defaults.mjs";
import { schemaDirectory } from "./schema-paths.mjs";
import { withProjectTransaction } from "./project-transaction.mjs";

let registry = null;

export class ContractValidationError extends Error {
  constructor(schemaName, context, errors) {
    super(`contract validation failed: ${schemaName} (${context}): ${formatAjvErrors(errors)}`);
    this.name = "ContractValidationError";
    this.schema_name = schemaName;
    this.context = context;
    this.errors = errors || [];
  }
}

export function contractRegistry() {
  if (registry) return registry;
  const schemaDir = schemaDirectory();
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    validateFormats: false
  });
  const schemas = new Map();
  for (const file of readdirSync(schemaDir).filter((entry) => entry.endsWith(".json")).sort()) {
    const schema = JSON.parse(readFileSync(join(schemaDir, file), "utf8"));
    schemas.set(file, schema);
    ajv.addSchema(schema, schema.$id);
  }
  const validators = new Map();
  for (const [file, schema] of schemas) {
    const validate = ajv.getSchema(schema.$id);
    if (!validate) throw new Error(`无法编译 schema：${file}`);
    validators.set(file, validate);
  }
  registry = { ajv, schemas, validators };
  return registry;
}

export function validateContract(schemaName, value, context = schemaName) {
  const validate = contractRegistry().validators.get(schemaName);
  if (!validate) throw new Error(`未知 contract schema：${schemaName}`);
  const valid = validate(value);
  return {
    valid: Boolean(valid),
    schema_name: schemaName,
    context,
    errors: valid ? [] : structuredErrors(validate.errors)
  };
}

export function assertContract(schemaName, value, context = schemaName) {
  const result = validateContract(schemaName, value, context);
  if (!result.valid) {
    throw new ContractValidationError(schemaName, context, result.errors);
  }
  return value;
}

export function validatePersistedValue(path, value) {
  const targets = contractTargets(path, value);
  for (const target of targets) {
    assertContract(target.schema_name, target.value, target.context);
  }
  return targets.length;
}

export function scanProjectContracts(projectDir) {
  contractRegistry();
  const root = join(projectDir, ".apex-v2");
  const errors = [];
  let validated = 0;
  let skipped = 0;
  const files = listJsonFiles(root);

  for (const path of files) {
    let value;
    try {
      value = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      errors.push({
        path: relative(projectDir, path),
        schema_name: null,
        errors: [{ instance_path: "", keyword: "parse", message: error.message }]
      });
      continue;
    }
    const targets = contractTargets(path, value);
    if (targets.length === 0) {
      skipped += 1;
      continue;
    }
    for (const target of targets) {
      const result = validateContract(target.schema_name, target.value, target.context);
      validated += 1;
      if (!result.valid) {
        errors.push({
          path: relative(projectDir, path),
          schema_name: target.schema_name,
          context: target.context,
          errors: result.errors
        });
      }
    }
  }

  const eventPath = join(root, "events.jsonl");
  if (existsSync(eventPath)) {
    for (const [index, line] of readFileSync(eventPath, "utf8").split("\n").entries()) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const result = validateContract("event.schema.json", event, `events.jsonl:${index + 1}`);
        validated += 1;
        if (!result.valid) {
          errors.push({
            path: ".apex-v2/events.jsonl",
            schema_name: "event.schema.json",
            context: `line ${index + 1}`,
            errors: result.errors
          });
        }
      } catch (error) {
        errors.push({
          path: ".apex-v2/events.jsonl",
          schema_name: "event.schema.json",
          context: `line ${index + 1}`,
          errors: [{ instance_path: "", keyword: "parse", message: error.message }]
        });
      }
    }
  }

  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    schema_count: contractRegistry().schemas.size,
    json_files: files.length,
    validated_contracts: validated,
    skipped_files: skipped,
    errors
  };
}

export function migrateLegacyContracts(projectDir, apply = false) {
  const plan = migrateLegacyContractsInternal(projectDir, false);
  if (!apply || plan.migration_count === 0) return plan;
  const planHash = createHash("sha256")
    .update(JSON.stringify(plan.migrations))
    .digest("hex");
  return withProjectTransaction(projectDir, {
    kind: "contract-migration",
    idempotencyKey: `contract-migration:${planHash}`
  }, () => migrateLegacyContractsInternal(projectDir, true)).result;
}

function migrateLegacyContractsInternal(projectDir, apply) {
  const root = join(projectDir, ".apex-v2");
  const migrations = [];
  for (const path of listJsonFiles(root)) {
    const name = basename(path);
    const value = JSON.parse(readFileSync(path, "utf8"));
    const fields = [];
    if (name === "project.json" && value.format_version == null) {
      value.format_version = 1;
      fields.push("format_version");
    }
    if (name === "project.json" && value.revision == null) {
      value.revision = 0;
      fields.push("revision");
    }
    if (name === "worker.json" && !value.sandbox) {
      value.sandbox = { type: "none", path: "", status: "missing" };
      fields.push("sandbox");
    }
    if (name === "worker.json" && value.adapter == null) {
      value.adapter = "shell";
      fields.push("adapter");
    }
    if (name === "worker.json" && value.executor_id == null) {
      value.executor_id = value.adapter || "shell";
      fields.push("executor_id");
    }
    if (name === "worker.json" && value.execution_class == null) {
      value.execution_class = value.output_contract === "patch"
        ? "workspace_patch"
        : value.adapter === "human"
          ? "human_decision"
          : value.adapter === "shell"
            ? "deterministic_check"
            : "cognitive";
      fields.push("execution_class");
    }
    if (name === "worker.json" && value.preferred_mode == null) {
      value.preferred_mode = value.execution_class === "deterministic_check"
        ? "deterministic"
        : value.execution_class === "human_decision"
          ? "human"
          : "factory";
      fields.push("preferred_mode");
    }
    if (name === "worker.json" && !Array.isArray(value.required_capabilities)) {
      value.required_capabilities = [];
      fields.push("required_capabilities");
    }
    if (name === "worker.json" && value.output_contract == null) {
      value.output_contract = value.status === "patch_submitted" || value.status === "queued" || value.status === "merged"
        ? "patch"
        : "evidence";
      fields.push("output_contract");
    }
    if (name === "worker.json" && value.attempt == null) {
      value.attempt = 0;
      fields.push("attempt");
    }
    if (name === "worker.json" && !("last_adapter" in value)) {
      value.last_adapter = null;
      fields.push("last_adapter");
    }
    if (name === "worker.json" && !("claim_token" in value)) {
      value.claim_token = null;
      fields.push("claim_token");
    }
    if (name === "worker.json" && !("claim_expires_at" in value)) {
      value.claim_expires_at = null;
      fields.push("claim_expires_at");
    }
    if (name === "worker.json" && value.fencing_token == null) {
      value.fencing_token = 0;
      fields.push("fencing_token");
    }
    if (name === "worker.json" && !("route_id" in value)) {
      value.route_id = null;
      fields.push("route_id");
    }
    if (name === "execution-route.json") {
      if (!("method_pack_id" in value)) {
        value.method_pack_id = "legacy";
        fields.push("method_pack_id");
      }
      if (!("cost_budget" in value)) {
        value.cost_budget = null;
        fields.push("cost_budget");
      }
      if (!("budget_status" in value)) {
        value.budget_status = "not_configured";
        fields.push("budget_status");
      }
      if (!("usage_policy" in value)) {
        value.usage_policy = "record";
        fields.push("usage_policy");
      }
    }
    if (name === "items.json" && normalizedPathIncludes(path, "/intake/")) {
      for (const item of value) {
        if (!("method_pack_id" in item)) {
          item.method_pack_id = null;
          fields.push(`intake.${item.id}.method_pack_id`);
        }
        if (!("source_spec" in item)) {
          item.source_spec = null;
          fields.push(`intake.${item.id}.source_spec`);
        }
      }
    }
    if (
      name === "retry.json"
      && normalizedPathIncludes(path, "/policies/")
      && value.max_attempts?.host == null
    ) {
      value.max_attempts.host = 1;
      fields.push("max_attempts.host");
    }
    if (name === "retry.json" && normalizedPathIncludes(path, "/policies/")) {
      for (const [executorId, attempts] of Object.entries(defaultRetryAttempts())) {
        if (value.max_attempts?.[executorId] != null) continue;
        value.max_attempts[executorId] = attempts;
        fields.push(`max_attempts.${executorId}`);
      }
    }
    if (
      name === "execution.json"
      && normalizedPathIncludes(path, "/policies/")
      && !value.permissions?.allowed_adapters?.includes("host")
    ) {
      value.permissions.allowed_adapters = ["host", ...(value.permissions.allowed_adapters || [])];
      fields.push("permissions.allowed_adapters");
    }
    if (name === "execution.json" && normalizedPathIncludes(path, "/policies/")) {
      if (!value.interactive_workspace_patch) {
        value.interactive_workspace_patch = { enabled: true };
        fields.push("interactive_workspace_patch");
      }
      if (!value.interactive_host_claim) {
        value.interactive_host_claim = { lease_seconds: 1800 };
        fields.push("interactive_host_claim");
      }
      if (!value.execution_router) {
        value.execution_router = {
          force_factory_risks: ["critical"],
          factory_on_isolation: true,
          factory_on_resume: true,
          factory_on_background: true,
          factory_on_parallel_execution: true
        };
        fields.push("execution_router");
      }
      if (!value.cost_governor) {
        value.cost_governor = {
          enabled: true,
          unknown_usage: "record",
          default_budget: {
            max_wall_minutes: 30,
            max_agent_turns: 12,
            max_tool_calls: 80,
            max_input_tokens: 160000,
            max_output_tokens: 30000
          },
          method_pack_budgets: {
            quick: {
              max_wall_minutes: 12,
              max_agent_turns: 6,
              max_tool_calls: 30,
              max_input_tokens: 60000,
              max_output_tokens: 12000
            },
            "disciplined-tdd": {
              max_wall_minutes: 30,
              max_agent_turns: 12,
              max_tool_calls: 80,
              max_input_tokens: 160000,
              max_output_tokens: 30000
            },
            "phase-context": {
              max_wall_minutes: 30,
              max_agent_turns: 12,
              max_tool_calls: 80,
              max_input_tokens: 160000,
              max_output_tokens: 30000
            },
            governed: {
              max_wall_minutes: 60,
              max_agent_turns: 24,
              max_tool_calls: 180,
              max_input_tokens: 360000,
              max_output_tokens: 70000
            }
          }
        };
        fields.push("cost_governor");
      }
      const missing = defaultAllowedExecutionAdapters()
        .filter((adapter) => !value.permissions?.allowed_adapters?.includes(adapter));
      if (missing.length > 0) {
        value.permissions.allowed_adapters = [...(value.permissions.allowed_adapters || []), ...missing];
        fields.push("permissions.allowed_adapters.executors");
      }
    }
    if (name === "patch-bundle.json" && !Array.isArray(value.operations)) {
      value.operations = [];
      fields.push("operations");
    }
    if (name === "sandbox.json" && value.requested_type == null) {
      value.requested_type = value.type || "scratch";
      fields.push("requested_type");
    }
    if (name === "sandbox.json" && value.fallback_reason == null) {
      value.fallback_reason = "";
      fields.push("fallback_reason");
    }
    if (fields.length === 0) continue;
    migrations.push({
      path: relative(projectDir, path),
      fields
    });
    if (apply) writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  }
  return {
    status: migrations.length === 0 ? "CURRENT" : apply ? "MIGRATED" : "NEEDS_MIGRATION",
    applied: apply,
    migration_count: migrations.length,
    migrations
  };
}

function normalizedPathIncludes(path, value) {
  return path.replaceAll("\\", "/").includes(value);
}

function contractTargets(path, value) {
  const normalized = path.replaceAll("\\", "/");
  const name = basename(path);
  const targets = [];
  const push = (schemaName, targetValue = value, suffix = "") => {
    targets.push({
      schema_name: schemaName,
      value: targetValue,
      context: `${normalized}${suffix}`
    });
  };

  const sandboxMarker = "/sandbox/";
  if (normalized.includes("/workers/") && normalized.includes(sandboxMarker)) {
    const sandboxRelative = normalized.split(sandboxMarker).at(-1);
    if (sandboxRelative !== "sandbox.json") return targets;
  }

  if (name === "project.json") push("project-state.schema.json");
  else if (name === "graph.json" && normalized.includes("/roadmap/")) push("roadmap-graph.schema.json");
  else if (name === "manifest.json" && normalized.includes("/knowledge/")) push("project-knowledge.schema.json");
  else if (name === "run.json") push("delivery-run.schema.json");
  else if (name === "plan-graph.json") push("plan-graph.schema.json");
  else if (name === "worker.json") push("worker-run.schema.json");
  else if (name === "worker-summary.json") push("worker-summary.schema.json");
  else if (name === "patch-bundle.json") push("patch-bundle.schema.json");
  else if (name === "merge-queue.json") push("merge-queue.schema.json");
  else if (name === "decision-queue.json") push("decision-queue.schema.json");
  else if (name === "verification-report.json") push("verification-report.schema.json");
  else if (name === "review-report.json") push("review-report.schema.json");
  else if (name === "integration-report.json") push("integration-report.schema.json");
  else if (name === "learning-report.json") push("learning-report.schema.json");
  else if (name === "retry.json" && normalized.includes("/policies/")) push("retry-policy.schema.json");
  else if (name === "execution.json" && normalized.includes("/policies/")) push("execution-policy.schema.json");
  else if (name === "method-packs.json" && normalized.includes("/policies/")) push("method-pack-registry.schema.json");
  else if (name === "git.json" && normalized.includes("/delivery/")) push("git-delivery.schema.json");
  else if (name === "quality.json" && normalized.includes("/policies/")) push("quality-policy.schema.json");
  else if (name === "notifications.json" && normalized.includes("/policies/")) push("notification-policy.schema.json");
  else if (name === "gates.json" && normalized.includes("/policies/")) push("gate-policy.schema.json");
  else if (name === "register.json" && normalized.includes("/risks/")) push("risk-register.schema.json");
  else if (name === "sandbox.json") push("sandbox-manifest.schema.json");
  else if (name === "agent-result.json") push("agent-result.schema.json");
  else if (name === "host-action.json") push("host-action.schema.json");
  else if (name === "host-result.json") push("host-result.schema.json");
  else if (name === "action-workspace.json") push("action-workspace.schema.json");
  else if (name === "cognitive-evidence.json") push("cognitive-evidence.schema.json");
  else if (name.startsWith("capability-invocation-")) push("capability-invocation.schema.json");
  else if (name.startsWith("capability-evidence-")) push("capability-evidence.schema.json");
  else if (name === "execution-route.json") push("execution-route.schema.json");
  else if (name.startsWith("candidate-") && normalized.includes("/candidates/")) push("candidate-set.schema.json");
  else if (name.startsWith("transaction-") && normalized.includes("/transactions/")) push("transaction-journal.schema.json");
  else if (name.startsWith("adapter-result-")) push("adapter-result.schema.json");
  else if (name.startsWith("artifact-") && normalized.includes("/artifacts/")) push("stored-artifact.schema.json");
  else if (name.startsWith("resolution-") && normalized.includes("/resolutions/")) push("merge-resolution.schema.json");
  else if (name.startsWith("audit-") && normalized.includes("/audits/")) push("audit-report.schema.json");
  else if (name.startsWith("reconcile-") && normalized.includes("/reconciliations/")) push("reconciliation-report.schema.json");
  else if ((name.startsWith("metrics-") || name === "latest.json") && normalized.includes("/metrics/")) push("metrics-snapshot.schema.json");
  else if (name === "capabilities.json" && normalized.includes("/adapters/")) push("adapter-capabilities.schema.json");
  else if ((name.startsWith("smoke-") || name === "latest-smoke.json" || name === "latest-live-smoke.json" || name === "latest-static-smoke.json") && normalized.includes("/adapters/")) push("adapter-smoke-report.schema.json");
  else if (name.startsWith("adapter-observation-") && normalized.includes("/adapters/history/")) push("adapter-observation.schema.json");
  else if (name === "latest-trend.json" && normalized.includes("/adapters/")) push("adapter-trend-report.schema.json");
  else if (name === "outbox.json" && normalized.includes("/notifications/")) push("notification-outbox.schema.json");
  else if (name === "daemon.json" && normalized.includes("/heartbeat/")) push("heartbeat-daemon-state.schema.json");
  else if (name === "items.json" && normalized.includes("/intake/")) {
    for (const [index, item] of value.entries()) push("intake-item.schema.json", item, `#${index}`);
  } else if (name === "proposals.json" && normalized.includes("/learning/")) {
    for (const [index, item] of value.entries()) push("learning-proposal.schema.json", item, `#${index}`);
  } else if (name === "items.json" && normalized.includes("/approvals/")) {
    for (const [index, item] of value.entries()) push("approval-request.schema.json", item, `#${index}`);
  }
  return targets;
}

function listJsonFiles(root) {
  const files = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (dir === root && entry.isDirectory() && entry.name === "releases") {
        continue;
      }
      if (
        entry.isDirectory()
        && entry.name === "sandbox"
        && path.replaceAll("\\", "/").includes("/workers/")
      ) {
        const manifest = join(path, "sandbox.json");
        if (existsSync(manifest)) files.push(manifest);
      } else if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
    }
  }
  walk(root);
  return files;
}

function structuredErrors(errors) {
  return (errors || []).map((error) => ({
    instance_path: error.instancePath || "",
    schema_path: error.schemaPath || "",
    keyword: error.keyword,
    message: error.message || "",
    params: error.params
  }));
}

function formatAjvErrors(errors) {
  return errors
    .map((error) => `${error.instance_path || "/"} ${error.message}`)
    .join("; ");
}
