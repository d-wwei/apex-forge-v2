import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCapabilityContextBudget,
  assertCapabilityProviderAvailability,
  capabilityRegistry,
  loadCapabilityRegistry,
  routeCapabilities,
  validateCapabilityRegistry,
  validateCapabilityLock
} from "../src/core/capability-registry.mjs";
import {
  applyCapabilityBindings,
  evaluateTestWorkerSplit
} from "../src/core/plan-graph.mjs";
import { buildWorkerAgentPrompt } from "../src/core/worker-execution.mjs";
import {
  contractRegistry,
  validateContract
} from "../src/core/contracts.mjs";

const EXPECTED_CAPABILITIES = [
  "engineering-spec",
  "source-grounding",
  "architecture-design",
  "systematic-debugging",
  "tdd-negative-control",
  "incremental-delivery",
  "code-review",
  "security-audit",
  "high-risk-review",
  "test-strategy",
  "documentation-sync",
  "frontend-design",
  "design-to-code",
  "browser-qa",
  "mobile-qa",
  "performance-validation",
  "migration-safety",
  "deploy-release",
  "project-audit",
  "postmortem",
  "simplification"
];

test("built-in capability registry defines all 21 versioned internal capabilities", () => {
  const registry = capabilityRegistry();
  assert.equal(
    validateContract("capability-registry.schema.json", registry).valid,
    true
  );
  assert.deepEqual(
    registry.capabilities.map((item) => item.capability_id),
    EXPECTED_CAPABILITIES
  );
  assert.equal(new Set(registry.capabilities.map((item) => item.capability_id)).size, 21);
  assert.ok(registry.capabilities.every((item) => item.version === "1.0.0"));
  assert.ok(registry.capabilities.every((item) => existsSync(item.protocol_path)));
  for (const capability of registry.capabilities) {
    assert.ok(
      contractRegistry().validators.has(`${capability.input_contract}.schema.json`),
      capability.input_contract
    );
    assert.ok(
      contractRegistry().validators.has(`${capability.output_contract}.schema.json`),
      capability.output_contract
    );
    const input = {
      schema_version: "v0",
      capability_id: capability.capability_id,
      objective: `Run ${capability.capability_id}`,
      context_refs: ["src/value.mjs"],
      constraints: ["execution_class:cognitive"],
      acceptance_refs: ["typed output"],
      verification: ["node --test"],
      candidate_digest: null,
      environment: null,
      created_at: "2026-08-21T00:00:00.000Z"
    };
    assert.equal(
      validateContract(`${capability.input_contract}.schema.json`, input).valid,
      true,
      capability.capability_id
    );
    input.capability_id = "wrong-capability";
    assert.equal(
      validateContract(`${capability.input_contract}.schema.json`, input).valid,
      false,
      capability.capability_id
    );
  }
});

test("capability enforcement rollout flag supports shadow and fail-closed enforce", () => {
  const previous = process.env.APEX_CAPABILITY_ENFORCEMENT_MODE;
  try {
    process.env.APEX_CAPABILITY_ENFORCEMENT_MODE = "enforce";
    assert.equal(capabilityRegistry().enforcement_mode, "enforce");
    process.env.APEX_CAPABILITY_ENFORCEMENT_MODE = "invalid";
    assert.throws(() => capabilityRegistry(), /仅支持 shadow\|enforce/);
  } finally {
    if (previous == null) delete process.env.APEX_CAPABILITY_ENFORCEMENT_MODE;
    else process.env.APEX_CAPABILITY_ENFORCEMENT_MODE = previous;
  }
});

test("registry validation rejects duplicate IDs, unsafe protocol paths, and missing definitions", () => {
  const registry = structuredClone(capabilityRegistry());
  registry.capabilities.push(structuredClone(registry.capabilities[0]));
  assert.throws(() => validateCapabilityRegistry(registry), /重复/);

  const unsafe = structuredClone(capabilityRegistry());
  unsafe.capabilities[0].protocol_ref = "../outside.md";
  assert.throws(() => validateCapabilityRegistry(unsafe), /不安全/);

  const missing = structuredClone(capabilityRegistry());
  missing.capabilities[0].protocol_ref = "capabilities/core/missing/PROTOCOL.md";
  assert.throws(() => validateCapabilityRegistry(missing), /不存在/);

  const missingInput = structuredClone(capabilityRegistry());
  missingInput.capabilities[0].input_contract = "missing-request";
  assert.throws(
    () => validateCapabilityRegistry(missingInput),
    /input contract schema 不存在/
  );

  const missingOutput = structuredClone(capabilityRegistry());
  missingOutput.capabilities[0].output_contract = "missing-evidence";
  assert.throws(
    () => validateCapabilityRegistry(missingOutput),
    /output contract schema 不存在/
  );

  const forbiddenTool = structuredClone(capabilityRegistry());
  forbiddenTool.capabilities[0].allowed_tools.push("merge");
  assert.throws(
    () => validateCapabilityRegistry(forbiddenTool),
    /同时 allowed\/forbidden/
  );
});

test("registry loader validates custom roots without trusting arbitrary JSON", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-capability-registry-"));
  writeFileSync(join(root, "registry.json"), JSON.stringify({
    schema_version: "v0",
    registry_version: "1.0.0",
    public_skill_id: "using-apex-forge",
    enforcement_mode: "shadow",
    previous_versions: {},
    capabilities: [],
    bindings: []
  }));
  assert.throws(() => loadCapabilityRegistry(root), /至少包含 1 项能力/);
});

test("capability lock binds every protocol version and content hash", () => {
  const registry = capabilityRegistry();
  const lock = JSON.parse(readFileSync(
    new URL("../capabilities/capability-lock.json", import.meta.url),
    "utf8"
  ));
  assert.doesNotThrow(() => validateCapabilityLock(lock, registry));
  const drifted = structuredClone(lock);
  drifted.capabilities[0].protocol_sha256 = "0".repeat(64);
  assert.throws(
    () => validateCapabilityLock(drifted, registry),
    /protocol hash drift/
  );

  const definitionDrift = structuredClone(lock);
  definitionDrift.capabilities[0].definition_sha256 = "0".repeat(64);
  assert.throws(
    () => validateCapabilityLock(definitionDrift, registry),
    /definition hash drift/
  );

  const inputDrift = structuredClone(lock);
  inputDrift.capabilities[0].input_schema_sha256 = "0".repeat(64);
  assert.throws(
    () => validateCapabilityLock(inputDrift, registry),
    /input schema hash drift/
  );

  const outputDrift = structuredClone(lock);
  outputDrift.capabilities[0].output_schema_sha256 = "0".repeat(64);
  assert.throws(
    () => validateCapabilityLock(outputDrift, registry),
    /output schema hash drift/
  );
});

test("capability routing is deterministic, deduplicated, and risk aware", () => {
  const registry = capabilityRegistry();
  const bug = routeCapabilities(registry, {
    type: "bug",
    risk: "high",
    title: "Fix authorization race",
    description: "The auth token refresh races under concurrency.",
    affected_area: "src/auth/session.mjs,tests/auth/session.test.mjs"
  });
  assert.deepEqual(
    bug.required.map((item) => item.capability_id),
    [
      "engineering-spec",
      "architecture-design",
      "systematic-debugging",
      "tdd-negative-control",
      "security-audit",
      "high-risk-review",
      "test-strategy",
      "code-review"
    ]
  );
  assert.equal(
    new Set(bug.required.map((item) => item.capability_id)).size,
    bug.required.length
  );

  const docs = routeCapabilities(registry, {
    type: "other",
    risk: "low",
    title: "Fix README typo",
    description: "Correct one misspelled word.",
    affected_area: "README.md"
  });
  assert.deepEqual(docs.required.map((item) => item.capability_id), [
    "documentation-sync"
  ]);
});

test("capability bindings attach to existing plan nodes without creating a second graph", () => {
  const routed = routeCapabilities(capabilityRegistry(), {
    type: "bug",
    risk: "medium",
    title: "Fix parser regression",
    description: "A parser test fails on escaped input.",
    affected_area: "src/parser.mjs,tests/parser.test.mjs"
  });
  const nodes = [
    { id: "delivery-design", required_evidence: ["design"] },
    { id: "delivery-implementation", required_evidence: ["patch"] },
    { id: "delivery-verification", required_evidence: ["checks"] },
    { id: "delivery-review", required_evidence: ["review"] }
  ];
  const applied = applyCapabilityBindings(nodes, routed);
  assert.equal(applied.nodes.length, 4);
  assert.ok(
    applied.nodes
      .find((node) => node.id === "delivery-design")
      .capability_bindings
      .some((item) => item.capability_id === "systematic-debugging")
  );
  assert.ok(
    applied.nodes
      .find((node) => node.id === "delivery-implementation")
      .capability_bindings
      .some((item) => item.capability_id === "tdd-negative-control")
  );
  assert.ok(
    applied.nodes
      .find((node) => node.id === "delivery-review")
      .capability_bindings
      .some((item) => item.capability_id === "code-review")
  );
  assert.equal(applied.capability_plan.registry_version, "1.0.0");
  assert.equal(applied.capability_plan.enforcement_mode, "shadow");
  assert.equal(applied.capability_plan.router_mode, "enabled");
  const design = applied.nodes.find((node) => node.id === "delivery-design");
  const prompt = buildWorkerAgentPrompt({
    read_scope: ["src/"],
    write_scope: ["src/"],
    verification: ["npm test"]
  }, {
    ...design,
    deliverables: ["design evidence"]
  });
  assert.match(prompt, /Systematic Debugging/);
  assert.match(prompt, /Engineering Spec/);
});

test("capability router feature flag and previous version registry are fail-closed", () => {
  const previous = process.env.APEX_CAPABILITY_ROUTER_MODE;
  try {
    process.env.APEX_CAPABILITY_ROUTER_MODE = "disabled";
    const disabled = routeCapabilities(capabilityRegistry(), {
      type: "bug",
      risk: "high",
      title: "Fix bug",
      description: "regression",
      affected_area: "src/value.mjs"
    });
    assert.equal(disabled.router_mode, "disabled");
    assert.deepEqual(disabled.required, []);

    process.env.APEX_CAPABILITY_ROUTER_MODE = "invalid";
    assert.throws(
      () => routeCapabilities(capabilityRegistry(), {}),
      /仅支持 enabled\|disabled/
    );
  } finally {
    if (previous == null) delete process.env.APEX_CAPABILITY_ROUTER_MODE;
    else process.env.APEX_CAPABILITY_ROUTER_MODE = previous;
  }

  const previousVersion = structuredClone(capabilityRegistry());
  previousVersion.previous_versions = { "engineering-spec": ["0.9.0"] };
  assert.doesNotThrow(() => validateCapabilityRegistry(previousVersion));

  const currentVersion = structuredClone(capabilityRegistry());
  currentVersion.previous_versions = { "engineering-spec": ["1.0.0"] };
  assert.throws(
    () => validateCapabilityRegistry(currentVersion),
    /不能包含当前版本/
  );

  const unknown = structuredClone(capabilityRegistry());
  unknown.previous_versions = { "missing-capability": ["0.9.0"] };
  assert.throws(
    () => validateCapabilityRegistry(unknown),
    /引用未知能力/
  );
});

test("capability context budget fails closed instead of silently dropping required methods", () => {
  assert.doesNotThrow(() => assertCapabilityContextBudget([
    { category: "core" },
    { category: "core" },
    { category: "core" },
    { category: "conditional" },
    { category: "conditional" }
  ]));
  assert.throws(
    () => assertCapabilityContextBudget([
      { category: "core" },
      { category: "core" },
      { category: "core" },
      { category: "core" }
    ]),
    /context budget exceeded.*core.*必须拆分或 replan/
  );
  assert.throws(
    () => assertCapabilityContextBudget([
      { category: "conditional" },
      { category: "conditional" },
      { category: "conditional" }
    ]),
    /context budget exceeded.*conditional/
  );
});

test("quick graph moves overflow capabilities to review without dropping them", () => {
  const nodes = [
    { id: "delivery-implementation", required_evidence: ["patch"], required_capabilities: [] },
    { id: "delivery-review", required_evidence: ["review"], required_capabilities: [] }
  ];
  const definitions = capabilityRegistry().capabilities
    .filter((item) => [
      "engineering-spec",
      "architecture-design",
      "systematic-debugging",
      "test-strategy"
    ].includes(item.capability_id));
  const required = definitions.map((definition, index) => ({
    capability_id: definition.capability_id,
    capability_version: definition.version,
    category: "core",
    execution_class: definition.execution_class,
    required_host_capabilities: definition.required_host_capabilities,
    input_contract: definition.input_contract,
    output_contract: definition.output_contract,
    protocol_ref: definition.protocol_ref,
    availability: definition.availability,
    certification: definition.certification,
    binding_id: `quick-overflow-${index}`,
    priority: 100 - index,
    mode: "required",
    target_node_id: "delivery-design",
    required: true
  }));
  const applied = applyCapabilityBindings(nodes, {
    registry_version: "1.0.0",
    enforcement_mode: "shadow",
    router_mode: "enabled",
    required,
    optional: [],
    advisory: []
  });
  const implementation = applied.nodes[0].capability_bindings;
  const review = applied.nodes[1].capability_bindings;
  assert.equal(implementation.length, 3);
  assert.equal(review.length, 1);
  assert.equal(
    new Set([...implementation, ...review].map((item) => item.capability_id)).size,
    4
  );
  assert.ok(review.every((item) => item.target_node_id === "delivery-review"));
});

test("production behavior wording does not imply a deploy request", () => {
  const routed = routeCapabilities(capabilityRegistry(), {
    type: "bug",
    risk: "low",
    title: "Restore environment-aware secure cookie behavior",
    description: [
      "Restore production-only secure cookies.",
      "Retain the explicit COOKIE_SECURE=false override."
    ].join(" "),
    affected_area: "src/lib/cookie-utils.ts,src/lib/__tests__/cookie-utils.test.ts"
  });
  assert.equal(
    [...routed.required, ...routed.optional, ...routed.advisory]
      .some((item) => item.capability_id === "deploy-release"),
    false
  );
});

test("environment-dependent capabilities require an explicit certified provider declaration", () => {
  const browser = {
    capability_id: "browser-qa",
    required: true
  };
  const deploy = {
    capability_id: "deploy-release",
    required: true
  };
  assert.throws(
    () => assertCapabilityProviderAvailability([browser, deploy], ""),
    /provider unavailable.*browser-qa.*deploy-release/
  );
  assert.doesNotThrow(() =>
    assertCapabilityProviderAvailability(
      [browser, deploy],
      "browser-qa,deploy-release"
    )
  );
  assert.doesNotThrow(() =>
    assertCapabilityProviderAvailability([
      { capability_id: "mobile-qa", required: false }
    ], "")
  );
});

test("test worker split requires explicit parallel value and disjoint substantial scopes", () => {
  const base = {
    roadmapNode: {
      title: "Large parallel test implementation",
      description: "Use an independent test worker for the large test suite."
    },
    scopes: {
      implementation: ["src/a.mjs", "src/b.mjs"],
      tests: ["tests/a.test.mjs", "tests/b.test.mjs"]
    }
  };
  assert.equal(evaluateTestWorkerSplit(base).enabled, true);
  assert.equal(evaluateTestWorkerSplit({
    ...base,
    roadmapNode: { title: "Small change", description: "" }
  }).enabled, false);
  assert.equal(evaluateTestWorkerSplit({
    ...base,
    scopes: {
      implementation: ["src/"],
      tests: ["src/tests/"]
    }
  }).enabled, false);
});
