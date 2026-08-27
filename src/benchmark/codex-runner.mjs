import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { spawnCapabilityProcess } from "../core/capability-sandbox.mjs";
import { providerSecretPaths } from "../executors/secret-boundaries.mjs";
import { benchmarkEnvironment } from "./environment.mjs";

export function executeCodexBenchmarkRun({
  mode,
  workspace,
  runRoot,
  task,
  candidateRoot,
  sessionId = null,
  timeoutMs = 30 * 60 * 1000,
  model = process.env.APEX_BENCHMARK_MODEL || null,
  profile = process.env.APEX_BENCHMARK_CODEX_PROFILE || null,
  reasoningEffort = process.env.APEX_BENCHMARK_REASONING_EFFORT || null,
  pluginBootstrap = null,
  v1SkillPath = null,
  benchmarkRoot = null,
  controllerRoot = null,
  repositoryRoot = null,
  deniedReadPaths = []
}) {
  const codexHome = prepareBenchmarkCodexHome({
    runRoot,
    candidateRoot,
    installPlugin: mode === "plugin-kernel"
  });
  const cohort = inspectBenchmarkCohort({
    codexHome,
    model,
    profile,
    reasoningEffort
  });
  const outputSchemaPath = mode === "raw-agent"
    ? join(repositoryRoot || process.cwd(), "schemas", "benchmark-agent-output.schema.json")
    : join(
        candidateRoot,
        "plugins",
        "codex",
        "apex-forge-v2",
        "runtime",
        "schemas",
        "benchmark-agent-output.schema.json"
      );
  const processNumber = nextProcessNumber(runRoot);
  const agentIoRoot = join(runRoot, "agent-io");
  mkdirSync(agentIoRoot, { recursive: true });
  const outputPath = join(agentIoRoot, `agent-output-${processNumber}.json`);
  const stdoutPath = join(runRoot, `process-${processNumber}.jsonl`);
  const stderrPath = join(runRoot, `process-${processNumber}.stderr.log`);
  const executionWorkspace = pluginBootstrap?.fast_path?.workspace_path || workspace;
  const prompt = sessionId
    ? buildResumePrompt(task, mode, pluginBootstrap)
    : buildBenchmarkPrompt({
        task,
        mode,
        workspace,
        candidateRoot,
        runRoot,
        pluginBootstrap,
        v1SkillPath
      });
  const args = buildBenchmarkCodexArgs({
    mode,
    workspace: executionWorkspace,
    outputSchemaPath,
    outputPath,
    sessionId,
    model,
    profile,
    reasoningEffort
  });
  const sandboxPolicy = benchmarkSandboxPolicy({
    workspace: executionWorkspace,
    runRoot,
    codexHome,
    benchmarkRoot,
    controllerRoot,
    repositoryRoot,
    candidateRoot,
    extraDeniedReadPaths: [
      ...deniedReadPaths,
      ...(mode === "raw-agent" ? [candidateRoot] : [])
    ]
  });
  const result = spawnCapabilityProcess("codex", args, {
    workspaceDir: executionWorkspace,
    input: prompt,
    timeoutMs,
    minFreeBytes: positiveInteger(
      process.env.APEX_BENCHMARK_MIN_FREE_BYTES,
      150 * 1024 * 1024 * 1024
    ),
    maxDiskGrowthBytes: positiveInteger(
      process.env.APEX_BENCHMARK_MAX_DISK_GROWTH_BYTES,
      1024 * 1024 * 1024
    ),
    maxWorkspaceGrowthBytes: positiveInteger(
      process.env.APEX_BENCHMARK_MAX_WORKSPACE_GROWTH_BYTES,
      1024 * 1024 * 1024
    ),
    maxOutputBytes: positiveInteger(
      process.env.APEX_BENCHMARK_MAX_OUTPUT_BYTES,
      16 * 1024 * 1024
    ),
    network: true,
    writablePaths: sandboxPolicy.writablePaths,
    deniedReadPaths: sandboxPolicy.deniedReadPaths,
    allowedSecretNames: ["OPENAI_API_KEY", "FUTU_LLM_PROXY_API_KEY"],
    env: {
      ...benchmarkEnvironment(process.env),
      CODEX_HOME: codexHome,
      APEX_BENCHMARK_MODE: mode,
      TMPDIR: process.platform === "darwin" ? "/private/tmp" : process.env.TMPDIR,
      APEX_V2_VERIFY_TMPDIR: process.platform === "darwin"
        ? "/private/tmp"
        : process.env.TMPDIR
    }
  });
  writeFileSync(stdoutPath, result.stdout || "");
  writeFileSync(stderrPath, result.stderr || "");
  const events = parseCodexJsonl(result.stdout || "");
  const resolvedSessionId = sessionId || findSessionId(events);
  const rolloutUsage = resolvedSessionId
    ? collectCodexRolloutUsage(codexHome, resolvedSessionId)
    : null;
  const output = readAgentOutput(outputPath);
  return {
    exit_code: result.status ?? 1,
    signal: result.signal || null,
    timed_out: Boolean(result.timed_out || result.error?.code === "ETIMEDOUT"),
    duration_ms: result.duration_ms || 0,
    session_id: resolvedSessionId,
    usage: rolloutUsage?.usage || collectCodexUsage(events),
    usage_source: rolloutUsage ? "codex-rollout-total" : "stdout-jsonl",
    output,
    output_path: outputPath,
    raw_logs: [
      stdoutPath,
      stderrPath,
      ...(rolloutUsage ? [rolloutUsage.path] : [])
    ],
    cohort,
    command: ["codex", ...args.slice(0, -1), "<prompt>"].join(" ")
  };
}

export function benchmarkSandboxPolicy({
  workspace,
  runRoot,
  codexHome,
  benchmarkRoot = null,
  controllerRoot = null,
  repositoryRoot = null,
  candidateRoot = null,
  extraDeniedReadPaths = []
}) {
  const denied = [
    ...providerSecretPaths(),
    ...(benchmarkRoot ? [
      join(benchmarkRoot, "tasks"),
      join(benchmarkRoot, "results"),
      join(benchmarkRoot, "evidence"),
      join(benchmarkRoot, "benchmark-plan.json"),
      join(benchmarkRoot, "results-manifest.json"),
      join(benchmarkRoot, "latest-evaluation.json"),
      join(benchmarkRoot, "task-preflight.json"),
      join(benchmarkRoot, "workspaces", "base")
    ] : []),
    ...(controllerRoot ? [join(controllerRoot, "controller.json")] : []),
    ...(repositoryRoot ? [
      join(repositoryRoot, ".git"),
      join(dirname(repositoryRoot), "benchmark-runs")
    ] : []),
    ...(candidateRoot ? [join(candidateRoot, "source.tar")] : []),
    ...extraDeniedReadPaths
  ].filter(Boolean).map((path) => resolve(path));
  return {
    writablePaths: [
      resolve(codexHome),
      resolve(runRoot, "agent-io")
    ],
    deniedReadPaths: [...new Set(denied)].filter((path) =>
      path !== resolve(workspace)
      && !resolve(workspace).startsWith(`${path}/`)
    )
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildBenchmarkCodexArgs({
  mode,
  workspace,
  outputSchemaPath,
  outputPath,
  sessionId,
  model,
  profile,
  reasoningEffort = null
}) {
  const common = [
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    "--json",
    "--output-schema",
    outputSchemaPath,
    "-o",
    outputPath
  ];
  if (mode !== "plugin-kernel") common.unshift("--disable", "plugins");
  if (model) common.push("-m", model);
  if (reasoningEffort) {
    common.push("-c", `model_reasoning_effort="${reasoningEffort}"`);
  }
  if (profile && !sessionId) common.push("-p", profile);
  if (sessionId) {
    return ["exec", "resume", ...common, sessionId, "-"];
  }
  return ["exec", ...common, "-C", workspace, "-"];
}

export function buildBenchmarkPrompt({
  task,
  mode,
  workspace = "<project-dir>",
  candidateRoot,
  runRoot,
  pluginBootstrap = null,
  v1SkillPath = null
}) {
  const common = [
    "Complete the following software engineering task in the current workspace.",
    "Do not commit, push, or read benchmark controller files outside the workspace.",
    "Do not inspect hidden acceptance checks. Use the public acceptance commands.",
    `Task: ${task.title}`,
    task.instructions,
    `Allowed source files: ${task.affected_files.join(", ")}`,
    `Public acceptance commands:\n${task.acceptance_commands.map((command) => `- ${command}`).join("\n")}`,
    "Set structured output field `review` to null unless the Plugin fast path below requires a typed review object.",
    "Finish with the required structured output and report only tests actually executed."
  ];
  if (mode === "v1-skill") {
    common.unshift(
      `Read and follow the frozen Apex Forge V1 skill at ${v1SkillPath || join(runRoot, "apex-forge-v1-SKILL.md")}.`
    );
  } else if (mode === "cli-kernel") {
    common.unshift(
      "Use Apex Forge V2 Kernel directly, without Agent Plugin skills.",
      `Kernel bridge: ${join(candidateRoot, "plugins", "codex", "apex-forge-v2", "scripts", "apex-host.mjs")}`,
      pluginBootstrap?.run_id
        ? `The controller already initialized run ${pluginBootstrap.run_id}. Resume it; do not create another intake, roadmap node, or run.`
        : "Initialize or resume durable state.",
      "Use governed workspaces, verify, review, integrate, and close the run before claiming PASS."
    );
  } else if (mode === "plugin-kernel") {
    if (pluginBootstrap?.fast_path) {
      common.unshift(
        "Use the Apex Forge V2 Plugin fast path.",
        "The Host Plugin already claimed the single quick implementation action and set the current directory to its action-owned workspace.",
        "Do not read plugin Skill files, inspect `.apex-v2`, invoke `apex-host`, calculate candidate digests, or perform merge/closeout commands.",
        `Modify only: ${pluginBootstrap.fast_path.write_scope.join(", ")}.`,
        `Run exactly these public checks after implementation:\n${pluginBootstrap.fast_path.verification_commands.map((command) => `- ${command}`).join("\n")}`,
        "The Host Adapter will capture the patch, bind your review to the candidate, verify, merge, and close the durable run after your structured output.",
        "For a PASS, include `review` with specific claims, acceptance mappings, findings, residual risks, and merge_posture=`approve`."
      );
    } else if (pluginBootstrap?.entry_action) {
      const bridge = join(
        candidateRoot,
        "plugins",
        "codex",
        "apex-forge-v2",
        "scripts",
        "apex-host.mjs"
      );
      const first = pluginBootstrap.entry_action;
      common.unshift(
        "The benchmark controller already initialized Apex Forge V2 and claimed the first action. No plugin tool invocation is needed.",
        `Kernel bridge: ${bridge}`,
        "Do not locate or read plugin files, CLI help, runtime source, or JSON schemas. Do not call bare `actions` or `host submit --help`.",
        "Use each next_action.submission_contract as the authoritative evidence shape.",
        "Submit one compact action-result JSON file. The Kernel supplies objective, candidate digest, source refs, acceptance mapping, versions, and timestamps.",
        "If capability_enforcement is shadow, leave capability_outputs empty unless you actually executed that capability; never fabricate capability evidence.",
        "Use `host submit-current`; do not manually pass worker-id or claim-token.",
        "Write temporary evidence files under /private/tmp, never inside the action workspace.",
        "The initial action is plan-only: do not edit source files before submitting it. When drain returns an implement action, change into exactly next_action.workspace before editing.",
        "For every Kernel command, always copy the absolute project_dir from submission_contract.required_cli_values; never substitute the current `$PWD` after entering an ActionWorkspace.",
        "After each successful host submit, call `project drain --project-dir <original-workspace> --host-id codex-host --compact` and follow only the returned next_action.",
        `First submit command template:\nnode ${JSON.stringify(bridge)} host submit-current --project-dir ${JSON.stringify(workspace)} --host-id codex-host --action-result-file ${JSON.stringify(first.submission_contract.required_cli_values.evidence_file)}`,
        `Initial action:\n${JSON.stringify(first, null, 2)}`
      );
    } else {
      common.unshift(
        "Use the installed Apex Forge V2 Agent Plugin to implement this requirement end-to-end.",
        "Operate through the plugin workflow; do not bypass the Kernel with direct ungoverned edits.",
        "The Host Plugin has already initialized exactly one durable intake/run for this task. Resume it; do not create another intake, roadmap node, or run.",
        "If the Kernel generates plan profile `quick`, preserve the one-patch quick route and use consolidated project ticks instead of expanding it into the full workflow."
      );
    }
  } else if (mode === "raw-agent") {
    common.unshift(
      "Work as a plain coding agent with no Apex Forge workflow.",
      "Do not load or invoke any plugin, V1 skill, Apex Forge Kernel, apex-host bridge, or durable workflow command.",
      "Use only the public task description and public acceptance commands below.",
      "Do not inspect hidden checks, benchmark controller files, candidate files, or any repository outside the current workspace."
    );
  } else {
    throw new Error(`unknown benchmark mode: ${mode}`);
  }
  return common.join("\n\n");
}

export function buildResumePrompt(task, mode, pluginBootstrap = null) {
  const prompt = [
    `Resume the interrupted ${mode} benchmark task: ${task.title}.`,
    "Inspect the current workspace and durable state, continue from existing evidence,",
    "run the public acceptance commands, and finish with the required structured output.",
    "Do not restart completed work or discard valid prior progress."
  ];
  if (pluginBootstrap?.fast_path) {
    prompt.push(
      "You are in the previously claimed ActionWorkspace. Do not invoke Apex CLI commands;",
      "finish implementation/tests and include the typed `review` object so the Host Adapter can close the run."
    );
  }
  return prompt.join(" ");
}

export function parseCodexJsonl(value) {
  const events = [];
  for (const line of String(value).split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {}
  }
  return events;
}

export function collectCodexRolloutUsage(codexHome, sessionId) {
  const sessionsRoot = join(codexHome, "sessions");
  if (!sessionId || !existsSync(sessionsRoot)) return null;
  const rolloutPath = findFile(sessionsRoot, (path) =>
    basename(path).includes(sessionId) && path.endsWith(".jsonl")
  );
  if (!rolloutPath) return null;
  let latest = null;
  for (const line of readFileSync(rolloutPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value.type !== "event_msg" || value.payload?.type !== "token_count") continue;
      const usage = value.payload?.info?.total_token_usage;
      if (usage) latest = usage;
    } catch {}
  }
  if (!latest) return null;
  return {
    path: rolloutPath,
    usage: {
      input_tokens: number(latest.input_tokens),
      cached_input_tokens: number(latest.cached_input_tokens),
      output_tokens: number(latest.output_tokens),
      reasoning_tokens: number(latest.reasoning_output_tokens)
    }
  };
}

function findFile(root, predicate) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(path, predicate);
      if (nested) return nested;
    } else if (entry.isFile() && predicate(path)) {
      return path;
    }
  }
  return null;
}

export function findSessionId(events) {
  for (const event of events) {
    const value = event.thread_id
      || event.session_id
      || event.thread?.id
      || event.session?.id;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function collectCodexUsage(events) {
  const usage = {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0
  };
  let found = false;
  for (const event of events) {
    const candidate = event.usage || event.turn?.usage || event.response?.usage;
    if (!candidate || typeof candidate !== "object") continue;
    found = true;
    usage.input_tokens += number(candidate.input_tokens);
    usage.cached_input_tokens += number(candidate.cached_input_tokens);
    usage.output_tokens += number(candidate.output_tokens);
    usage.reasoning_tokens += number(candidate.reasoning_tokens);
  }
  return found ? usage : null;
}

function prepareBenchmarkCodexHome({ runRoot, candidateRoot, installPlugin }) {
  const liveHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const controllerRoot = dirname(dirname(runRoot));
  const snapshotHome = join(controllerRoot, "codex-config");
  const targetHome = join(runRoot, "codex-home");
  if (!existsSync(join(snapshotHome, "config.toml"))) {
    mkdirSync(snapshotHome, { recursive: true });
    synchronizeBenchmarkCodexConfiguration(liveHome, snapshotHome);
  }
  mkdirSync(targetHome, { recursive: true });
  synchronizeBenchmarkCodexConfiguration(snapshotHome, targetHome);
  if (installPlugin) installCandidatePlugin({ targetHome, runRoot, candidateRoot });
  return targetHome;
}

export function inspectBenchmarkCohort({
  codexHome,
  model,
  profile = null,
  reasoningEffort = null,
  runnerVersion = null
}) {
  const config = existsSync(join(codexHome, "config.toml"))
    ? readFileSync(join(codexHome, "config.toml"), "utf8")
    : "";
  const values = effectiveCodexConfig(config, profile);
  const effectiveValues = {
    ...values,
    model_reasoning_effort: reasoningEffort || values.model_reasoning_effort
  };
  const resolvedRunnerVersion = runnerVersion || readCodexVersion(codexHome);
  return {
    model: model || values.model || "",
    provider: values.model_provider || "",
    reasoning_effort: effectiveValues.model_reasoning_effort || "default",
    runner_version: resolvedRunnerVersion,
    execution_config_fingerprint: codexConfigFingerprint(
      codexHome,
      effectiveValues
    )
  };
}

export function synchronizeBenchmarkCodexConfiguration(sourceHome, targetHome) {
  const sourceProviderModes = join(sourceHome, "provider-modes");
  const targetProviderModes = join(targetHome, "provider-modes");
  mkdirSync(targetProviderModes, { recursive: true });
  for (const file of ["config.toml", "auth.json"]) {
    const source = join(sourceHome, file);
    if (!existsSync(source)) continue;
    const target = join(targetHome, file);
    if (file.endsWith(".toml")) {
      writeFileSync(
        target,
        readFileSync(source, "utf8").replaceAll(sourceProviderModes, targetProviderModes)
      );
    } else {
      copyFileSync(source, target);
    }
    chmodSync(target, 0o600);
  }
  for (const file of ["state.json", "azure-models.json", "llm-proxy-models.json"]) {
    const source = join(sourceProviderModes, file);
    if (!existsSync(source)) continue;
    const target = join(targetProviderModes, file);
    copyFileSync(source, target);
    chmodSync(target, 0o600);
  }
}

function effectiveCodexConfig(config, profile) {
  const root = {};
  const selected = {};
  const profileSections = profile
    ? new Set([`profiles.${profile}`, `profiles."${profile}"`, `profiles.'${profile}'`])
    : new Set();
  let section = "";
  for (const rawLine of config.split("\n")) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const valueMatch = line.match(
      /^(model|model_provider|model_reasoning_effort|model_catalog_json)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))/
    );
    if (!valueMatch) continue;
    const value = valueMatch[2] ?? valueMatch[3] ?? valueMatch[4] ?? "";
    if (section === "") root[valueMatch[1]] = value;
    if (profileSections.has(section)) selected[valueMatch[1]] = value;
  }
  return { ...root, ...selected };
}

function readCodexVersion(codexHome) {
  const result = spawnSync("codex", ["--version"], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome }
  });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function codexConfigFingerprint(codexHome, values) {
  const hash = createHash("sha256");
  const configPath = join(codexHome, "config.toml");
  const config = existsSync(configPath)
    ? readFileSync(configPath, "utf8")
    : "";
  hash.update(JSON.stringify({
    model: values.model || "",
    model_provider: values.model_provider || "",
    model_reasoning_effort: values.model_reasoning_effort || "default",
    model_catalog_json: String(values.model_catalog_json || "")
      .replaceAll(codexHome, "<CODEX_HOME>"),
    provider_section: providerConfigSection(
      config,
      values.model_provider || "",
      codexHome
    ),
    benchmark_scheduler_version: process.env.APEX_BENCHMARK_SCHEDULER_VERSION || "serial-v1",
    benchmark_max_workers: process.env.APEX_BENCHMARK_MAX_WORKERS || "1"
  })).update("\0");
  for (const path of [
    "provider-modes/azure-models.json",
    "provider-modes/llm-proxy-models.json"
  ]) {
    const target = join(codexHome, path);
    const content = existsSync(target)
      ? readFileSync(target, "utf8").replaceAll(codexHome, "<CODEX_HOME>")
      : "<missing>";
    hash.update(path).update("\0").update(content).update("\0");
  }
  return hash.digest("hex");
}

function providerConfigSection(config, provider, codexHome) {
  if (!provider) return [];
  const sections = new Set([
    `model_providers.${provider}`,
    `model_providers."${provider}"`,
    `model_providers.'${provider}'`
  ]);
  const lines = [];
  let section = "";
  for (const rawLine of config.split("\n")) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    if (sections.has(section) && line && !line.startsWith("#")) {
      lines.push(line.replaceAll(codexHome, "<CODEX_HOME>"));
    }
  }
  return lines;
}

function installCandidatePlugin({ targetHome, runRoot, candidateRoot }) {
  const marker = join(targetHome, ".apex-benchmark-plugin-installed");
  if (existsSync(marker)) return false;
  const marketplaceRoot = join(runRoot, "marketplace");
  const pluginRoot = join(marketplaceRoot, "plugin");
  mkdirSync(join(marketplaceRoot, ".agents", "plugins"), { recursive: true });
  cpSync(
    join(candidateRoot, "plugins", "codex", "apex-forge-v2"),
    pluginRoot,
    { recursive: true }
  );
  writeFileSync(
    join(marketplaceRoot, ".agents", "plugins", "marketplace.json"),
    `${JSON.stringify({
      name: "apex-benchmark",
      plugins: [{
        name: "apex-forge-v2",
        source: { source: "local", path: "./plugin" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }
      }]
    }, null, 2)}\n`
  );
  runCodexPlugin(targetHome, ["plugin", "marketplace", "add", marketplaceRoot, "--json"]);
  runCodexPlugin(targetHome, ["plugin", "add", "apex-forge-v2@apex-benchmark", "--json"]);
  writeFileSync(marker, `${candidateRoot}\n`);
  return true;
}

function runCodexPlugin(codexHome, args) {
  const result = spawnSync("codex", args, {
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_HOME: codexHome
    }
  });
  if (result.status !== 0) {
    throw new Error(`codex ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function nextProcessNumber(runRoot) {
  let number = 1;
  while (existsSync(join(runRoot, `process-${number}.jsonl`))) number += 1;
  return number;
}

function readAgentOutput(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
