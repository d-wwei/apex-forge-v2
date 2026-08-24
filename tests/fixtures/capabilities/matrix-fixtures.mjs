export const CURRENT_CANDIDATE_DIGEST = "c".repeat(64);
export const STALE_CANDIDATE_DIGEST = "d".repeat(64);

const neutralIntake = {
  type: "other",
  risk: "low",
  title: "Rename an internal variable",
  description: "Local cleanup with no external behavior change.",
  affected_area: "src/value.mjs"
};

export const CAPABILITY_FIXTURES = [
  fixture("engineering-spec", "engineering-spec-evidence", "objective", {
    objective: "Implement bounded behavior",
    in_scope: ["src/value.mjs"],
    out_of_scope: ["deployment"],
    acceptance: ["returns the new value"],
    assumptions: [],
    open_questions: [],
    verification_plan: ["node --test tests/value.test.mjs"]
  }, {
    positive: intake({ type: "idea", title: "Explore parser caching" }),
    combination: combo(
      { type: "feature", title: "Add parser caching" },
      "code-review"
    )
  }),
  fixture("source-grounding", "source-grounding-evidence", "detected_version", {
    detected_version: "1.0.0",
    authoritative_sources: ["schemas/value.schema.json"],
    verified_claims: ["value is an integer"],
    conflicts: [],
    unverified_assumptions: []
  }, {
    positive: intake({ title: "Update the official SDK API" }),
    combination: combo(
      { title: "Update official CLI help", affected_area: "README.md" },
      "documentation-sync"
    )
  }),
  fixture("architecture-design", "architecture-design-evidence", "problem", {
    problem: "share one durable state",
    constraints: ["single writer"],
    alternatives: ["event log", "mutable cache"],
    selected_design: "event log",
    state_ownership: { project: "Kernel" },
    failure_modes: ["partial write"],
    rollback: ["restore journal"],
    verification: ["reconcile"]
  }, {
    positive: intake({ title: "Design a state machine architecture" }),
    combination: combo(
      { risk: "high", title: "Review durable state ownership" },
      "high-risk-review"
    )
  }),
  fixture("systematic-debugging", "root-cause-evidence", "reproduction", {
    reproduction: "node --test tests/parser.test.mjs",
    observed_failure: "delimiter missing",
    failure_signature: "expected delimiter",
    data_flow: ["input", "parser", "tokenizer"],
    hypotheses: ["parser slices input", "tokenizer drops token", "fixture stale"],
    experiments: ["trace parser output"],
    confirmed_root_cause: "The parser slices one extra escaped character.",
    affected_scope: ["src/parser.mjs"],
    fix_constraints: ["preserve normal delimiters"],
    regression_target: "tests/parser.test.mjs"
  }, {
    positive: intake({ type: "bug", title: "Parser drops escaped delimiters" }),
    combination: combo(
      { type: "bug", title: "Fix parser behavior regression" },
      "tdd-negative-control"
    )
  }),
  fixture("tdd-negative-control", "negative-control-evidence", "test_entry", {
    test_entry: "tests/parser.test.mjs",
    fault_model: "restore old slice",
    red_command: "node --test tests/parser.test.mjs",
    red_signature: "expected delimiter",
    green_command: "node --test tests/parser.test.mjs",
    green_result: "PASS",
    restoration_result: "mutation removed"
  }, {
    positive: intake({ type: "review_feedback", title: "Protect changed behavior" }),
    combination: combo(
      { type: "feature", title: "Add parser behavior" },
      "test-strategy"
    )
  }),
  fixture("incremental-delivery", "incremental-plan-evidence", "slices", {
    slices: ["schema", "runtime"],
    slice_dependencies: { runtime: ["schema"] },
    write_scopes: { schema: ["schemas/"], runtime: ["src/"] },
    verification_per_slice: { schema: ["check"], runtime: ["test"] }
  }, {
    positive: intake({ title: "Cross-module refactor" }),
    combination: combo(
      { type: "tech_debt", title: "Cross-module refactor" },
      "code-review"
    )
  }),
  fixture("code-review", "code-review-evidence", "candidate_digest", {
    candidate_digest: CURRENT_CANDIDATE_DIGEST,
    findings: [],
    residual_risks: [],
    merge_posture: "approve"
  }, {
    positive: intake({ type: "risk", title: "Review candidate behavior" }),
    combination: combo(
      { type: "tech_debt", title: "Review refactor candidate" },
      "test-strategy"
    )
  }),
  fixture("security-audit", "security-audit-evidence", "scope", {
    scope: ["src/auth.mjs"],
    threat_model: ["token theft"],
    findings: [],
    residual_risks: [],
    merge_posture: "approve"
  }, {
    positive: intake({ title: "Audit authorization token handling" }),
    combination: combo(
      { type: "feature", title: "Add authorization token handling" },
      "code-review"
    )
  }),
  fixture("high-risk-review", "high-risk-evidence", "safety_claim", {
    safety_claim: "migration is reversible",
    assumptions: ["backup exists"],
    adversarial_cases: ["kill during write"],
    blast_radius: ["project state"],
    rollback: ["restore backup"],
    residual_risks: []
  }, {
    positive: intake({ title: "Perform an irreversible migration" }),
    combination: combo(
      { risk: "high", title: "Review durable state change" },
      "architecture-design"
    )
  }),
  fixture("test-strategy", "test-strategy-evidence", "test_mode", {
    test_mode: "targeted",
    affected_surfaces: ["parser"],
    selected_test_groups: ["parser-regression"],
    excluded_groups: ["browser"],
    selection_rationale: "Only parser behavior changed.",
    stop_conditions: ["targeted failure"]
  }, {
    positive: intake({ type: "tech_debt", title: "Adjust parser internals" }),
    combination: combo(
      { type: "feature", title: "Add parser behavior" },
      "code-review"
    )
  }),
  fixture("documentation-sync", "documentation-sync-evidence", "changed_behavior", {
    changed_behavior: ["CLI flag"],
    affected_docs: ["README.md", "docs/cli.md"],
    updated_docs: ["README.md"],
    intentionally_unchanged: ["docs/cli.md"],
    stale_refs: [],
    verification: ["run help"]
  }, {
    positive: intake({ title: "Update README documentation", affected_area: "README.md" }),
    combination: combo(
      { title: "Update official CLI help", affected_area: "README.md" },
      "source-grounding"
    )
  }),
  fixture("frontend-design", "frontend-design-evidence", "brief", {
    brief: { audience: "developers" },
    information_architecture: ["dashboard"],
    selected_direction: "editorial utility",
    design_tokens: { color: "neutral" },
    layout_spec: { pages: ["home"] },
    responsive_rules: ["collapse sidebar"],
    interaction_states: ["loading", "empty", "error"],
    acceptance: ["desktop and mobile layouts are explicit"]
  }, {
    positive: intake({ title: "Create a frontend visual layout" }),
    combination: combo(
      { title: "Validate responsive frontend in browser" },
      "browser-qa"
    )
  }),
  fixture("design-to-code", "design-to-code-evidence", "design_artifact_ref", {
    design_artifact_ref: ".design/layout-spec.yaml",
    implementation_spec: { page: "home" },
    component_map: { header: "AppHeader" },
    changed_files: ["src/home.tsx"],
    acceptance_checklist: ["responsive"],
    fidelity_findings: []
  }, {
    positive: intake({ title: "Implement Figma design-to-code" }),
    combination: combo(
      { title: "Implement design for frontend page" },
      "frontend-design"
    )
  }),
  fixture("browser-qa", "browser-qa-evidence", "url", {
    url: "http://127.0.0.1:3000",
    browser_provider: "fixture-chromium",
    viewport: { width: 1280, height: 800 },
    user_flows: ["open dashboard"],
    screenshots: ["artifacts/dashboard.png"],
    console_errors: [],
    network_errors: [],
    behavior_results: [{ flow: "open dashboard", status: "PASS" }]
  }, {
    positive: intake({ title: "Run browser DOM and console acceptance" }),
    combination: combo(
      { title: "Validate responsive web UI in browser" },
      "frontend-design"
    )
  }),
  fixture("mobile-qa", "mobile-qa-evidence", "platform", {
    platform: "ios",
    device: "iPhone 16",
    os_version: "18",
    app_artifact: "build/App.app",
    flows: ["launch"],
    screenshots_or_video: ["artifacts/ios.png"],
    crashes: [],
    logs: [],
    cleanup: "simulator shutdown"
  }, {
    positive: intake({ title: "Test the iOS mobile app" }),
    combination: combo(
      { title: "Measure mobile startup performance" },
      "performance-validation"
    )
  }),
  fixture("performance-validation", "performance-evidence", "metric", {
    metric: "startup_ms",
    baseline: { median: 100 },
    candidate: { median: 95 },
    environment_fingerprint: "node26-macos-arm64",
    sample_count: 5,
    distribution: [94, 95, 95, 96, 97],
    threshold: { max_regression_percent: 5 },
    verdict: "PASS"
  }, {
    positive: intake({ title: "Measure startup performance latency" }),
    combination: combo(
      { title: "Measure mobile startup performance" },
      "mobile-qa"
    )
  }),
  fixture("migration-safety", "migration-safety-evidence", "source_version", {
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
  }, {
    positive: intake({ title: "Run database migration and backfill" }),
    combination: combo(
      { risk: "high", title: "Run durable state migration" },
      "architecture-design"
    )
  }),
  fixture("deploy-release", "deployment-receipt", "candidate_digest", {
    candidate_digest: CURRENT_CANDIDATE_DIGEST,
    environment: "staging",
    approval: "approval-1",
    deployment_id: "deploy-1",
    started_at: "2026-08-21T00:00:00.000Z",
    completed_at: "2026-08-21T00:01:00.000Z",
    health_checks: [{ status: "PASS" }],
    canary_results: [{ status: "PASS" }],
    rollback_token: "rollback-1"
  }, {
    positive: intake({ title: "Deploy release canary" }),
    combination: combo(
      { title: "Roll out to production" },
      "high-risk-review"
    )
  }),
  fixture("project-audit", "project-audit-evidence", "objective", {
    objective: "release readiness",
    commitments: ["candidate verified"],
    checks: [{ id: "candidate", status: "PASS" }],
    findings: [],
    coverage: 1,
    confidence: "high",
    unverified_items: [],
    release_posture: "PASS"
  }, {
    positive: intake({ title: "Run a project health check audit" }),
    combination: combo(
      { title: "Run a pre-release review" },
      "deploy-release"
    )
  }),
  fixture("postmortem", "postmortem-evidence", "impact", {
    impact: "one failed run",
    timeline: ["failure", "detection"],
    detection_gap: "missing real-entry test",
    root_causes: ["test bypassed loader"],
    failed_controls: ["unit tests"],
    corrective_actions: ["add loader test"],
    control_candidates: ["real-entry gate"],
    owners: ["kernel"],
    verification: "old implementation fails new gate"
  }, {
    positive: intake({ title: "Write an incident postmortem" }),
    combination: combo(
      { title: "Audit an incident postmortem" },
      "project-audit"
    )
  }),
  fixture("simplification", "simplification-evidence", "candidates", {
    candidates: ["unused export"],
    consumer_evidence: ["no production import"],
    deletion_plan: ["remove export"],
    risk: "low",
    verification_plan: ["npm test"],
    estimated_savings: { lines: 20 },
    actual_savings: null,
    decision: "delete"
  }, {
    positive: intake({ title: "Simplify unused duplicate code" }),
    combination: combo(
      { type: "tech_debt", title: "Simplify duplicate cross-module code" },
      "incremental-delivery"
    )
  })
];

export function buildRoutingCases() {
  return CAPABILITY_FIXTURES.flatMap((capability) => [
    {
      case_id: `${capability.capabilityId}:positive`,
      kind: "positive",
      capability_id: capability.capabilityId,
      intake: capability.routing.positive
    },
    {
      case_id: `${capability.capabilityId}:negative`,
      kind: "negative",
      capability_id: capability.capabilityId,
      intake: capability.routing.negative
    },
    {
      case_id: `${capability.capabilityId}:combination`,
      kind: "combination",
      capability_id: capability.capabilityId,
      companion_id: capability.routing.combination.companionId,
      intake: capability.routing.combination.intake
    },
    {
      case_id: `${capability.capabilityId}:missing-capability`,
      kind: "missing-capability",
      capability_id: capability.capabilityId
    },
    {
      case_id: `${capability.capabilityId}:optional-skip`,
      kind: "optional-skip",
      capability_id: capability.capabilityId,
      intake: capability.routing.positive
    }
  ]);
}

export function buildEvidenceCases() {
  return CAPABILITY_FIXTURES.flatMap((capability) => [
    evidenceCase(capability, "valid"),
    evidenceCase(capability, "missing-required-field"),
    evidenceCase(capability, "wrong-version"),
    evidenceCase(capability, "wrong-contract"),
    evidenceCase(capability, "generic-claim"),
    evidenceCase(capability, "undeclared-evidence-ref"),
    evidenceCase(capability, "contradiction"),
    evidenceCase(capability, "stale-candidate")
  ]);
}

function fixture(capabilityId, outputContract, requiredField, validOutput, routing) {
  return {
    capabilityId,
    outputContract,
    requiredField,
    validOutput,
    routing: {
      ...routing,
      negative: neutralIntake
    }
  };
}

function intake(overrides = {}) {
  return {
    ...neutralIntake,
    ...overrides
  };
}

function combo(overrides, companionId) {
  return {
    intake: intake(overrides),
    companionId
  };
}

function evidenceCase(capability, kind) {
  return {
    case_id: `${capability.capabilityId}:${kind}`,
    kind,
    capability_id: capability.capabilityId,
    output_contract: capability.outputContract,
    required_field: capability.requiredField,
    valid_output: capability.validOutput
  };
}
