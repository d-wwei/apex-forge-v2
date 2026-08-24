import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCapabilityEvidenceForBindings
} from "../src/core/capability-evidence.mjs";

const bindings = [
  {
    capability_id: "systematic-debugging",
    capability_version: "1.0.0",
    mode: "required",
    required: true,
    output_contract: "root-cause-evidence"
  },
  {
    capability_id: "frontend-design",
    capability_version: "1.0.0",
    mode: "optional",
    required: false,
    output_contract: "frontend-design-evidence"
  }
];

test("required capability evidence is versioned, typed, and output-complete", () => {
  const evidence = validateCapabilityEvidenceForBindings(bindings, [
    debuggingEvidence()
  ]);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].capability_id, "systematic-debugging");
});

test("missing required capability evidence fails closed while optional evidence may be absent", () => {
  assert.throws(
    () => validateCapabilityEvidenceForBindings(bindings, []),
    /缺少 required capability evidence/
  );
});

test("capability evidence rejects version, contract, and output drift", () => {
  const wrongVersion = debuggingEvidence();
  wrongVersion.capability_version = "2.0.0";
  assert.throws(
    () => validateCapabilityEvidenceForBindings(bindings, [wrongVersion]),
    /version 不匹配/
  );

  const wrongContract = debuggingEvidence();
  wrongContract.output_contract = "engineering-spec-evidence";
  assert.throws(
    () => validateCapabilityEvidenceForBindings(bindings, [wrongContract]),
    /output contract 不匹配/
  );

  const incomplete = debuggingEvidence();
  delete incomplete.output.confirmed_root_cause;
  assert.throws(
    () => validateCapabilityEvidenceForBindings(bindings, [incomplete]),
    /缺少 output 字段.*confirmed_root_cause/
  );

  const wrongType = debuggingEvidence();
  wrongType.output.hypotheses = "parser is wrong";
  assert.throws(
    () => validateCapabilityEvidenceForBindings(bindings, [wrongType]),
    /contract validation failed.*root-cause-evidence/
  );
});

test("unknown or duplicate capability evidence is rejected", () => {
  const unknown = debuggingEvidence();
  unknown.capability_id = "unknown-capability";
  assert.throws(
    () => validateCapabilityEvidenceForBindings(bindings, [unknown]),
    /未绑定/
  );
  assert.throws(
    () => validateCapabilityEvidenceForBindings(
      bindings,
      [debuggingEvidence(), debuggingEvidence()]
    ),
    /重复/
  );
});

function debuggingEvidence() {
  return {
    schema_version: "v0",
    capability_id: "systematic-debugging",
    capability_version: "1.0.0",
    invocation_id: "capinv-debug-1",
    objective: "Find the parser regression root cause",
    source_refs: ["src/parser.mjs", "tests/parser.test.mjs"],
    claims: ["The escape branch drops the delimiter before tokenization"],
    uncertainties: [],
    verification_refs: ["node --test tests/parser.test.mjs"],
    output_contract: "root-cause-evidence",
    output: {
      reproduction: "node --test tests/parser.test.mjs",
      observed_failure: "escaped delimiter is missing",
      failure_signature: "expected delimiter",
      data_flow: ["input", "escape parser", "tokenizer"],
      hypotheses: ["escape branch mutates input", "tokenizer drops token", "fixture is stale"],
      experiments: ["trace escape output", "bypass tokenizer", "compare fixture"],
      confirmed_root_cause: "escape branch slices one extra character",
      affected_scope: ["src/parser.mjs"],
      fix_constraints: ["preserve unescaped behavior"],
      regression_target: "tests/parser.test.mjs"
    },
    created_at: "2026-08-21T00:00:00.000Z"
  };
}
