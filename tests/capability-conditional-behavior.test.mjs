import test from "node:test";
import assert from "node:assert/strict";
import {
  capabilityRegistry,
  routeCapabilities
} from "../src/core/capability-registry.mjs";
import {
  validateCapabilityEvidenceForBindings
} from "../src/core/capability-evidence.mjs";

const registry = capabilityRegistry();
const digest = "b".repeat(64);

const cases = [
  ["frontend-design", {
    brief: { audience: "developers" },
    information_architecture: ["dashboard"],
    selected_direction: "editorial utility",
    design_tokens: { color: "neutral" },
    layout_spec: { pages: ["home"] },
    responsive_rules: ["collapse sidebar"],
    interaction_states: ["loading", "empty", "error"],
    acceptance: ["desktop and mobile layouts are explicit"]
  }],
  ["design-to-code", {
    design_artifact_ref: ".design/layout-spec.yaml",
    implementation_spec: { page: "home" },
    component_map: { header: "AppHeader" },
    changed_files: ["src/home.tsx"],
    acceptance_checklist: ["responsive"],
    fidelity_findings: []
  }],
  ["browser-qa", {
    url: "http://127.0.0.1:3000",
    browser_provider: "fixture-chromium",
    viewport: { width: 1280, height: 800 },
    user_flows: ["open dashboard"],
    screenshots: ["artifacts/dashboard.png"],
    console_errors: [],
    network_errors: [],
    behavior_results: [{ flow: "open dashboard", status: "PASS" }]
  }],
  ["mobile-qa", {
    platform: "ios",
    device: "iPhone 16",
    os_version: "18",
    app_artifact: "build/App.app",
    flows: ["launch"],
    screenshots_or_video: ["artifacts/ios.png"],
    crashes: [],
    logs: [],
    cleanup: "simulator shutdown"
  }],
  ["performance-validation", {
    metric: "startup_ms",
    baseline: { median: 100 },
    candidate: { median: 95 },
    environment_fingerprint: "node26-macos-arm64",
    sample_count: 5,
    distribution: [94, 95, 95, 96, 97],
    threshold: { max_regression_percent: 5 },
    verdict: "PASS"
  }],
  ["migration-safety", {
    source_version: "v0",
    target_version: "v1",
    preconditions: ["backup ready"],
    dry_run: { status: "PASS" },
    backup: "snapshot-1",
    forward_steps: ["migrate"],
    rollback_steps: ["restore snapshot"],
    idempotency: "second run no-op",
    replay_or_reconcile: "CONSISTENT",
    data_diff: []
  }],
  ["deploy-release", {
    candidate_digest: digest,
    environment: "staging",
    approval: "approval-1",
    deployment_id: "deploy-1",
    started_at: "2026-08-21T00:00:00.000Z",
    completed_at: "2026-08-21T00:01:00.000Z",
    health_checks: [{ status: "PASS" }],
    canary_results: [{ status: "PASS" }],
    rollback_token: "rollback-1"
  }],
  ["project-audit", {
    objective: "release readiness",
    commitments: ["candidate verified"],
    checks: [{ id: "candidate", status: "PASS" }],
    findings: [],
    coverage: 1,
    confidence: "high",
    unverified_items: [],
    release_posture: "PASS"
  }],
  ["postmortem", {
    impact: "one failed run",
    timeline: ["failure", "detection"],
    detection_gap: "missing real-entry test",
    root_causes: ["test bypassed loader"],
    failed_controls: ["unit tests"],
    corrective_actions: ["add loader test"],
    control_candidates: ["real-entry gate"],
    owners: ["kernel"],
    verification: "old implementation fails new gate"
  }],
  ["simplification", {
    candidates: ["unused export"],
    consumer_evidence: ["no production import"],
    deletion_plan: ["remove export"],
    risk: "low",
    verification_plan: ["npm test"],
    estimated_savings: { lines: 20 },
    actual_savings: null,
    decision: "delete"
  }]
];

test("all conditional and evolution capabilities accept complete evidence", () => {
  for (const [capabilityId, output] of cases) {
    const binding = bindingFor(capabilityId);
    assert.doesNotThrow(() =>
      validateCapabilityEvidenceForBindings(
        [binding],
        [evidenceFor(binding, output)]
      )
    , capabilityId);
  }
});

test("conditional and evolution routing covers their declared signals", () => {
  const routingCases = [
    ["frontend-design", "Build a frontend design system"],
    ["design-to-code", "Implement Figma design-to-code"],
    ["browser-qa", "Run browser DOM and console acceptance"],
    ["mobile-qa", "Test the iOS mobile app"],
    ["performance-validation", "Measure startup performance latency"],
    ["migration-safety", "Run database migration and backfill"],
    ["deploy-release", "Deploy release to production"],
    ["project-audit", "Run a pre-release audit"],
    ["postmortem", "Write incident postmortem"],
    ["simplification", "Simplify unused duplicate code"]
  ];
  for (const [capabilityId, title] of routingCases) {
    const routed = routeCapabilities(registry, {
      type: capabilityId === "simplification" ? "tech_debt" : "other",
      risk: "medium",
      title,
      description: title,
      affected_area: "src/value.mjs"
    });
    assert.ok(
      [...routed.required, ...routed.optional, ...routed.advisory]
        .some((item) => item.capability_id === capabilityId),
      capabilityId
    );
  }
});

test("environment and evolution capabilities reject weak evidence", () => {
  assertInvalid("browser-qa", {
    ...outputFor("browser-qa"),
    screenshots: []
  }, /screenshots/);
  assertInvalid("mobile-qa", {
    ...outputFor("mobile-qa"),
    cleanup: ""
  }, /cleanup/);
  assertInvalid("performance-validation", {
    ...outputFor("performance-validation"),
    sample_count: 1
  }, /sample_count/);
  assertInvalid("migration-safety", {
    ...outputFor("migration-safety"),
    rollback_steps: []
  }, /rollback_steps/);
  assertInvalid("deploy-release", {
    ...outputFor("deploy-release"),
    candidate_digest: "stale"
  }, /candidate_digest/);
  assertInvalid("postmortem", {
    ...outputFor("postmortem"),
    control_candidates: []
  }, /control_candidates/);
  const missingSavings = outputFor("simplification");
  delete missingSavings.actual_savings;
  assertInvalid("simplification", missingSavings, /actual_savings/);
});

function bindingFor(capabilityId) {
  const definition = registry.capabilities.find((item) =>
    item.capability_id === capabilityId
  );
  return {
    capability_id: capabilityId,
    capability_version: definition.version,
    mode: "required",
    required: true,
    output_contract: definition.output_contract
  };
}

function evidenceFor(binding, output) {
  return {
    schema_version: "v0",
    capability_id: binding.capability_id,
    capability_version: binding.capability_version,
    invocation_id: `capinv-${binding.capability_id}`,
    objective: `Validate ${binding.capability_id}`,
    source_refs: ["src/value.mjs"],
    claims: [`${binding.capability_id} produced direct evidence`],
    uncertainties: [],
    verification_refs: ["fixture verification"],
    output_contract: binding.output_contract,
    output,
    created_at: "2026-08-21T00:00:00.000Z"
  };
}

function outputFor(capabilityId) {
  return structuredClone(cases.find(([id]) => id === capabilityId)[1]);
}

function assertInvalid(capabilityId, output, pattern) {
  const binding = bindingFor(capabilityId);
  assert.throws(
    () => validateCapabilityEvidenceForBindings(
      [binding],
      [evidenceFor(binding, output)]
    ),
    pattern
  );
}
