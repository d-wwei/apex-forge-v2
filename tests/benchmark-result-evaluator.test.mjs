import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  inspectDurableClosure,
  inspectWorkspaceChanges,
  scoreBenchmarkMetrics
} from "../src/benchmark/result-evaluator.mjs";

test("false completion is detected from hidden acceptance, not agent claim", () => {
  const metrics = scoreBenchmarkMetrics({
    scenario: "simple",
    mode: "plugin-kernel",
    execution: {
      exit_code: 0,
      output: { verdict: "pass", evidence_refs: [] },
      usage: { input_tokens: 10, output_tokens: 5, reasoning_tokens: 2 }
    },
    acceptance: [{ status: "PASS" }],
    hidden: [{ status: "FAIL" }],
    changes: { safe: true },
    durable: { closed: true, evidence_score: 1 },
    recoveryCount: 0,
    wallMs: 100
  });
  assert.equal(metrics.completion, 1);
  assert.equal(metrics.hidden_acceptance, 0);
  assert.equal(metrics.false_completion_claim, true);
  assert.equal(metrics.cost, 17);
});

test("interrupted recovery requires a resumed successful process", () => {
  const metrics = scoreBenchmarkMetrics({
    scenario: "interrupted",
    mode: "plugin-kernel",
    execution: {
      exit_code: 0,
      output: { verdict: "pass", evidence_refs: ["a"] },
      usage: { input_tokens: 1, output_tokens: 1 }
    },
    acceptance: [{ status: "PASS" }],
    hidden: [{ status: "PASS" }],
    changes: { safe: true },
    durable: { closed: true, evidence_score: 1 },
    recoveryCount: 1,
    wallMs: 100
  });
  assert.equal(metrics.recovery, 1);
  assert.equal(metrics.durable_closure, 1);
});

test("plugin PASS without durable closure is a false completion claim", () => {
  const metrics = scoreBenchmarkMetrics({
    scenario: "simple",
    mode: "plugin-kernel",
    execution: {
      exit_code: 0,
      output: { verdict: "pass", evidence_refs: ["verification"] },
      usage: { input_tokens: 1, output_tokens: 1 }
    },
    acceptance: [{ status: "PASS" }],
    hidden: [{ status: "PASS" }],
    changes: { safe: true },
    durable: { closed: false, evidence_score: 1 },
    recoveryCount: 0,
    wallMs: 100
  });
  assert.equal(metrics.completion, 1);
  assert.equal(metrics.durable_closure, 0);
  assert.equal(metrics.false_completion_claim, true);
});

test("durable closure applies reconcile snapshot and requires replay hash equality", () => {
  const fixture = durableFixture({
    operationalHash: "a".repeat(64),
    replayHash: "a".repeat(64)
  });

  const closure = inspectDurableClosure({
    workspace: fixture.workspace,
    mode: "plugin-kernel",
    candidateRoot: fixture.candidateRoot,
    agentOutput: { evidence_refs: [] }
  });

  assert.equal(closure.closed, true);
  assert.equal(closure.reconcile.consistent, true);
  assert.equal(closure.reconcile.hash_equal, true);
  const invocation = JSON.parse(readFileSync(fixture.invocationPath, "utf8"));
  assert.ok(invocation.includes("--apply"));
  assert.equal(invocation.includes("--dry-run"), false);
});

test("durable closure rejects a reconcile post-check hash mismatch", () => {
  const fixture = durableFixture({
    operationalHash: "a".repeat(64),
    replayHash: "b".repeat(64)
  });

  const closure = inspectDurableClosure({
    workspace: fixture.workspace,
    mode: "plugin-kernel",
    candidateRoot: fixture.candidateRoot,
    agentOutput: { evidence_refs: [] }
  });

  assert.equal(closure.closed, false);
  assert.equal(closure.reconcile.consistent, false);
  assert.equal(closure.reconcile.hash_equal, false);
});

test("durable closure rejects done runs without every node including learn passed", () => {
  const fixture = durableFixture({
    operationalHash: "a".repeat(64),
    replayHash: "a".repeat(64)
  });
  const run = JSON.parse(readFileSync(fixture.runPath, "utf8"));
  run.nodes = run.nodes.filter((node) => node.id !== "learn");
  writeFileSync(fixture.runPath, `${JSON.stringify(run, null, 2)}\n`);

  const closure = inspectDurableClosure({
    workspace: fixture.workspace,
    mode: "plugin-kernel",
    candidateRoot: fixture.candidateRoot,
    agentOutput: { evidence_refs: [] }
  });

  assert.equal(closure.closed, false);
  assert.deepEqual(closure.fully_closed_run_ids, []);
});

test("workspace scope rejects changes outside affected files", () => {
  const workspace = mkdtempSync(join(tmpdir(), "apex-evaluator-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(workspace, "src", "allowed.txt"), "before\n");
  writeFileSync(join(workspace, "src", "outside.txt"), "before\n");
  git(workspace, ["init", "-q"]);
  git(workspace, ["config", "user.name", "Test"]);
  git(workspace, ["config", "user.email", "test@example.com"]);
  git(workspace, ["add", "-A"]);
  git(workspace, ["commit", "-qm", "baseline"]);
  writeFileSync(join(workspace, "src", "allowed.txt"), "after\n");
  writeFileSync(join(workspace, "src", "outside.txt"), "after\n");
  const result = inspectWorkspaceChanges(workspace, ["src/allowed.txt"]);
  assert.equal(result.safe, false);
  assert.deepEqual(result.outside_scope, ["src/outside.txt"]);
});

function durableFixture({ operationalHash, replayHash }) {
  const root = mkdtempSync(join(tmpdir(), "apex-durable-evaluator-"));
  const workspace = join(root, "workspace");
  const candidateRoot = join(root, "candidate");
  const runRoot = join(workspace, ".apex-v2", "runs", "run-1");
  const bridge = join(
    candidateRoot,
    "plugins",
    "codex",
    "apex-forge-v2",
    "scripts",
    "apex-host.mjs"
  );
  const invocationPath = join(workspace, "reconcile-invocation.json");
  mkdirSync(runRoot, { recursive: true });
  mkdirSync(join(bridge, ".."), { recursive: true });
  writeFileSync(
    join(workspace, ".apex-v2", "project.json"),
    `${JSON.stringify({ active_runs: [] }, null, 2)}\n`
  );
  const runPath = join(runRoot, "run.json");
  writeFileSync(
    runPath,
    `${JSON.stringify({
      status: "done",
      nodes: [
        "mandate",
        "context",
        "plan_graph",
        "execute",
        "verify",
        "review",
        "integrate",
        "learn"
      ].map((id) => ({
        id,
        status: "passed",
        gate: { status: "PASS" }
      })),
      carry_forward: [],
      gate: { status: "PASS" }
    }, null, 2)}\n`
  );
  for (const [file, value] of [
    ["verification-report.json", { candidate_digest: "candidate-1" }],
    ["review-report.json", { candidate_digest: "candidate-1" }],
    ["integration-report.json", { candidate_digest: "candidate-1" }]
  ]) {
    writeFileSync(join(runRoot, file), `${JSON.stringify(value, null, 2)}\n`);
  }
  writeFileSync(bridge, `
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const project = args[args.indexOf("--project") + 1];
writeFileSync(
  new URL("reconcile-invocation.json", \`file://\${project}/\`),
  JSON.stringify(args)
);
const applied = args.includes("--apply");
console.log(JSON.stringify(applied ? {
  status: "CONSISTENT",
  applied: true,
  inspection: {
    status: "CONSISTENT",
    issues: [],
    changes: []
  },
  post_check: {
    status: "CONSISTENT",
    issues: [],
    operational_state: { state_hash: ${JSON.stringify(operationalHash)} },
    event_replay: { operational_state_hash: ${JSON.stringify(replayHash)} }
  }
} : {
  status: "CONSISTENT",
  applied: false,
  inspection: {
    status: "CONSISTENT",
    issues: [],
    changes: [],
    operational_state: { state_hash: ${JSON.stringify(operationalHash)} },
    event_replay: {}
  },
  post_check: null
}));
`);
  return { workspace, candidateRoot, invocationPath, runPath };
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
