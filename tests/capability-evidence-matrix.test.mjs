import test from "node:test";
import assert from "node:assert/strict";
import {
  capabilityRegistry
} from "../src/core/capability-registry.mjs";
import {
  validateCapabilityEvidenceForBindings
} from "../src/core/capability-evidence.mjs";
import {
  CAPABILITY_FIXTURES,
  CURRENT_CANDIDATE_DIGEST,
  STALE_CANDIDATE_DIGEST,
  buildEvidenceCases
} from "./fixtures/capabilities/matrix-fixtures.mjs";

const registry = capabilityRegistry();
const evidenceCases = buildEvidenceCases();

test("evidence matrix declares exactly 21 capabilities and 168 explicit cases", () => {
  assert.equal(CAPABILITY_FIXTURES.length, 21);
  assert.equal(evidenceCases.length, 168);
  assert.equal(new Set(evidenceCases.map((item) => item.case_id)).size, 168);
  assert.ok(evidenceCases.length >= 147);
});

for (const matrixCase of evidenceCases) {
  test(`evidence matrix: ${matrixCase.case_id}`, () => {
    const binding = bindingFor(matrixCase.capability_id);
    const evidence = evidenceFor(matrixCase, binding);
    const validate = () => validateCapabilityEvidenceForBindings(
      [binding],
      [evidence],
      {
        enforceRequired: true,
        declaredEvidenceRefs: ["src/value.mjs", "fixture verification"],
        expectedCandidateDigest: CURRENT_CANDIDATE_DIGEST
      }
    );

    if (matrixCase.kind === "valid") {
      assert.doesNotThrow(validate);
      return;
    }

    if (matrixCase.kind === "missing-required-field") {
      delete evidence.output[matrixCase.required_field];
      assert.throws(validate, /缺少 output 字段/);
      return;
    }

    if (matrixCase.kind === "wrong-version") {
      evidence.capability_version = "999.0.0";
      assert.throws(validate, /version 不匹配/);
      return;
    }

    if (matrixCase.kind === "wrong-contract") {
      evidence.output_contract = alternateContract(binding.output_contract);
      assert.throws(validate, /output contract 不匹配/);
      return;
    }

    if (matrixCase.kind === "generic-claim") {
      evidence.claims = ["done"];
      assert.throws(validate, /generic|copied|语义无效/i);
      return;
    }

    if (matrixCase.kind === "undeclared-evidence-ref") {
      evidence.verification_refs = ["artifacts/undeclared-evidence.json"];
      assert.throws(validate, /undeclared|未声明|语义无效/i);
      return;
    }

    if (matrixCase.kind === "contradiction") {
      evidence.claims = ["cache enabled", "not cache enabled"];
      assert.throws(validate, /contradict|冲突|语义无效/i);
      return;
    }

    if (matrixCase.kind === "stale-candidate") {
      evidence.output.candidate_digest = STALE_CANDIDATE_DIGEST;
      assert.throws(validate, /candidate|stale|过期|不匹配/i);
      return;
    }

    assert.fail(`unknown evidence matrix kind: ${matrixCase.kind}`);
  });
}

function bindingFor(capabilityId) {
  const definition = registry.capabilities.find(
    (item) => item.capability_id === capabilityId
  );
  assert.ok(definition, capabilityId);
  return {
    capability_id: capabilityId,
    capability_version: definition.version,
    mode: "required",
    required: true,
    output_contract: definition.output_contract
  };
}

function evidenceFor(matrixCase, binding) {
  return {
    schema_version: "v0",
    capability_id: binding.capability_id,
    capability_version: binding.capability_version,
    invocation_id: `capinv-matrix-${binding.capability_id}-${matrixCase.kind}`,
    objective: `Validate ${binding.capability_id} behavior`,
    source_refs: ["src/value.mjs"],
    claims: [`${binding.capability_id} produced source-bound evidence`],
    uncertainties: [],
    verification_refs: ["fixture verification"],
    output_contract: binding.output_contract,
    output: structuredClone(matrixCase.valid_output),
    created_at: "2026-08-21T00:00:00.000Z"
  };
}

function alternateContract(current) {
  return current === "engineering-spec-evidence"
    ? "root-cause-evidence"
    : "engineering-spec-evidence";
}
