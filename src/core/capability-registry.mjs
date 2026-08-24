import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { assertSafeRelativePath } from "../lib/common.mjs";
import { assertContract, contractRegistry } from "./contracts.mjs";
import { schemaPath } from "./schema-paths.mjs";

const DEFAULT_CAPABILITY_DIR = new URL("../../capabilities/", import.meta.url).pathname;
const PROVIDER_REQUIRED_CAPABILITIES = new Set([
  "browser-qa",
  "mobile-qa",
  "performance-validation",
  "deploy-release"
]);

export function capabilityRegistry() {
  const registry = withEnforcementOverride(
    loadCapabilityRegistry(capabilityDirectory())
  );
  const lockPath = join(capabilityDirectory(), "capability-lock.json");
  if (!existsSync(lockPath)) {
    throw new Error(`Capability Lock 不存在：${lockPath}`);
  }
  validateCapabilityLock(
    JSON.parse(readFileSync(lockPath, "utf8")),
    registry
  );
  return registry;
}

function withEnforcementOverride(registry) {
  const configured = String(
    process.env.APEX_CAPABILITY_ENFORCEMENT_MODE || ""
  ).trim();
  if (!configured) return registry;
  if (!["shadow", "enforce"].includes(configured)) {
    throw new Error(
      `APEX_CAPABILITY_ENFORCEMENT_MODE 无效：${configured}，仅支持 shadow|enforce`
    );
  }
  return {
    ...registry,
    enforcement_mode: configured
  };
}

export function capabilityDirectory() {
  return process.env.APEX_V2_CAPABILITY_DIR || DEFAULT_CAPABILITY_DIR;
}

export function loadCapabilityRegistry(root = capabilityDirectory()) {
  const registryPath = resolveRegistryPath(root);
  if (!existsSync(registryPath)) {
    throw new Error(`Capability Registry 不存在：${registryPath}`);
  }
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const repoRoot = basename(dirname(registryPath)) === "capabilities"
    ? dirname(dirname(registryPath))
    : resolve(root);
  return validateCapabilityRegistry(registry, { repoRoot });
}

export function validateCapabilityRegistry(registry, options = {}) {
  if (!Array.isArray(registry?.capabilities) || registry.capabilities.length === 0) {
    throw new Error("Capability Registry 至少包含 1 项能力");
  }
  assertContract("capability-registry.schema.json", registry, "Capability Registry");
  const repoRoot = options.repoRoot || dirname(capabilityDirectory());
  const capabilityIds = new Set();
  const bindingIds = new Set();
  const capabilities = registry.capabilities.map((definition) => {
    if (capabilityIds.has(definition.capability_id)) {
      throw new Error(`Capability ID 重复：${definition.capability_id}`);
    }
    capabilityIds.add(definition.capability_id);
    assertSafeRelativePath(definition.protocol_ref);
    if (!definition.protocol_ref.startsWith("capabilities/")) {
      throw new Error(`Capability protocol_ref 不安全：${definition.protocol_ref}`);
    }
    const protocolPath = resolve(repoRoot, definition.protocol_ref);
    if (!existsSync(protocolPath)) {
      throw new Error(`Capability protocol 不存在：${definition.protocol_ref}`);
    }
    for (const [kind, contract] of [
      ["input", definition.input_contract],
      ["output", definition.output_contract]
    ]) {
      const schemaName = `${contract}.schema.json`;
      if (!contractRegistry().validators.has(schemaName)) {
        throw new Error(
          `Capability ${kind} contract schema 不存在：${definition.capability_id} -> ${schemaName}`
        );
      }
    }
    const forbiddenTools = definition.allowed_tools.filter((tool) =>
      definition.forbidden_actions.includes(tool)
    );
    if (forbiddenTools.length > 0) {
      throw new Error(
        `Capability tool 同时 allowed/forbidden：${definition.capability_id} `
        + forbiddenTools.join(",")
      );
    }
    return {
      ...definition,
      protocol_path: protocolPath
    };
  });
  for (const [capabilityId, versions] of Object.entries(
    registry.previous_versions || {}
  )) {
    const definition = capabilities.find((item) =>
      item.capability_id === capabilityId
    );
    if (!definition) {
      throw new Error(`Capability previous_versions 引用未知能力：${capabilityId}`);
    }
    if (versions.includes(definition.version)) {
      throw new Error(
        `Capability previous_versions 不能包含当前版本：${capabilityId}@${definition.version}`
      );
    }
  }
  for (const binding of registry.bindings || []) {
    if (bindingIds.has(binding.binding_id)) {
      throw new Error(`Capability Binding ID 重复：${binding.binding_id}`);
    }
    bindingIds.add(binding.binding_id);
    if (!capabilityIds.has(binding.capability_id)) {
      throw new Error(`Capability Binding 引用未知能力：${binding.capability_id}`);
    }
    for (const pattern of conditionPatterns(binding.conditions)) {
      try {
        new RegExp(pattern, "i");
      } catch (error) {
        throw new Error(`Capability Binding 正则无效：${binding.binding_id}：${error.message}`);
      }
    }
  }
  return {
    ...registry,
    capabilities
  };
}

export function readCapabilityProtocol(protocolRef) {
  assertSafeRelativePath(protocolRef);
  if (!protocolRef.startsWith("capabilities/")) {
    throw new Error(`Capability protocol_ref 不安全：${protocolRef}`);
  }
  const path = resolve(dirname(capabilityDirectory()), protocolRef);
  if (!existsSync(path)) throw new Error(`Capability protocol 不存在：${protocolRef}`);
  return readFileSync(path, "utf8");
}

export function routeCapabilities(registry, intake) {
  const routerMode = String(
    process.env.APEX_CAPABILITY_ROUTER_MODE || "enabled"
  ).trim();
  if (!["enabled", "disabled"].includes(routerMode)) {
    throw new Error(
      `APEX_CAPABILITY_ROUTER_MODE 无效：${routerMode}，仅支持 enabled|disabled`
    );
  }
  if (routerMode === "disabled") {
    return {
      registry_version: registry.registry_version,
      enforcement_mode: registry.enforcement_mode,
      router_mode: "disabled",
      required: [],
      optional: [],
      advisory: [],
      matched_binding_ids: []
    };
  }
  const definitions = new Map(
    registry.capabilities
      .filter((definition) => definition.enabled !== false)
      .map((definition) => [definition.capability_id, definition])
  );
  const selected = new Map();
  for (const binding of (registry.bindings || [])
    .filter((item) => item.enabled !== false)
    .sort((left, right) =>
      right.priority - left.priority
      || left.binding_id.localeCompare(right.binding_id)
    )) {
    if (!matchesConditions(binding.conditions, intake)) continue;
    const definition = definitions.get(binding.capability_id);
    if (!definition || selected.has(definition.capability_id)) continue;
    selected.set(definition.capability_id, {
      capability_id: definition.capability_id,
      capability_version: definition.version,
      category: definition.category,
      execution_class: definition.execution_class,
      required_host_capabilities: definition.required_host_capabilities,
      input_contract: definition.input_contract,
      output_contract: definition.output_contract,
      protocol_ref: definition.protocol_ref,
      protocol_path: definition.protocol_path,
      availability: definition.availability,
      certification: definition.certification,
      binding_id: binding.binding_id,
      priority: binding.priority,
      mode: binding.mode,
      target_node_id: binding.plan_insertion.target_node_id,
      required: binding.plan_insertion.required
    });
  }
  const values = [...selected.values()].sort((left, right) =>
    right.priority - left.priority
    || left.capability_id.localeCompare(right.capability_id)
  );
  return {
    registry_version: registry.registry_version,
    enforcement_mode: registry.enforcement_mode,
    router_mode: "enabled",
    required: values.filter((item) => item.mode === "required"),
    optional: values.filter((item) => item.mode === "optional"),
    advisory: values.filter((item) => item.mode === "advisory"),
    matched_binding_ids: values.map((item) => item.binding_id)
  };
}

export function assertCapabilityContextBudget(
  bindings = [],
  limits = { core: 3, conditional: 2 }
) {
  const counts = bindings.reduce((value, binding) => {
    const category = String(binding.category || "");
    value[category] = (value[category] || 0) + 1;
    return value;
  }, {});
  for (const [category, limit] of Object.entries(limits)) {
    if ((counts[category] || 0) > limit) {
      throw new Error(
        `Capability context budget exceeded：${category} `
        + `${counts[category]} > ${limit}；必须拆分或 replan`
      );
    }
  }
  return {
    counts,
    limits: { ...limits }
  };
}

export function assertCapabilityProviderAvailability(
  bindings = [],
  declaredProviders = process.env.APEX_CAPABILITY_PROVIDERS || ""
) {
  const available = new Set(
    Array.isArray(declaredProviders)
      ? declaredProviders
      : String(declaredProviders)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
  );
  const missing = bindings
    .filter((binding) =>
      binding.required
      && PROVIDER_REQUIRED_CAPABILITIES.has(binding.capability_id)
      && !available.has(binding.capability_id)
    )
    .map((binding) => binding.capability_id);
  if (missing.length > 0) {
    throw new Error(
      `Capability provider unavailable：${missing.join(", ")}；`
      + "通过 APEX_CAPABILITY_PROVIDERS 显式声明已认证 provider"
    );
  }
  return {
    declared: [...available].sort(),
    required: bindings
      .filter((binding) => PROVIDER_REQUIRED_CAPABILITIES.has(binding.capability_id))
      .map((binding) => binding.capability_id)
  };
}

export function validateCapabilityLock(lock, registry) {
  assertContract("capability-lock.schema.json", lock, "Capability Lock");
  if (lock.registry_version !== registry.registry_version) {
    throw new Error(
      `Capability Lock registry version drift：${lock.registry_version} != ${registry.registry_version}`
    );
  }
  if (
    JSON.stringify(lock.previous_versions || {})
    !== JSON.stringify(registry.previous_versions || {})
  ) {
    throw new Error("Capability Lock previous_versions drift");
  }
  const definitions = new Map(
    registry.capabilities.map((item) => [item.capability_id, item])
  );
  const seen = new Set();
  for (const item of lock.capabilities) {
    if (seen.has(item.capability_id)) {
      throw new Error(`Capability Lock ID 重复：${item.capability_id}`);
    }
    seen.add(item.capability_id);
    const definition = definitions.get(item.capability_id);
    if (!definition) {
      throw new Error(`Capability Lock 引用未知能力：${item.capability_id}`);
    }
    if (item.version !== definition.version) {
      throw new Error(
        `Capability version drift：${item.capability_id} ${item.version} != ${definition.version}`
      );
    }
    const { protocol_path: _protocolPath, ...portableDefinition } = definition;
    const definitionSha256 = createHash("sha256")
      .update(JSON.stringify(portableDefinition))
      .digest("hex");
    if (definitionSha256 !== item.definition_sha256) {
      throw new Error(
        `Capability definition hash drift：${item.capability_id} `
        + `${item.definition_sha256} != ${definitionSha256}`
      );
    }
    const protocolSha256 = createHash("sha256")
      .update(readFileSync(definition.protocol_path))
      .digest("hex");
    if (protocolSha256 !== item.protocol_sha256) {
      throw new Error(
        `Capability protocol hash drift：${item.capability_id} ${item.protocol_sha256} != ${protocolSha256}`
      );
    }
    for (const [kind, contract, expected] of [
      ["input", definition.input_contract, item.input_schema_sha256],
      ["output", definition.output_contract, item.output_schema_sha256]
    ]) {
      const actual = createHash("sha256")
        .update(readFileSync(schemaPath(`${contract}.schema.json`)))
        .digest("hex");
      if (actual !== expected) {
        throw new Error(
          `Capability ${kind} schema hash drift：${item.capability_id} `
          + `${expected} != ${actual}`
        );
      }
    }
  }
  if (seen.size !== definitions.size) {
    const missing = [...definitions.keys()].filter((id) => !seen.has(id));
    throw new Error(`Capability Lock 缺少能力：${missing.join(",")}`);
  }
  return lock;
}

function resolveRegistryPath(root) {
  const direct = join(resolve(root), "registry.json");
  if (existsSync(direct)) return direct;
  return join(resolve(root), "capabilities", "registry.json");
}

function matchesConditions(conditions, intake) {
  const checks = [];
  if (conditions.intake_types?.length > 0) {
    checks.push(conditions.intake_types.includes(String(intake.type || "")));
  }
  if (conditions.risk_levels?.length > 0) {
    checks.push(conditions.risk_levels.includes(String(intake.risk || "")));
  }
  for (const [field, patterns] of [
    ["title", conditions.title_patterns],
    ["description", conditions.description_patterns],
    ["affected_area", conditions.affected_area_patterns]
  ]) {
    if (!patterns?.length) continue;
    const value = String(intake[field] || "");
    checks.push(patterns.some((pattern) => new RegExp(pattern, "i").test(value)));
  }
  if (checks.length === 0) return false;
  return conditions.match === "all"
    ? checks.every(Boolean)
    : checks.some(Boolean);
}

function conditionPatterns(conditions = {}) {
  return [
    ...(conditions.title_patterns || []),
    ...(conditions.description_patterns || []),
    ...(conditions.affected_area_patterns || [])
  ];
}
