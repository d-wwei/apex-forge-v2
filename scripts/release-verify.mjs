import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const listOnly = process.argv.includes("--list");
const reportPath = join(repoRoot, ".apex-v2", "releases", "latest-verification.json");
const releaseCandidate = readReleaseCandidate();
const candidateRoot = releaseCandidate?.candidate_root || join(repoRoot, ".missing-candidate");
const codexPluginValidator = process.env.CODEX_PLUGIN_VALIDATOR
  || join(
    process.env.CODEX_HOME || join(homedir(), ".codex"),
    "skills",
    ".system",
    "plugin-creator",
    "scripts",
    "validate_plugin.py"
  );

const steps = [
  commandStep("clean-source", "npm", ["run", "release:validate-candidate"]),
  commandStep("full-tests", "npm", ["test"]),
  commandStep("strict-validate", "npm", ["run", "validate"]),
  commandStep("contract-validation", "npm", ["run", "check:schemas"]),
  commandStep("full-reconcile", process.execPath, [
    "src/apex-v2.mjs", "project", "reconcile", "--project", ".", "--apply"
  ], {
    evaluate: (result) => {
      if (result.status !== 0) return false;
      try {
        const value = JSON.parse(result.stdout);
        return ["CONSISTENT", "REPAIRED"].includes(value.status)
          && value.post_check?.issues?.length === 0
          && value.post_check?.operational_state?.state_hash
          && value.post_check?.event_replay?.operational_state_hash
            === value.post_check?.operational_state?.state_hash;
      } catch {
        return false;
      }
    }
  }),
  commandStep("host-workspace-adversarial", process.execPath, [
    "--test", "tests/action-workspace.test.mjs"
  ]),
  commandStep("candidate-mutation", process.execPath, [
    "--test", "tests/candidate-integrity.test.mjs"
  ]),
  commandStep("crash-recovery", process.execPath, [
    "--test", "tests/project-transaction.test.mjs", "tests/store-atomicity.test.mjs"
  ]),
  commandStep("executor-host-conformance", process.execPath, [
    "--test",
    "tests/worker-executor-conformance.test.mjs",
    "tests/extension-boundaries.test.mjs",
    "tests/host-adapters.test.mjs"
  ]),
  commandStep("candidate-codex-validator", "python3", [
    codexPluginValidator,
    join(candidateRoot, "plugins", "codex", "apex-forge-v2")
  ]),
  commandStep("candidate-claude-validator", "claude", [
    "plugin",
    "validate",
    join(candidateRoot, "plugins", "claude-code", "apex-forge-v2")
  ]),
  commandStep("native-plugin-lifecycle", process.execPath, [
    "--test", "tests/plugin-native-lifecycle.test.mjs"
  ]),
  commandStep("dependency-audit", "npm", ["audit", "--omit=dev", "--audit-level=low"]),
  commandStep("plugin-build", "npm", ["run", "release:candidate"]),
  commandStep("plugin-provenance", "npm", [
    "run", "release:validate-candidate", "--", "--bundle-only"
  ]),
  commandStep("throughput-architecture-gate", "npm", [
    "run", "benchmark:throughput"
  ]),
  commandStep("capability-gate", "npm", ["run", "benchmark:capabilities"]),
  commandStep("product-gate", "npm", ["run", "benchmark:plugin"])
];

if (listOnly) {
  console.log(JSON.stringify({
    schema_version: "v0",
    steps: steps.map((step) => ({
      id: step.id,
      command: [step.command, ...step.args].join(" "),
      timeout_ms: step.timeoutMs
    }))
  }, null, 2));
  process.exit(0);
}

const startedAt = new Date().toISOString();
const results = [];
for (const step of steps) {
  const started = Date.now();
  const execution = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: step.timeoutMs,
    killSignal: "SIGTERM",
    env: {
      ...process.env,
      APEX_RELEASE_VERIFY: "1",
      APEX_EXPECT_CANDIDATE_DIGEST: releaseCandidate?.release_candidate_digest || "",
      APEX_RELEASE_CANDIDATE_ROOT: releaseCandidate?.candidate_root || ""
    }
  });
  const passed = step.evaluate(execution);
  results.push({
    id: step.id,
    status: passed ? "PASS" : "FAIL",
    command: [step.command, ...step.args].join(" "),
    exit_code: execution.status ?? 1,
    duration_ms: Date.now() - started,
    stdout_tail: tail(execution.stdout),
    stderr_tail: tail(execution.stderr || execution.error?.message || "")
  });
}

const report = {
  schema_version: "v0",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  status: results.every((result) => result.status === "PASS") ? "PASS" : "FAIL",
  release_version: readReleaseVersion(),
  candidate_digest: readBenchmarkCandidateDigest(),
  steps: results
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;

function commandStep(id, command, args, options = {}) {
  return {
    id,
    command,
    args,
    timeoutMs: options.timeoutMs || 30 * 60 * 1000,
    evaluate: options.evaluate || ((result) => result.status === 0)
  };
}

function readReleaseVersion() {
  try {
    return JSON.parse(readFileSync(
      join(repoRoot, "plugins", "codex", "apex-forge-v2", ".codex-plugin", "plugin.json"),
      "utf8"
    )).version;
  } catch {
    return null;
  }
}

function readReleaseCandidate() {
  const latestPath = join(repoRoot, ".apex-v2", "releases", "latest-candidate.json");
  if (!existsSync(latestPath)) return null;
  try {
    const latest = JSON.parse(readFileSync(latestPath, "utf8"));
    const candidateRoot = resolve(repoRoot, latest.candidate_path);
    const manifest = JSON.parse(readFileSync(join(candidateRoot, "manifest.json"), "utf8"));
    return {
      release_candidate_digest: manifest.release_candidate_digest,
      candidate_root: candidateRoot
    };
  } catch {
    return null;
  }
}

function readBenchmarkCandidateDigest() {
  const path = join(repoRoot, "benchmarks", "plugin-vs-v1", "latest-evaluation.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")).candidate_digest || null;
  } catch {
    return null;
  }
}

function tail(value, max = 6000) {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
}
