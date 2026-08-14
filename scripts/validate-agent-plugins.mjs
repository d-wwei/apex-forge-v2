import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const pluginValidator = process.env.CODEX_PLUGIN_VALIDATOR
  || join(codexHome, "skills", ".system", "plugin-creator", "scripts", "validate_plugin.py");
const codexPlugin = join(repoRoot, "plugins", "codex", "apex-forge-v2");
const claudePlugin = join(repoRoot, "plugins", "claude-code", "apex-forge-v2");
const evidencePath = join(
  repoRoot,
  ".product-audit",
  "plugin-direction-2026-08-14",
  "artifacts",
  "plugin-validation.json"
);

const checks = [
  run("codex-plugin-validator", "python3", [
    pluginValidator,
    codexPlugin
  ]),
  run("claude-plugin-validator", "claude", ["plugin", "validate", claudePlugin]),
  run("codex-plugin-installed", "codex", ["plugin", "list"]),
  run("claude-plugin-installed", "claude", ["plugin", "list"]),
  run("node-runtime", "node", ["--version"])
];

const installedCheck = checks.find((check) => check.id === "codex-plugin-installed");
installedCheck.status = installedCheck.status === "PASS" && installedCheck.stdout.includes("apex-forge-v2@apex-forge-local")
  ? "PASS"
  : "FAIL";
const claudeInstalledCheck = checks.find((check) => check.id === "claude-plugin-installed");
claudeInstalledCheck.status = claudeInstalledCheck.status === "PASS" && claudeInstalledCheck.stdout.includes("apex-forge-v2@apex-forge-local")
  ? "PASS"
  : "FAIL";

const report = {
  schema_version: "v0",
  generated_at: new Date().toISOString(),
  status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
  checks
};
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;

function run(id, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  return {
    id,
    status: result.status === 0 ? "PASS" : "FAIL",
    exit_code: result.status ?? 1,
    stdout: String(result.stdout || "").slice(-4000),
    stderr: String(result.stderr || result.error?.message || "").slice(-4000)
  };
}
