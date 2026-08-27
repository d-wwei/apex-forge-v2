import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  buildWorkerAgentPrompt,
  normalizeProviderAgentResult
} from "../src/core/worker-execution.mjs";

function providerValidator() {
  const schema = JSON.parse(readFileSync(new URL(
    "../schemas/agent-result-provider.schema.json",
    import.meta.url
  )));
  return new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true
  }).compile(schema);
}

test("provider agent-result schema stays inside the supported strict subset", () => {
  const schema = JSON.parse(readFileSync(new URL(
    "../schemas/agent-result-provider.schema.json",
    import.meta.url
  )));
  const serialized = JSON.stringify(schema);
  assert.doesNotMatch(serialized, /"\$ref"/);
  assert.doesNotMatch(serialized, /"allOf"/);
  assert.doesNotMatch(serialized, /"uniqueItems"/);
  assert.equal(schema.required.includes("evidence_artifact"), false);
  assertRequiredProperties(schema);
});

test("legacy provider semantic evidence uses evidence_type-specific required fields", () => {
  const validate = providerValidator();
  const common = {
    schema_version: "v0",
    objective: "Inspect the candidate",
    source_refs: ["src/value.mjs"],
    claims: ["The candidate behavior is bounded by the inspected source."],
    uncertainties: [],
    acceptance_mapping: [{
      criterion: "typed evidence",
      evidence_ref: "src/value.mjs",
      status: "supported"
    }],
    created_at: "2026-08-27T00:00:00.000Z"
  };
  const variants = {
    context: {
      ...common,
      evidence_type: "context",
      affected_files: ["src/value.mjs"],
      constraints: [],
      unknowns: []
    },
    risk: {
      ...common,
      evidence_type: "risk",
      failure_paths: ["fixture failure path"],
      blast_radius: ["src/value.mjs"],
      mitigations: ["bounded mitigation"],
      rollback: ["revert candidate"]
    },
    design: {
      ...common,
      evidence_type: "design",
      slices: ["schema", "runtime"],
      dependencies: [],
      verification: ["node --test"],
      rollback: ["revert candidate"]
    },
    review: {
      ...common,
      evidence_type: "review",
      candidate_digest: "a".repeat(64),
      findings: [],
      residual_risks: [],
      merge_posture: "approve"
    }
  };
  const base = {
    verdict: "pass",
    summary: "typed evidence",
    tests: [],
    risks: [],
    evidence_refs: ["src/value.mjs"],
    semantic_evidence: null,
    capability_evidence: []
  };

  for (const [type, semanticEvidence] of Object.entries(variants)) {
    const value = { ...base, semantic_evidence: semanticEvidence };
    assert.equal(validate(value), true, `${type}: ${JSON.stringify(validate.errors)}`);
    const invalid = structuredClone(value);
    const requiredField = {
      context: "affected_files",
      risk: "failure_paths",
      design: "slices",
      review: "candidate_digest"
    }[type];
    delete invalid.semantic_evidence[requiredField];
    assert.equal(validate(invalid), false, `${type} must require ${requiredField}`);
  }

  const capabilityCommon = {
    schema_version: "v0",
    capability_id: "test-strategy",
    capability_version: "1.0.0",
    invocation_id: "capinv-1",
    objective: "Plan tests",
    source_refs: ["src/value.mjs"],
    claims: ["The selected tests cover the changed behavior."],
    uncertainties: [],
    verification_refs: ["node --test"],
    output_contract: "test-strategy-evidence",
    created_at: "2026-08-27T00:00:00.000Z"
  };
  for (const output of [
    { output_json: "{\"test_mode\":\"targeted\"}" },
    { output: { test_mode: "targeted" } }
  ]) {
    assert.equal(
      validate({
        ...base,
        capability_evidence: [{ ...capabilityCommon, ...output }]
      }),
      true,
      JSON.stringify(validate.errors)
    );
  }

  assert.equal(
    validate({
      ...base,
      semantic_evidence: {
        ...variants.context,
        failure_paths: ["should not be accepted for context"]
      }
    }),
    false
  );
  assert.equal(validate.errors?.length > 0, true);
});

test("cognitive worker prompt states exact binding rules", () => {
  const prompt = buildWorkerAgentPrompt({
    worker_id: "worker-1",
    objective: "Review candidate",
    read_scope: ["src/value.mjs"],
    write_scope: [],
    verification: ["node --test"],
    capability_bindings: [],
    capability_invocation_refs: []
  }, {
    objective: "Review candidate",
    deliverables: ["review"],
    required_evidence: ["evidence"],
    capability_bindings: []
  }, {
    semanticEvidenceType: "review",
    candidateDigest: "a".repeat(64),
    allowedEvidenceRefs: ["src/value.mjs", "tests/value.test.mjs"]
  });
  assert.match(prompt, /objective.*exactly/i);
  assert.match(prompt, /candidate_digest.*exactly/i);
  assert.match(prompt, /acceptance_mapping.*evidence_ref.*source_refs.*exactly/i);
  assert.match(prompt, /src\/value\.mjs/);
  assert.match(prompt, /verdict to "pass".*analysis.*complete/i);
  assert.match(prompt, /merge_posture/);
});

test("provider-only semantic fields are removed before canonical validation", () => {
  const value = normalizeProviderAgentResult({
    verdict: "pass",
    summary: "context",
    tests: [],
    risks: [],
    evidence_refs: [],
    capability_evidence: [],
    semantic_evidence: {
      schema_version: "v0",
      evidence_type: "context",
      objective: "Inspect context",
      source_refs: ["src/value.mjs"],
      claims: ["The source file defines the behavior."],
      uncertainties: [],
      acceptance_mapping: [{
        criterion: "Behavior is identified.",
        evidence_ref: "src/value.mjs",
        status: "supported"
      }],
      affected_files: ["src/value.mjs"],
      constraints: [],
      unknowns: [],
      failure_paths: [],
      blast_radius: [],
      mitigations: [],
      rollback: [],
      slices: [],
      dependencies: [],
      verification: [],
      candidate_digest: "not-applicable",
      findings: [],
      residual_risks: [],
      merge_posture: "block",
      created_at: "2026-08-25T00:00:00.000Z"
    }
  });
  assert.deepEqual(Object.keys(value.semantic_evidence).sort(), [
    "acceptance_mapping",
    "affected_files",
    "claims",
    "constraints",
    "created_at",
    "evidence_type",
    "objective",
    "schema_version",
    "source_refs",
    "uncertainties",
    "unknowns"
  ]);
});

test("legacy provider capability output_json is restored before canonical validation", () => {
  const value = normalizeProviderAgentResult({
    verdict: "pass",
    summary: "typed output",
    tests: [],
    risks: [],
    evidence_refs: ["src/value.mjs"],
    semantic_evidence: null,
    capability_evidence: [{
      schema_version: "v0",
      capability_id: "test-strategy",
      capability_version: "1.0.0",
      invocation_id: "capinv-1",
      objective: "Plan tests",
      source_refs: ["src/value.mjs"],
      claims: ["Tests cover the changed behavior."],
      uncertainties: [],
      verification_refs: ["node --test"],
      output_contract: "test-strategy-evidence",
      output_json: "{\"test_mode\":\"targeted\"}",
      created_at: "2026-08-27T00:00:00.000Z"
    }]
  });
  assert.deepEqual(value.capability_evidence[0].output, {
    test_mode: "targeted"
  });
  assert.equal("output_json" in value.capability_evidence[0], false);
});

test("legacy provider capability accepts direct typed output", () => {
  const value = normalizeProviderAgentResult({
    verdict: "pass",
    summary: "typed output",
    tests: [],
    risks: [],
    evidence_refs: ["src/value.mjs"],
    semantic_evidence: null,
    capability_evidence: [{
      schema_version: "v0",
      capability_id: "test-strategy",
      capability_version: "1.0.0",
      invocation_id: "capinv-1",
      objective: "Plan tests",
      source_refs: ["src/value.mjs"],
      claims: ["Tests cover the changed behavior."],
      uncertainties: [],
      verification_refs: ["node --test"],
      output_contract: "test-strategy-evidence",
      output: { test_mode: "targeted" },
      created_at: "2026-08-27T00:00:00.000Z"
    }]
  });
  assert.deepEqual(value.capability_evidence[0].output, {
    test_mode: "targeted"
  });
  assert.equal("output_json" in value.capability_evidence[0], false);
});

function assertRequiredProperties(schema) {
  if (!schema || typeof schema !== "object") return;
  if (
    schema.type === "object"
    && schema.properties
    && schema.additionalProperties === false
  ) {
    assert.deepEqual(
      [...(schema.required || [])].sort(),
      Object.keys(schema.properties).sort()
    );
  }
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) value.forEach(assertRequiredProperties);
    else assertRequiredProperties(value);
  }
}
