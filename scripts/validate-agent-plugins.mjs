import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const pluginValidator = process.env.CODEX_PLUGIN_VALIDATOR
  || join(codexHome, "skills", ".system", "plugin-creator", "scripts", "validate_plugin.py");
const codexPlugin = join(repoRoot, "plugins", "codex", "apex-forge-v2");
const claudePlugin = join(repoRoot, "plugins", "claude-code", "apex-forge-v2");
const codexManifest = JSON.parse(readFileSync(join(codexPlugin, ".codex-plugin", "plugin.json"), "utf8"));
const claudeManifest = JSON.parse(readFileSync(join(claudePlugin, ".claude-plugin", "plugin.json"), "utf8"));
const includeCompatibilityAliases = ["1", "true"].includes(
  String(process.env.APEX_PLUGIN_COMPAT_ALIASES || "").toLowerCase()
);
const expectedSkillNames = includeCompatibilityAliases
  ? [
      "apex-forge-execute",
      "apex-forge-plan",
      "apex-forge-review",
      "apex-forge-ship",
      "apex-forge-status",
      "using-apex-forge"
    ]
  : ["using-apex-forge"];
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
  runClaudeInstalled(),
  run("node-runtime", "node", ["--version"]),
  verifyPackage("codex-package-provenance", codexPlugin, codexManifest.version),
  verifyPackage("claude-package-provenance", claudePlugin, claudeManifest.version)
];

const installedCheck = checks.find((check) => check.id === "codex-plugin-installed");
installedCheck.status = installedCheck.status === "PASS"
  && installedCheck.stdout.includes("apex-forge-v2@apex-forge-local")
  && installedCheck.stdout.includes(codexManifest.version)
  && installedCheck.stdout.includes(codexPlugin)
  ? "PASS"
  : "FAIL";
const claudeInstalledCheck = checks.find((check) => check.id === "claude-plugin-installed");
if (claudeInstalledCheck.status === "PASS") {
  try {
    const installed = JSON.parse(claudeInstalledCheck.stdout)
      .find((item) => item.id === "apex-forge-v2@apex-forge-local");
    claudeInstalledCheck.status = installed
      && installed.version === claudeManifest.version
      && installed.projectPath === repoRoot
      && verifyInstalledRuntime(installed.installPath, claudePlugin)
      ? "PASS"
      : "FAIL";
  } catch {
    claudeInstalledCheck.status = "FAIL";
  }
}

const codexCache = join(
  codexHome,
  "plugins",
  "cache",
  "apex-forge-local",
  "apex-forge-v2",
  codexManifest.version
);
checks.push({
  id: "codex-installed-runtime",
  status: verifyInstalledRuntime(codexCache, codexPlugin) ? "PASS" : "FAIL",
  exit_code: verifyInstalledRuntime(codexCache, codexPlugin) ? 0 : 1,
  stdout: codexCache,
  stderr: ""
});

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

function runClaudeInstalled() {
  const result = spawnSync("claude", ["plugin", "list", "--json"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  let selected = [];
  try {
    selected = JSON.parse(String(result.stdout || "[]"))
      .filter((item) => item.id === "apex-forge-v2@apex-forge-local");
  } catch {}
  return {
    id: "claude-plugin-installed",
    status: result.status === 0 ? "PASS" : "FAIL",
    exit_code: result.status ?? 1,
    stdout: JSON.stringify(selected),
    stderr: String(result.stderr || result.error?.message || "").slice(-4000)
  };
}

function verifyPackage(id, pluginPath, version) {
  const errors = [];
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES", "SBOM.json", "PROVENANCE.json", "CHECKSUMS.sha256"]) {
    if (!existsSync(join(pluginPath, file))) errors.push(`missing ${file}`);
  }
  verifySkillSurface(pluginPath, errors);
  const runtimePath = join(pluginPath, "runtime", "runtime.json");
  if (!existsSync(runtimePath)) {
    errors.push("missing runtime/runtime.json");
  } else {
    const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
    if (runtime.release_version !== version) errors.push("release version mismatch");
    if (runtime.runtime_sha256 !== fileHash(join(pluginPath, "runtime", "apex-v2.mjs"))) {
      errors.push("runtime hash mismatch");
    }
    if (runtime.schemas_sha256 !== treeHash(join(pluginPath, "runtime", "schemas"))) {
      errors.push("schemas hash mismatch");
    }
    if (
      runtime.capabilities_sha256
      !== treeHash(join(pluginPath, "runtime", "capabilities"))
    ) {
      errors.push("capabilities hash mismatch");
    }
  }
  return {
    id,
    status: errors.length === 0 ? "PASS" : "FAIL",
    exit_code: errors.length === 0 ? 0 : 1,
    stdout: pluginPath,
    stderr: errors.join("; ")
  };
}

function verifySkillSurface(pluginPath, errors) {
  const skillsRoot = join(pluginPath, "skills");
  if (!existsSync(skillsRoot)) {
    errors.push("missing skills");
    return;
  }
  const skillNames = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(skillNames) !== JSON.stringify(expectedSkillNames)) {
    errors.push(`skill discovery mismatch: ${skillNames.join(",")}`);
  }
  const usingRoot = join(skillsRoot, "using-apex-forge");
  for (const route of ["plan", "execute", "review", "ship", "status"]) {
    if (!existsSync(join(usingRoot, "references", "workflows", `${route}.md`))) {
      errors.push(`missing internal workflow ${route}`);
    }
  }
  const skillManifests = listFiles(skillsRoot)
    .filter((path) => path.endsWith("/SKILL.md"));
  if (skillManifests.length !== expectedSkillNames.length) {
    errors.push(`unexpected nested Skill manifests: ${skillManifests.length}`);
  }
}

function verifyInstalledRuntime(installedPath, sourcePlugin) {
  if (!installedPath || !existsSync(installedPath)) return false;
  for (const relativePath of [
    "runtime/apex-v2.mjs",
    "runtime/capability-runner.mjs",
    "runtime/runtime.json",
    "runtime/capabilities/registry.json",
    "runtime/capabilities/capability-lock.json",
    "skills/using-apex-forge/SKILL.md",
    "skills/using-apex-forge/references/workflows/plan.md",
    "skills/using-apex-forge/references/workflows/execute.md",
    "skills/using-apex-forge/references/workflows/review.md",
    "skills/using-apex-forge/references/workflows/ship.md",
    "skills/using-apex-forge/references/workflows/status.md",
    "PROVENANCE.json"
  ]) {
    const installed = join(installedPath, relativePath);
    const source = join(sourcePlugin, relativePath);
    if (!existsSync(installed) || !existsSync(source)) return false;
    if (fileHash(installed) !== fileHash(source)) return false;
  }
  const installedErrors = [];
  verifySkillSurface(installedPath, installedErrors);
  if (installedErrors.length > 0) return false;
  return true;
}

function treeHash(directory) {
  if (!existsSync(directory)) return "";
  const hash = createHash("sha256");
  for (const file of listFiles(directory)) {
    hash.update(relative(directory, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function fileHash(path) {
  if (!existsSync(path)) return "";
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
