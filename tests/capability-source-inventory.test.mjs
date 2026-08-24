import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateContract } from "../src/core/contracts.mjs";

const inventoryPath = new URL(
  "../capabilities/source-inventory.json",
  import.meta.url
);

test("capability source inventory freezes all 21 provenance decisions", () => {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  assert.equal(
    validateContract("capability-source-inventory.schema.json", inventory).valid,
    true
  );
  assert.equal(inventory.schema_version, "v0");
  assert.equal(inventory.sources.length, 21);
  assert.equal(new Set(inventory.sources.map((item) => item.capability_id)).size, 21);
  for (const item of inventory.sources) {
    assert.match(item.capability_id, /^[a-z][a-z0-9-]*$/);
    assert.match(item.source_sha256, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(item.source_ref, /^(?:\/|[A-Za-z]:[\\/])/);
    assert.ok([
      "MIT",
      "clean-room-no-copy",
      "design-reference-only"
    ].includes(item.license));
    assert.notEqual(item.license, "metadata-missing");
    assert.ok(["OWNED", "MIT", "REWRITE_ONLY"].includes(item.absorption_policy));
    assert.ok(item.canonical_target.startsWith("capabilities/"));
  }
});
