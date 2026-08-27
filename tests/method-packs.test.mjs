import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultMethodPackRegistry,
  resolveMethodPack
} from "../src/core/method-packs.mjs";
import { validateContract } from "../src/core/contracts.mjs";

const inventory = {
  files: ["src/value.mjs", "tests/value.test.mjs"]
};

function intake(overrides = {}) {
  return {
    type: "feature",
    title: "Change value",
    description: "",
    risk: "medium",
    affected_area: "src/value.mjs,tests/value.test.mjs",
    triage: { status: "accepted" },
    ...overrides
  };
}

test("method pack registry exposes safe built-in workflows", () => {
  const registry = defaultMethodPackRegistry("2026-08-20T00:00:00.000Z");
  assert.equal(registry.default_pack_id, "disciplined-tdd");
  assert.deepEqual(
    registry.packs.map((pack) => pack.id),
    ["quick", "disciplined-tdd", "phase-context", "governed", "governed-v1"]
  );
  assert.deepEqual(
    registry.packs.map((pack) => pack.workflow),
    ["quick", "disciplined", "phase_context", "governed_v2", "governed"]
  );
  assert.equal(
    validateContract("method-pack-registry.schema.json", registry).valid,
    true
  );
});

test("method pack selection uses risk and real execution signals, not generic complexity", () => {
  const registry = defaultMethodPackRegistry("2026-08-20T00:00:00.000Z");
  assert.equal(resolveMethodPack(registry, intake(), inventory).pack.id, "quick");
  assert.equal(resolveMethodPack(registry, intake({
    affected_area: "src/,tests/",
    description: "A multi-step business feature with several requirements."
  }), inventory).pack.id, "disciplined-tdd");
  assert.equal(resolveMethodPack(registry, intake({
    risk: "critical"
  }), inventory).pack.id, "governed");
  assert.equal(resolveMethodPack(registry, intake({
    description: "Requires interrupted resume and parallel execution."
  }), inventory).pack.id, "governed");
});

test("explicit project method pack is pluggable but workflow remains constrained", () => {
  const registry = defaultMethodPackRegistry("2026-08-20T00:00:00.000Z");
  registry.packs.push({
    id: "team-lean",
    version: "1.0.0",
    description: "Team-specific lean workflow",
    workflow: "disciplined",
    enabled: true,
    quality_gates: ["verification", "review"]
  });
  assert.equal(resolveMethodPack(registry, intake({
    method_pack_id: "team-lean"
  }), inventory).pack.id, "team-lean");
  assert.equal(resolveMethodPack(registry, intake({
    method_pack_id: "phase-context"
  }), inventory).pack.workflow, "phase_context");
  assert.throws(() => resolveMethodPack(registry, intake({
    method_pack_id: "missing"
  }), inventory), /找不到 Method Pack/);
});
