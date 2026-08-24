import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRouteUsage, routeExecution } from "../src/core/execution-router.mjs";
import { inferQuickVerificationCommands } from "../src/core/plan-graph.mjs";
import { defaultExecutionPolicy } from "../src/core/policy-defaults.mjs";

const policy = {
  interactive_workspace_patch: { enabled: true },
  execution_router: {
    force_factory_risks: ["critical"],
    factory_on_isolation: true,
    factory_on_resume: true,
    factory_on_background: true,
    factory_on_parallel_execution: true
  },
  cost_governor: {
    enabled: true,
    unknown_usage: "record",
    default_budget: {
      max_wall_minutes: 30,
      max_agent_turns: 12,
      max_tool_calls: 80,
      max_input_tokens: 160000,
      max_output_tokens: 30000
    },
    method_pack_budgets: {
      quick: {
        max_wall_minutes: 12,
        max_agent_turns: 6,
        max_tool_calls: 30,
        max_input_tokens: 60000,
        max_output_tokens: 12000
      }
    }
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

test("delegated cognitive nodes route to Factory while main-agent nodes stay Interactive", () => {
  const delegated = routeExecution({
    execution_class: "cognitive",
    preferred_mode: "interactive",
    delegation: {
      eligible: true,
      default: true,
      parallel: true,
      main_agent_required: false
    },
    model_tier: "cheap"
  }, policy);
  assert.equal(delegated.mode, "factory");
  assert.ok(delegated.reasons.includes("delegated_subagent"));

  const mainAgent = routeExecution({
    execution_class: "cognitive",
    preferred_mode: "interactive",
    delegation: {
      eligible: true,
      default: true,
      parallel: false,
      main_agent_required: true
    },
    model_tier: "strong"
  }, policy);
  assert.equal(mainAgent.mode, "interactive");
  assert.ok(mainAgent.reasons.includes("main_agent_required"));
});

test("delegated workspace patch defaults to Factory when isolation allows it", () => {
  const route = routeExecution({
    execution_class: "workspace_patch",
    preferred_mode: "interactive",
    delegation: {
      eligible: true,
      default: true,
      parallel: true,
      main_agent_required: false
    },
    model_tier: "cheap",
    risk: "medium"
  }, policy);
  assert.equal(route.mode, "factory");
  assert.ok(route.reasons.includes("delegated_subagent"));
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

test("risk, isolation, resume, background, and parallel hints route to Factory", () => {
  for (const node of [
    { risk: "critical" },
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

test("duration alone never upgrades to Factory and route carries method budget", () => {
  const route = routeExecution({
    execution_class: "workspace_patch",
    preferred_mode: "interactive",
    method_pack_id: "quick",
    risk: "medium",
    execution_hints: { estimated_duration_minutes: 12 }
  }, policy);
  assert.equal(route.mode, "interactive");
  assert.equal(route.method_pack_id, "quick");
  assert.equal(route.budget_status, "within_budget");
  assert.equal(route.cost_budget.max_wall_minutes, 12);
});

test("estimated route over budget fails closed instead of silently buying Factory", () => {
  assert.throws(() => routeExecution({
    execution_class: "workspace_patch",
    preferred_mode: "interactive",
    method_pack_id: "quick",
    risk: "medium",
    execution_hints: { estimated_duration_minutes: 13 }
  }, policy), /Cost Governor/);
});

test("actual token, tool, turn, and wall usage is evaluated against the route budget", () => {
  const route = routeExecution({
    execution_class: "workspace_patch",
    preferred_mode: "interactive",
    method_pack_id: "quick",
    risk: "medium",
    execution_hints: { estimated_duration_minutes: 10 }
  }, policy);
  assert.equal(evaluateRouteUsage(route, {
    duration_ms: 5 * 60 * 1000,
    usage: {
      agent_turns: 4,
      tool_calls: 20,
      input_tokens: 50000,
      output_tokens: 10000
    }
  }).status, "PASS");
  const exceeded = evaluateRouteUsage(route, {
    duration_ms: 5 * 60 * 1000,
    usage: {
      agent_turns: 4,
      tool_calls: 20,
      input_tokens: 60001,
      output_tokens: 10000
    }
  });
  assert.equal(exceeded.status, "FAIL");
  assert.deepEqual(exceeded.exceeded.map((item) => item.metric), ["input_tokens"]);
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
  assert.throws(() => routeExecution({
    execution_class: "workspace_patch",
    risk: "critical"
  }, policy, { mode: "interactive" }), /不能绕过强制 Factory/);
  assert.throws(() => routeExecution({
    execution_class: "workspace_patch",
    execution_hints: { requires_isolation: true }
  }, policy, { mode: "interactive" }), /不能绕过强制 Factory/);
  assert.throws(() => routeExecution({
    execution_class: "workspace_patch"
  }, policy, { mode: "deterministic" }), /不兼容/);
});

test("route persists the node model floor and resolved Codex model", () => {
  const route = routeExecution({
    execution_class: "workspace_patch",
    preferred_mode: "factory",
    model_tier: "cheap"
  }, defaultExecutionPolicy("2026-08-24T00:00:00.000Z"), {
    adapter: "codex"
  });

  assert.equal(route.initial_model_tier, "cheap");
  assert.equal(route.model_tier, "cheap");
  assert.equal(route.model_id, "gpt-5.6-luna");
  assert.deepEqual(route.model_reason, ["plan_node=cheap"]);
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
