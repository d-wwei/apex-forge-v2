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
const digest = "a".repeat(64);

const coreCases = [
  ["engineering-spec", {
    objective: "Implement bounded behavior",
    in_scope: ["src/value.mjs"],
    out_of_scope: ["deployment"],
    acceptance: ["returns the new value"],
    assumptions: [],
    open_questions: [],
    verification_plan: ["node --test tests/value.test.mjs"]
  }],
  ["source-grounding", {
    detected_version: "1.0.0",
    authoritative_sources: ["schemas/value.schema.json"],
    verified_claims: ["value is an integer"],
    conflicts: [],
    unverified_assumptions: []
  }],
  ["architecture-design", {
    problem: "share one durable state",
    constraints: ["single writer"],
    alternatives: ["event log", "mutable cache"],
    selected_design: "event log",
    state_ownership: { project: "Kernel" },
    failure_modes: ["partial write"],
    rollback: ["restore journal"],
    verification: ["reconcile"]
  }],
  ["systematic-debugging", {
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
  }],
  ["tdd-negative-control", {
    test_entry: "tests/parser.test.mjs",
    fault_model: "restore old slice",
    red_command: "node --test tests/parser.test.mjs",
    red_signature: "expected delimiter",
    green_command: "node --test tests/parser.test.mjs",
    green_result: "PASS",
    restoration_result: "mutation removed"
  }],
  ["incremental-delivery", {
    slices: ["schema", "runtime"],
    slice_dependencies: { runtime: ["schema"] },
    write_scopes: { schema: ["schemas/"], runtime: ["src/"] },
    verification_per_slice: { schema: ["check"], runtime: ["test"] }
  }],
  ["code-review", {
    candidate_digest: digest,
    findings: [],
    residual_risks: [],
    merge_posture: "approve"
  }],
  ["security-audit", {
    scope: ["src/auth.mjs"],
    threat_model: ["token theft"],
    findings: [],
    residual_risks: [],
    merge_posture: "approve"
  }],
  ["high-risk-review", {
    safety_claim: "migration is reversible",
    assumptions: ["backup exists"],
    adversarial_cases: ["kill during write"],
    blast_radius: ["project state"],
    rollback: ["restore backup"],
    residual_risks: []
  }],
  ["test-strategy", {
    test_mode: "targeted",
    affected_surfaces: ["parser"],
    selected_test_groups: ["parser-regression"],
    excluded_groups: ["browser"],
    selection_rationale: "Only parser behavior changed.",
    stop_conditions: ["targeted failure"]
  }],
  ["documentation-sync", {
    changed_behavior: ["CLI flag"],
    affected_docs: ["README.md", "docs/cli.md"],
    updated_docs: ["README.md"],
    intentionally_unchanged: ["docs/cli.md"],
    stale_refs: [],
    verification: ["run help"]
  }]
];

test("all 11 core capabilities accept complete typed evidence", () => {
  for (const [capabilityId, output] of coreCases) {
    const binding = bindingFor(capabilityId);
    const evidence = evidenceFor(binding, output);
    assert.doesNotThrow(
      () => validateCapabilityEvidenceForBindings([binding], [evidence]),
      capabilityId
    );
  }
});

test("core routing covers the expected engineering signals", () => {
  const cases = [
    ["engineering-spec", { type: "feature", risk: "medium", title: "Add feature" }],
    ["source-grounding", { type: "other", risk: "low", title: "Update SDK API" }],
    ["architecture-design", { type: "feature", risk: "high", title: "State change" }],
    ["systematic-debugging", { type: "bug", risk: "medium", title: "Fix bug" }],
    ["tdd-negative-control", { type: "feature", risk: "medium", title: "Change behavior" }],
    ["incremental-delivery", { type: "tech_debt", risk: "medium", title: "Refactor multi-file module" }],
    ["code-review", { type: "tech_debt", risk: "medium", title: "Refactor" }],
    ["security-audit", { type: "feature", risk: "medium", title: "Add authorization token" }],
    ["high-risk-review", { type: "risk", risk: "critical", title: "Delete state" }],
    ["test-strategy", { type: "feature", risk: "medium", title: "Add behavior" }],
    ["documentation-sync", { type: "other", risk: "low", title: "Update README" }]
  ];
  for (const [capabilityId, intake] of cases) {
    const routed = routeCapabilities(registry, {
      description: "",
      affected_area: "src/value.mjs",
      ...intake
    });
    assert.ok(
      [...routed.required, ...routed.optional, ...routed.advisory]
        .some((item) => item.capability_id === capabilityId),
      capabilityId
    );
  }
});

test("core semantic gates reject shallow or contradictory evidence", () => {
  assertInvalid("architecture-design", {
    ...outputFor("architecture-design"),
    alternatives: ["only option"]
  }, /alternatives/);
  assertInvalid("systematic-debugging", {
    ...outputFor("systematic-debugging"),
    hypotheses: ["one guess"]
  }, /hypotheses/);
  assertInvalid("tdd-negative-control", {
    ...outputFor("tdd-negative-control"),
    green_command: "node --test tests/other.test.mjs"
  }, /same test_entry|同一 test_entry/);
  assertInvalid("code-review", {
    ...outputFor("code-review"),
    findings: [{ severity: "P0", blocking: true }],
    merge_posture: "approve"
  }, /不能 approve/);
  assertInvalid("security-audit", {
    ...outputFor("security-audit"),
    findings: [{ severity: "high" }],
    merge_posture: "approve"
  }, /不能 approve/);
  assertInvalid("test-strategy", {
    ...outputFor("test-strategy"),
    selected_test_groups: []
  }, /selected_test_groups/);
  assertInvalid("documentation-sync", {
    ...outputFor("documentation-sync"),
    intentionally_unchanged: []
  }, /未处理/);
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
    claims: [`${binding.capability_id} completed with source evidence`],
    uncertainties: [],
    verification_refs: ["node --test tests/value.test.mjs"],
    output_contract: binding.output_contract,
    output,
    created_at: "2026-08-21T00:00:00.000Z"
  };
}

function outputFor(capabilityId) {
  return structuredClone(
    coreCases.find(([id]) => id === capabilityId)[1]
  );
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
