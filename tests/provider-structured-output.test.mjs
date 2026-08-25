import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildWorkerAgentPrompt,
  normalizeProviderAgentResult
} from "../src/core/worker-execution.mjs";

test("provider agent-result schema stays inside the supported strict subset", () => {
  const schema = JSON.parse(readFileSync(new URL(
    "../schemas/agent-result-provider.schema.json",
    import.meta.url
  )));
  const serialized = JSON.stringify(schema);
  assert.doesNotMatch(serialized, /"\$ref"/);
  assert.doesNotMatch(serialized, /"allOf"/);
  assert.doesNotMatch(serialized, /"uniqueItems"/);
  assertRequiredProperties(schema);
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
