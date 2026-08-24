import test from "node:test";
import assert from "node:assert/strict";
import {
  capabilityRegistry,
  routeCapabilities,
  validateCapabilityRegistry
} from "../src/core/capability-registry.mjs";
import {
  validateCapabilityEvidenceForBindings
} from "../src/core/capability-evidence.mjs";
import { applyCapabilityBindings } from "../src/core/plan-graph.mjs";
import {
  CAPABILITY_FIXTURES,
  buildRoutingCases
} from "./fixtures/capabilities/matrix-fixtures.mjs";

const registry = capabilityRegistry();
const routingCases = buildRoutingCases();
const planNodes = [
  node("delivery-design"),
  node("delivery-implementation"),
  node("delivery-verification"),
  node("delivery-review")
];

test("routing matrix declares exactly 21 capabilities and 105 explicit cases", () => {
  assert.equal(CAPABILITY_FIXTURES.length, 21);
  assert.equal(routingCases.length, 105);
  assert.deepEqual(
    CAPABILITY_FIXTURES.map((item) => item.capabilityId),
    registry.capabilities.map((item) => item.capability_id)
  );
  assert.equal(new Set(routingCases.map((item) => item.case_id)).size, 105);
});

for (const matrixCase of routingCases) {
  test(`routing matrix: ${matrixCase.case_id}`, () => {
    if (matrixCase.kind === "missing-capability") {
      const incomplete = structuredClone(registry);
      incomplete.capabilities = incomplete.capabilities.filter(
        (item) => item.capability_id !== matrixCase.capability_id
      );
      assert.throws(
        () => validateCapabilityRegistry(incomplete),
        /引用未知能力/
      );
      return;
    }

    const routed = routeCapabilities(registry, matrixCase.intake);
    const selected = flatten(routed);
    const selectedIds = selected.map((item) => item.capability_id);

    if (matrixCase.kind === "positive") {
      assert.ok(selectedIds.includes(matrixCase.capability_id));
      assert.equal(
        selectedIds.filter((id) => id === matrixCase.capability_id).length,
        1
      );
      return;
    }

    if (matrixCase.kind === "negative") {
      assert.ok(!selectedIds.includes(matrixCase.capability_id));
      return;
    }

    if (matrixCase.kind === "combination") {
      assert.ok(selectedIds.includes(matrixCase.capability_id));
      assert.ok(selectedIds.includes(matrixCase.companion_id));
      assert.equal(new Set(selectedIds).size, selectedIds.length);

      const repeatedIds = flatten(
        routeCapabilities(registry, matrixCase.intake)
      ).map((item) => item.capability_id);
      assert.deepEqual(repeatedIds, selectedIds);

      const applied = applyCapabilityBindings(planNodes, routed);
      assertBindingOnDeclaredNode(applied.nodes, selected, matrixCase.capability_id);
      assertBindingOnDeclaredNode(applied.nodes, selected, matrixCase.companion_id);
      return;
    }

    if (matrixCase.kind === "optional-skip") {
      const binding = selected.find(
        (item) => item.capability_id === matrixCase.capability_id
      );
      assert.ok(binding);
      if (binding.required) {
        assert.throws(
          () => validateCapabilityEvidenceForBindings(
            [binding],
            [],
            { enforceRequired: true }
          ),
          /缺少 required capability evidence/
        );
      } else {
        assert.doesNotThrow(
          () => validateCapabilityEvidenceForBindings(
            [binding],
            [],
            { enforceRequired: true }
          )
        );
      }
      return;
    }

    assert.fail(`unknown routing matrix kind: ${matrixCase.kind}`);
  });
}

function flatten(routed) {
  return [
    ...routed.required,
    ...routed.optional,
    ...routed.advisory
  ];
}

function node(id) {
  return {
    id,
    required_evidence: ["base-evidence"]
  };
}

function assertBindingOnDeclaredNode(nodes, selected, capabilityId) {
  const binding = selected.find((item) => item.capability_id === capabilityId);
  assert.ok(binding, capabilityId);
  const target = nodes.find((item) => item.id === binding.target_node_id);
  assert.ok(target, `${capabilityId}:${binding.target_node_id}`);
  assert.equal(
    target.capability_bindings.filter(
      (item) => item.capability_id === capabilityId
    ).length,
    1
  );
}
