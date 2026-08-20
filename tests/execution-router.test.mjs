import test from "node:test";
import assert from "node:assert/strict";
import { routeExecution } from "../src/core/execution-router.mjs";
import { inferQuickVerificationCommands } from "../src/core/plan-graph.mjs";

const policy = {
  interactive_workspace_patch: { enabled: true },
  execution_router: {
    factory_min_duration_minutes: 30,
    force_factory_risks: ["critical"],
    factory_on_isolation: true,
    factory_on_resume: true,
    factory_on_background: true,
    factory_on_parallel_execution: true
  }
};

test("cognitive, deterministic, and human classes keep fixed execution semantics", () => {
  assert.equal(routeExecution({
    execution_class: "cognitive",
    preferred_mode: "factory"
  }, policy).mode, "interactive");
  assert.equal(routeExecution({
    execution_class: "deterministic_check",
    preferred_mode: "interactive"
  }, policy).mode, "deterministic");
  assert.equal(routeExecution({
    execution_class: "human_decision",
    preferred_mode: "factory"
  }, policy).mode, "human");
});

test("workspace patch routes to Factory when Interactive patch is disabled", () => {
  const route = routeExecution({
    execution_class: "workspace_patch",
    preferred_mode: "interactive",
    required_capabilities: ["workspace_write"]
  }, {
    ...policy,
    interactive_workspace_patch: { enabled: false }
  });
  assert.equal(route.mode, "factory");
  assert.ok(route.reasons.includes("interactive_workspace_patch_disabled"));
});

test("short low-risk workspace patch stays Interactive when enabled", () => {
  const route = routeExecution({
    execution_class: "workspace_patch",
    preferred_mode: "interactive",
    risk: "medium",
    execution_hints: { estimated_duration_minutes: 10 }
  }, policy);
  assert.equal(route.mode, "interactive");
});

test("risk, duration, isolation, resume, background, and parallel hints route to Factory", () => {
  for (const node of [
    { risk: "critical" },
    { execution_hints: { estimated_duration_minutes: 30 } },
    { execution_hints: { requires_isolation: true } },
    { execution_hints: { requires_resume: true } },
    { execution_hints: { background: true } },
    { execution_hints: { requires_parallel_execution: true } }
  ]) {
    assert.equal(routeExecution({
      execution_class: "workspace_patch",
      preferred_mode: "interactive",
      ...node
    }, policy).mode, "factory");
  }
});

test("user override is persisted but cannot bypass execution class or policy", () => {
  const factory = routeExecution({
    execution_class: "workspace_patch",
    preferred_mode: "interactive"
  }, policy, { mode: "factory" });
  assert.equal(factory.mode, "factory");
  assert.equal(factory.user_override, "factory");
  assert.ok(factory.reasons.includes("user_override=factory"));

  assert.throws(() => routeExecution({
    execution_class: "cognitive"
  }, policy, { mode: "factory" }), /不兼容/);
  assert.throws(() => routeExecution({
    execution_class: "workspace_patch"
  }, {
    ...policy,
    interactive_workspace_patch: { enabled: false }
  }, { mode: "interactive" }), /禁止 Interactive/);
});

test("quick route uses declared public acceptance commands only", () => {
  const quotedCommand = "bun -e 'const first = 1; if (first !== 1) process.exit(1)'";
  assert.deepEqual(inferQuickVerificationCommands({
    acceptance_commands: [quotedCommand],
    evidence_refs: [],
    description: `Public acceptance commands: ${quotedCommand}`
  }, ["npm test"]), [quotedCommand]);
  assert.deepEqual(inferQuickVerificationCommands({
    evidence_refs: [
      "node --import tsx --test tests/worker/cost.test.ts",
      "artifact-123",
      "src/worker/cost.ts"
    ],
    description: "Public acceptance: npm run typecheck; docs/report.md"
  }, ["npm test"]), [
    "node --import tsx --test tests/worker/cost.test.ts",
    "npm run typecheck"
  ]);
  assert.deepEqual(inferQuickVerificationCommands({
    evidence_refs: [],
    description: "No declared command."
  }, ["npm test"]), ["npm test"]);
  assert.deepEqual(inferQuickVerificationCommands({
    evidence_refs: [],
    description: "Public acceptance commands: APEX_NO_DOCKER=1 bun test tests/security.test.ts"
  }, ["npm test"]), [
    "APEX_NO_DOCKER=1 bun test tests/security.test.ts"
  ]);
});
