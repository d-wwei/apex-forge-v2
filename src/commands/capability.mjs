import {
  capabilityRegistry,
  readCapabilityProtocol,
  routeCapabilities
} from "../core/capability-registry.mjs";
import { normalizeEnum, required } from "../lib/common.mjs";

export function handleCapabilityCommand(subcommand, args) {
  const registry = capabilityRegistry();
  if (subcommand === "list") {
    console.log(JSON.stringify(
      registry.capabilities.map(publicDefinition),
      null,
      2
    ));
    return;
  }
  if (subcommand === "show") {
    const id = required(args, "id");
    const definition = registry.capabilities.find((item) =>
      item.capability_id === id
    );
    if (!definition) throw new Error(`找不到 Capability：${id}`);
    console.log(JSON.stringify({
      ...publicDefinition(definition),
      protocol: readCapabilityProtocol(definition.protocol_ref)
    }, null, 2));
    return;
  }
  if (subcommand === "route") {
    const intake = {
      type: normalizeEnum(
        args.type || "feature",
        [
          "feature",
          "bug",
          "test_failure",
          "review_feedback",
          "tech_debt",
          "risk",
          "idea",
          "other"
        ],
        "type"
      ),
      risk: normalizeEnum(
        args.risk || "medium",
        ["low", "medium", "high", "critical"],
        "risk"
      ),
      title: String(args.title || ""),
      description: String(args.description || ""),
      affected_area: String(args.area || "unknown")
    };
    console.log(JSON.stringify(routeCapabilities(registry, intake), null, 2));
    return;
  }
  if (subcommand === "verify") {
    console.log(JSON.stringify({
      status: "PASS",
      registry_version: registry.registry_version,
      enforcement_mode: registry.enforcement_mode,
      public_skill_id: registry.public_skill_id,
      capability_count: registry.capabilities.length,
      binding_count: registry.bindings.length
    }, null, 2));
    return;
  }
  throw new Error(`未知 capability 子命令：${subcommand || "(空)"}`);
}

function publicDefinition(definition) {
  const { protocol_path: _protocolPath, ...publicValue } = definition;
  return publicValue;
}
