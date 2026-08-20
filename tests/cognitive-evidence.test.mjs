import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCognitiveEvidenceSemantics,
  cognitiveEvidenceSemanticIssues
} from "../src/core/cognitive-evidence.mjs";

test("rejects copied, generic, duplicate, and contradictory claims", () => {
  const evidence = fixture();
  evidence.claims = [
    evidence.objective,
    "done",
    "cache enabled",
    "not cache enabled",
    "cache enabled"
  ];
  const issues = cognitiveEvidenceSemanticIssues(evidence);
  assert.ok(issues.some((issue) => issue.includes("copied")));
  assert.ok(issues.some((issue) => issue.includes("generic")));
  assert.ok(issues.some((issue) => issue.includes("duplicate")));
  assert.ok(issues.some((issue) => issue.includes("contradictory")));
});

test("rejects undeclared evidence refs and conflicting acceptance statuses", () => {
  const evidence = fixture();
  evidence.acceptance_mapping = [
    {
      criterion: "Tests pass",
      evidence_ref: "tests/result.json",
      status: "supported"
    },
    {
      criterion: "Tests pass",
      evidence_ref: "src/auth.ts",
      status: "unverified"
    }
  ];
  const issues = cognitiveEvidenceSemanticIssues(evidence);
  assert.ok(issues.some((issue) => issue.includes("undeclared source")));
  assert.ok(issues.some((issue) => issue.includes("conflicting acceptance")));
});

test("review cannot approve a P0 or blocking finding", () => {
  const evidence = {
    ...fixture(),
    evidence_type: "review",
    candidate_digest: "a".repeat(64),
    findings: ["P0: authorization bypass"],
    residual_risks: [],
    merge_posture: "approve"
  };
  assert.throws(
    () => assertCognitiveEvidenceSemantics(evidence),
    /cannot approve/
  );
});

test("accepts specific source-bound non-contradictory evidence", () => {
  assert.doesNotThrow(() => assertCognitiveEvidenceSemantics(fixture()));
});

function fixture() {
  return {
    schema_version: "v0",
    evidence_type: "context",
    objective: "Inspect the authentication boundary",
    source_refs: ["src/auth.ts"],
    claims: ["The request guard rejects missing authorization headers"],
    uncertainties: [],
    acceptance_mapping: [{
      criterion: "Missing authorization is rejected",
      evidence_ref: "src/auth.ts",
      status: "supported"
    }],
    affected_files: ["src/auth.ts"],
    constraints: [],
    unknowns: [],
    created_at: "2026-08-14T00:00:00.000Z"
  };
}
