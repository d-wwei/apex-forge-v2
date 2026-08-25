import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  benchmarkSandboxPolicy,
  buildBenchmarkCodexArgs,
  buildBenchmarkPrompt,
  collectCodexUsage,
  collectCodexRolloutUsage,
  findSessionId,
  inspectBenchmarkCohort,
  parseCodexJsonl
} from "../src/benchmark/codex-runner.mjs";
import { benchmarkEnvironment } from "../src/benchmark/environment.mjs";

const task = {
  title: "Repair parser",
  instructions: "Repair the parser and add tests.",
  affected_files: ["src/parser.ts", "tests/parser.test.ts"],
  acceptance_commands: ["npm test"]
};

test("non-plugin modes disable plugins while plugin mode keeps native discovery", () => {
  const base = {
    workspace: "/tmp/workspace",
    outputSchemaPath: "/tmp/schema.json",
    outputPath: "/tmp/output.json",
    sessionId: null,
    model: null,
    profile: null,
    reasoningEffort: null
  };
  const v1 = buildBenchmarkCodexArgs({ ...base, mode: "v1-skill" });
  const cli = buildBenchmarkCodexArgs({ ...base, mode: "cli-kernel" });
  const plugin = buildBenchmarkCodexArgs({ ...base, mode: "plugin-kernel" });
  assert.ok(v1.includes("--disable") && v1.includes("plugins"));
  assert.ok(cli.includes("--disable") && cli.includes("plugins"));
  assert.ok(!plugin.includes("--disable"));
  assert.ok(plugin.includes("-C"));
});

test("benchmark environment resolves the installed Bun runtime explicitly", () => {
  const env = benchmarkEnvironment({ PATH: "/usr/bin:/bin" });
  assert.ok(env.PATH.split(":").includes(join(homedir(), ".bun", "bin")));
  assert.equal(env.CI, "1");
});

test("resume keeps the same session without creating a new cwd-scoped run", () => {
  const args = buildBenchmarkCodexArgs({
    mode: "plugin-kernel",
    workspace: "/tmp/workspace",
    outputSchemaPath: "/tmp/schema.json",
    outputPath: "/tmp/output.json",
    sessionId: "session-123",
    model: "model",
    profile: "profile",
    reasoningEffort: "medium"
  });
  assert.deepEqual(args.slice(0, 2), ["exec", "resume"]);
  assert.ok(args.includes("session-123"));
  assert.ok(!args.includes("-C"));
  assert.ok(!args.includes("-p"));
  assert.ok(args.includes('model_reasoning_effort="medium"'));
});

test("mode prompts expose public task but never hidden checks", () => {
  for (const mode of ["v1-skill", "cli-kernel", "plugin-kernel"]) {
    const prompt = buildBenchmarkPrompt({
      task,
      mode,
      candidateRoot: "/candidate",
      runRoot: "/run"
    });
    assert.match(prompt, /Repair parser/);
    assert.match(prompt, /npm test/);
    assert.doesNotMatch(prompt, /hidden_checks/);
  }
  assert.match(buildBenchmarkPrompt({
    task,
    mode: "plugin-kernel",
    candidateRoot: "/candidate",
    runRoot: "/run"
  }), /already initialized exactly one durable intake\/run[\s\S]*profile `quick`/);
});

test("Plugin fast path keeps the Agent inside the claimed workspace and out of Kernel glue", () => {
  const prompt = buildBenchmarkPrompt({
    task,
    mode: "plugin-kernel",
    candidateRoot: "/candidate",
    runRoot: "/run",
    pluginBootstrap: {
      fast_path: {
        workspace_path: "/workspace/.apex-v2/action-workspace",
        write_scope: task.affected_files,
        verification_commands: task.acceptance_commands
      }
    }
  });
  assert.match(prompt, /already claimed[\s\S]*Do not read plugin Skill files/);
  assert.match(prompt, /Host Adapter will capture the patch/);
  assert.match(prompt, /include `review`/);
});

test("benchmark sandbox denies hidden controller inputs and only exposes agent IO for writes", () => {
  const policy = benchmarkSandboxPolicy({
    workspace: "/private/tmp/agent/workspace",
    runRoot: "/private/tmp/controller/run",
    codexHome: "/private/tmp/agent/codex-home",
    benchmarkRoot: "/repo/benchmarks/plugin-vs-v1",
    controllerRoot: "/private/tmp/controller",
    repositoryRoot: "/repo",
    extraDeniedReadPaths: ["/private/hidden"]
  });
  assert.deepEqual(policy.writablePaths, [
    "/private/tmp/agent/codex-home",
    "/private/tmp/controller/run/agent-io"
  ]);
  assert.ok(policy.deniedReadPaths.includes("/repo/benchmarks/plugin-vs-v1/tasks"));
  assert.ok(policy.deniedReadPaths.includes("/repo/benchmarks/plugin-vs-v1/results"));
  assert.ok(policy.deniedReadPaths.includes("/private/tmp/controller/controller.json"));
  assert.ok(policy.deniedReadPaths.includes("/repo/.git"));
  assert.ok(policy.deniedReadPaths.includes("/private/hidden"));
  assert.ok(!policy.writablePaths.includes("/private/tmp/controller/run"));
});

test("Codex JSONL parsing captures session and usage", () => {
  const events = parseCodexJsonl([
    JSON.stringify({ type: "thread.started", thread_id: "abc" }),
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 10,
        cached_input_tokens: 3,
        output_tokens: 4,
        reasoning_tokens: 2
      }
    })
  ].join("\n"));
  assert.equal(findSessionId(events), "abc");
  assert.deepEqual(collectCodexUsage(events), {
    input_tokens: 10,
    cached_input_tokens: 3,
    output_tokens: 4,
    reasoning_tokens: 2
  });
});

test("Codex rollout token_count provides durable cumulative usage", () => {
  const home = mkdtempSync(join(tmpdir(), "apex-benchmark-rollout-"));
  const sessionId = "session-rollout-123";
  const directory = join(home, "sessions", "2026", "08", "19");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `rollout-${sessionId}.jsonl`);
  writeFileSync(path, [
    JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 80,
            output_tokens: 20,
            reasoning_output_tokens: 5
          }
        }
      }
    }),
    JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 250,
            cached_input_tokens: 200,
            output_tokens: 40,
            reasoning_output_tokens: 9
          }
        }
      }
    })
  ].join("\n"));
  assert.deepEqual(collectCodexRolloutUsage(home, sessionId), {
    path,
    usage: {
      input_tokens: 250,
      cached_input_tokens: 200,
      output_tokens: 40,
      reasoning_tokens: 9
    }
  });
});

test("benchmark cohort records effective provider, version, effort, and stable config", () => {
  const firstHome = benchmarkHome("first");
  const secondHome = benchmarkHome("second");
  const first = inspectBenchmarkCohort({
    codexHome: firstHome,
    model: "cli-model",
    profile: "formal",
    runnerVersion: "codex-cli 1.2.3"
  });
  const second = inspectBenchmarkCohort({
    codexHome: secondHome,
    model: "cli-model",
    profile: "formal",
    runnerVersion: "codex-cli 1.2.3"
  });
  assert.deepEqual(first, second);
  assert.equal(first.model, "cli-model");
  assert.equal(first.provider, "formal-provider");
  assert.equal(first.reasoning_effort, "xhigh");
  assert.equal(first.runner_version, "codex-cli 1.2.3");
  assert.match(first.execution_config_fingerprint, /^[a-f0-9]{64}$/);

  const medium = inspectBenchmarkCohort({
    codexHome: firstHome,
    model: "cli-model",
    profile: "formal",
    reasoningEffort: "medium",
    runnerVersion: "codex-cli 1.2.3"
  });
  assert.equal(medium.reasoning_effort, "medium");
  assert.notEqual(medium.execution_config_fingerprint, first.execution_config_fingerprint);

  writeFileSync(join(secondHome, "provider-modes", "state.json"), "{\"mode\":\"changed\"}\n");
  const runtimeStateChanged = inspectBenchmarkCohort({
    codexHome: secondHome,
    model: "cli-model",
    profile: "formal",
    runnerVersion: "codex-cli 1.2.3"
  });
  assert.equal(
    runtimeStateChanged.execution_config_fingerprint,
    first.execution_config_fingerprint
  );

  writeFileSync(
    join(secondHome, "provider-modes", "llm-proxy-models.json"),
    "{\"models\":[\"changed\"]}\n"
  );
  const drifted = inspectBenchmarkCohort({
    codexHome: secondHome,
    model: "cli-model",
    profile: "formal",
    runnerVersion: "codex-cli 1.2.3"
  });
  assert.notEqual(drifted.execution_config_fingerprint, first.execution_config_fingerprint);
});

test("plugin marketplace config does not affect the execution cohort", () => {
  const firstRun = benchmarkHome("plugin-config");
  const before = inspectBenchmarkCohort({
    codexHome: firstRun,
    model: "cli-model",
    profile: "formal",
    runnerVersion: "codex-cli 1.2.3"
  });
  writeFileSync(
    join(firstRun, "config.toml"),
    `${readFileSync(join(firstRun, "config.toml"), "utf8")}\n[plugins.apex-forge-v2]\nenabled = true\n`
  );
  const pluginChanged = inspectBenchmarkCohort({
    codexHome: firstRun,
    model: "cli-model",
    profile: "formal",
    runnerVersion: "codex-cli 1.2.3"
  });
  assert.equal(
    pluginChanged.execution_config_fingerprint,
    before.execution_config_fingerprint
  );

  writeFileSync(
    join(firstRun, "config.toml"),
    `${readFileSync(join(firstRun, "config.toml"), "utf8")}\n[model_providers.formal-provider]\nbase_url = "https://changed.example"\n`
  );
  const providerChanged = inspectBenchmarkCohort({
    codexHome: firstRun,
    model: "cli-model",
    profile: "formal",
    runnerVersion: "codex-cli 1.2.3"
  });
  assert.notEqual(
    providerChanged.execution_config_fingerprint,
    before.execution_config_fingerprint
  );
});

function benchmarkHome(label) {
  const home = mkdtempSync(join(tmpdir(), `apex-benchmark-cohort-${label}-`));
  mkdirSync(join(home, "provider-modes"), { recursive: true });
  writeFileSync(join(home, "config.toml"), [
    `model = "default-model"`,
    `model_provider = "default-provider"`,
    `model_reasoning_effort = "high"`,
    `[profiles.formal]`,
    `model_provider = "formal-provider"`,
    `model_reasoning_effort = "xhigh"`,
    `model_catalog_json = "${join(home, "provider-modes", "models.json")}"`
  ].join("\n"));
  writeFileSync(join(home, "provider-modes", "state.json"), "{\"mode\":\"formal\"}\n");
  writeFileSync(join(home, "provider-modes", "llm-proxy-models.json"), "{}\n");
  return home;
}
