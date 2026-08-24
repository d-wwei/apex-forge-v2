#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const capabilityRoot = join(repoRoot, "capabilities");
const schemaRoot = join(repoRoot, "schemas");
const registry = JSON.parse(readFileSync(
  join(capabilityRoot, "registry.json"),
  "utf8"
));
const lock = {
  schema_version: "v0",
  registry_version: registry.registry_version,
  public_skill_id: registry.public_skill_id,
  previous_versions: registry.previous_versions || {},
  capabilities: registry.capabilities.map((definition) => ({
    capability_id: definition.capability_id,
    version: definition.version,
    definition_sha256: sha256(Buffer.from(JSON.stringify(definition))),
    protocol_sha256: sha256(readFileSync(resolve(
      repoRoot,
      definition.protocol_ref
    ))),
    input_schema_sha256: sha256(readFileSync(join(
      schemaRoot,
      `${definition.input_contract}.schema.json`
    ))),
    output_schema_sha256: sha256(readFileSync(join(
      schemaRoot,
      `${definition.output_contract}.schema.json`
    )))
  }))
};

writeFileSync(
  join(capabilityRoot, "capability-lock.json"),
  `${JSON.stringify(lock, null, 2)}\n`
);
console.log(JSON.stringify({
  status: "PASS",
  registry_version: lock.registry_version,
  capability_count: lock.capabilities.length
}, null, 2));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
