import test from "node:test";
import assert from "node:assert/strict";
import { capabilityRegistry } from "../src/core/capability-registry.mjs";
import {
  validateCapabilityEvidenceForBindings
} from "../src/core/capability-evidence.mjs";
import {
  CAPABILITY_FIXTURES,
  CURRENT_CANDIDATE_DIGEST,
  STALE_CANDIDATE_DIGEST
} from "./fixtures/capabilities/matrix-fixtures.mjs";

const registry = capabilityRegistry();

test("Debug and TDD gates cover parser, concurrency, and configuration defects", () => {
  for (const [id, rootCause] of [
    ["parser", "The escape parser removes one extra delimiter character."],
    ["concurrency", "The refresh path publishes stale state before the lock commits."],
    ["configuration", "The configuration cache ignores the environment revision key."]
  ]) {
    const debug = outputFor("systematic-debugging");
    debug.reproduction = `node --test tests/${id}.test.mjs`;
    debug.failure_signature = `${id}-failure-signature`;
    debug.confirmed_root_cause = rootCause;
    assertValid("systematic-debugging", debug);
    debug.confirmed_root_cause = "unknown";
    assertInvalid("systematic-debugging", debug, /root_cause/);

    const control = outputFor("tdd-negative-control");
    control.test_entry = `tests/${id}.test.mjs`;
    control.red_command = `node --test tests/${id}.test.mjs`;
    control.green_command = `node --test tests/${id}.test.mjs`;
    assertValid("tdd-negative-control", control);
    control.green_command = "node --test tests/unrelated.test.mjs";
    assertInvalid("tdd-negative-control", control, /同一 test_entry/);
  }
});

test("Review, Security, and High Risk gates recall hidden P0/P1 findings", () => {
  for (const kind of ["secret", "path-traversal", "authorization"]) {
    const review = outputFor("code-review");
    review.findings = [{ kind, severity: "P0", blocking: true }];
    review.merge_posture = "approve";
    assertInvalid("code-review", review, /不能 approve/);

    const security = outputFor("security-audit");
    security.findings = [{ kind, severity: "high", blocking: true }];
    security.merge_posture = "approve";
    assertInvalid("security-audit", security, /不能 approve/);
  }

  const highRisk = outputFor("high-risk-review");
  highRisk.adversarial_cases = [];
  assertInvalid("high-risk-review", highRisk, /adversarial_cases/);
});

test("Spec, architecture, and test strategy reject contradictory shallow plans", () => {
  const spec = outputFor("engineering-spec");
  spec.out_of_scope = [spec.in_scope[0]];
  assertInvalid("engineering-spec", spec, /scope contradiction/);

  const grounding = outputFor("source-grounding");
  grounding.conflicts = [grounding.verified_claims[0]];
  assertInvalid("source-grounding", grounding, /conflicts with source evidence/);

  const architecture = outputFor("architecture-design");
  architecture.selected_design = "third undeclared option";
  assertInvalid("architecture-design", architecture, /selected_design/);

  const strategy = outputFor("test-strategy");
  strategy.affected_surfaces = ["authorization"];
  strategy.selected_test_groups = ["smoke"];
  assertInvalid("test-strategy", strategy, /不能只选择 smoke/);
});

test("Browser and Mobile evidence cannot claim PASS over visible failures", () => {
  for (const mutation of [
    (output) => { output.behavior_results = [{ status: "FAIL" }]; },
    (output) => { output.console_errors = ["TypeError in dashboard"]; },
    (output) => { output.network_errors = ["GET /api returned 500"]; }
  ]) {
    const output = outputFor("browser-qa");
    mutation(output);
    assertInvalid(
      "browser-qa",
      output,
      /Browser PASS/,
      ["Browser QA passed all declared flows."]
    );
  }

  const mobile = outputFor("mobile-qa");
  mobile.crashes = ["SIGABRT on launch"];
  assertInvalid(
    "mobile-qa",
    mobile,
    /Mobile PASS/,
    ["Mobile QA passed on the declared device."]
  );
});

test("Performance, Migration, and Deploy reject drift, partial success, and stale candidates", () => {
  const performance = outputFor("performance-validation");
  assertInvalid(
    "performance-validation",
    performance,
    /environment fingerprint drift/,
    undefined,
    { expectedEnvironmentFingerprint: "linux-x64-node26" }
  );

  const migrationDryRun = outputFor("migration-safety");
  migrationDryRun.dry_run = { status: "FAIL" };
  assertInvalid(
    "migration-safety",
    migrationDryRun,
    /Migration PASS/,
    ["Migration passed and is safe to release."]
  );

  const migrationReconcile = outputFor("migration-safety");
  migrationReconcile.replay_or_reconcile = "INCONSISTENT";
  assertInvalid(
    "migration-safety",
    migrationReconcile,
    /Migration PASS/,
    ["Migration passed and is safe to release."]
  );

  for (const field of ["health_checks", "canary_results"]) {
    const deploy = outputFor("deploy-release");
    deploy[field] = [{ status: "FAIL" }];
    assertInvalid(
      "deploy-release",
      deploy,
      /Deploy PASS/,
      ["Deployment passed all release checks."]
    );
  }

  const stale = outputFor("deploy-release");
  stale.candidate_digest = STALE_CANDIDATE_DIGEST;
  assertInvalid(
    "deploy-release",
    stale,
    /candidate digest stale/,
    undefined,
    { expectedCandidateDigest: CURRENT_CANDIDATE_DIGEST }
  );
});

test("Audit, Postmortem, and Simplification reject false closure", () => {
  const auditFailure = outputFor("project-audit");
  auditFailure.checks = [{ id: "tests", status: "FAIL" }];
  assertInvalid("project-audit", auditFailure, /Audit PASS/);

  const auditGap = outputFor("project-audit");
  auditGap.coverage = 0.8;
  auditGap.unverified_items = ["mobile runtime"];
  assertInvalid("project-audit", auditGap, /Audit PASS/);

  const postmortem = outputFor("postmortem");
  postmortem.control_candidates = [];
  assertInvalid("postmortem", postmortem, /control_candidates/);

  const simplification = outputFor("simplification");
  simplification.consumer_evidence = ["production import exists"];
  simplification.decision = "delete";
  assertInvalid("simplification", simplification, /真实 consumer/);
});

function outputFor(capabilityId) {
  return structuredClone(
    CAPABILITY_FIXTURES.find((item) => item.capabilityId === capabilityId)
      .validOutput
  );
}

function bindingFor(capabilityId) {
  const definition = registry.capabilities.find((item) =>
    item.capability_id === capabilityId
  );
  return {
    capability_id: capabilityId,
    capability_version: definition.version,
    mode: "required",
    required: true,
    input_contract: definition.input_contract,
    output_contract: definition.output_contract
  };
}

function evidenceFor(capabilityId, output, claims) {
  const binding = bindingFor(capabilityId);
  return {
    schema_version: "v0",
    capability_id: capabilityId,
    capability_version: binding.capability_version,
    invocation_id: `capinv-effectiveness-${capabilityId}`,
    objective: `Effectiveness fixture for ${capabilityId}`,
    source_refs: ["src/value.mjs"],
    claims: claims || [`${capabilityId} produced source-bound evidence`],
    uncertainties: [],
    verification_refs: ["fixture verification"],
    output_contract: binding.output_contract,
    output,
    created_at: "2026-08-21T00:00:00.000Z"
  };
}

function assertValid(capabilityId, output, claims, options = {}) {
  const binding = bindingFor(capabilityId);
  assert.doesNotThrow(() =>
    validateCapabilityEvidenceForBindings(
      [binding],
      [evidenceFor(capabilityId, output, claims)],
      {
        declaredEvidenceRefs: ["src/value.mjs", "fixture verification"],
        ...options
      }
    )
  );
}

function assertInvalid(
  capabilityId,
  output,
  pattern,
  claims,
  options = {}
) {
  const binding = bindingFor(capabilityId);
  assert.throws(
    () => validateCapabilityEvidenceForBindings(
      [binding],
      [evidenceFor(capabilityId, output, claims)],
      {
        declaredEvidenceRefs: ["src/value.mjs", "fixture verification"],
        ...options
      }
    ),
    pattern
  );
}
