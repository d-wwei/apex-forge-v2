import test from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = new URL("../", import.meta.url).pathname;
const CLI = join(REPO, "src", "apex-v2.mjs");
const RELEASE_CANDIDATE_ROOT = process.env.APEX_RELEASE_CANDIDATE_ROOT || null;
const CODEX_PLUGIN = RELEASE_CANDIDATE_ROOT
  ? join(RELEASE_CANDIDATE_ROOT, "plugins", "codex", "apex-forge-v2")
  : join(REPO, "plugins", "codex", "apex-forge-v2");
const CLAUDE_PLUGIN = RELEASE_CANDIDATE_ROOT
  ? join(RELEASE_CANDIDATE_ROOT, "plugins", "claude-code", "apex-forge-v2")
  : join(REPO, "plugins", "claude-code", "apex-forge-v2");

test("native Codex and Claude lifecycle preserves an active Apex project", () => {
  assert.equal(run("codex", ["--version"]).status, 0, "Codex CLI unavailable");
  assert.equal(run("claude", ["--version"]).status, 0, "Claude CLI unavailable");

  const temp = mkdtempSync(join(tmpdir(), "apex-native-lifecycle-"));
  const project = join(temp, "project");
  const codexHome = join(temp, "codex-home");
  const claudeHome = join(temp, "claude-home");
  mkdirSync(project, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(claudeHome, { recursive: true });
  createActiveProject(project);
  const baseline = hashTree(join(project, ".apex-v2"));

  const codexMarket = join(temp, "codex-market");
  const claudeMarket = join(temp, "claude-market");
  prepareCodexMarketplace(codexMarket, "0.1.0-rc.1");
  prepareClaudeMarketplace(claudeMarket, "0.1.0-rc.1");

  const codexEnv = { CODEX_HOME: codexHome, HOME: claudeHome };
  assert.equal(run("codex", ["plugin", "marketplace", "add", codexMarket, "--json"], { env: codexEnv }).status, 0);
  const codexRc1 = installCodex(codexEnv);
  assertInstalledRuntime(codexRc1.installedPath, "0.1.0-rc.1", project, baseline);

  prepareCodexMarketplace(codexMarket, "0.1.0-rc.2");
  assert.equal(run("codex", ["plugin", "remove", "apex-forge-v2@apex-forge-lifecycle", "--json"], { env: codexEnv }).status, 0);
  const codexRc2 = installCodex(codexEnv);
  assertInstalledRuntime(codexRc2.installedPath, "0.1.0-rc.2", project, baseline);

  prepareCodexMarketplace(codexMarket, "0.1.0-rc.1");
  assert.equal(run("codex", ["plugin", "remove", "apex-forge-v2@apex-forge-lifecycle", "--json"], { env: codexEnv }).status, 0);
  const codexRollback = installCodex(codexEnv);
  assertInstalledRuntime(codexRollback.installedPath, "0.1.0-rc.1", project, baseline);
  assert.equal(run("codex", ["plugin", "remove", "apex-forge-v2@apex-forge-lifecycle", "--json"], { env: codexEnv }).status, 0);

  const claudeEnv = { HOME: claudeHome };
  assert.equal(run("claude", ["plugin", "marketplace", "add", claudeMarket, "--scope", "local"], {
    cwd: project,
    env: claudeEnv
  }).status, 0);
  assert.equal(run("claude", ["plugin", "install", "apex-forge-v2@apex-forge-lifecycle", "--scope", "local"], {
    cwd: project,
    env: claudeEnv
  }).status, 0);
  let claudeInstalled = installedClaudePlugin(project, claudeEnv);
  assertInstalledRuntime(claudeInstalled.installPath, "0.1.0-rc.1", project, baseline);

  prepareClaudeMarketplace(claudeMarket, "0.1.0-rc.2");
  assert.equal(run("claude", ["plugin", "marketplace", "update", "apex-forge-lifecycle"], {
    cwd: project,
    env: claudeEnv
  }).status, 0);
  assert.equal(run("claude", ["plugin", "update", "apex-forge-v2@apex-forge-lifecycle", "--scope", "local"], {
    cwd: project,
    env: claudeEnv
  }).status, 0);
  claudeInstalled = installedClaudePlugin(project, claudeEnv);
  assertInstalledRuntime(claudeInstalled.installPath, "0.1.0-rc.2", project, baseline);

  prepareClaudeMarketplace(claudeMarket, "0.1.0-rc.1");
  assert.equal(run("claude", ["plugin", "marketplace", "update", "apex-forge-lifecycle"], {
    cwd: project,
    env: claudeEnv
  }).status, 0);
  assert.equal(run("claude", ["plugin", "update", "apex-forge-v2@apex-forge-lifecycle", "--scope", "local"], {
    cwd: project,
    env: claudeEnv
  }).status, 0);
  claudeInstalled = installedClaudePlugin(project, claudeEnv);
  assertInstalledRuntime(claudeInstalled.installPath, "0.1.0-rc.1", project, baseline);
  assert.equal(run("claude", [
    "plugin", "uninstall", "apex-forge-v2@apex-forge-lifecycle",
    "--scope", "local", "--yes"
  ], { cwd: project, env: claudeEnv }).status, 0);

  assert.equal(hashTree(join(project, ".apex-v2")), baseline);
  rmSync(temp, { recursive: true, force: true });
});

function createActiveProject(project) {
  runNode(["init", "--project", project, "--name", "Lifecycle Active"]);
  const intake = JSON.parse(runNode([
    "intake", "add", "--project", project, "--title", "lifecycle active run"
  ]).stdout);
  runNode(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const roadmap = JSON.parse(runNode([
    "roadmap", "promote", "--project", project, "--intake-id", intake.id
  ]).stdout);
  runNode(["run", "create", "--project", project, "--roadmap-id", roadmap.id]);
}

function prepareCodexMarketplace(root, version) {
  rmSync(root, { recursive: true, force: true });
  const plugin = join(root, "plugin");
  cpSync(CODEX_PLUGIN, plugin, { recursive: true });
  setPackageVersion(plugin, join(plugin, ".codex-plugin", "plugin.json"), version);
  writeJson(join(root, ".agents", "plugins", "marketplace.json"), {
    name: "apex-forge-lifecycle",
    plugins: [{
      name: "apex-forge-v2",
      source: { source: "local", path: "./plugin" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }
    }]
  });
}

function prepareClaudeMarketplace(root, version) {
  rmSync(root, { recursive: true, force: true });
  const plugin = join(root, "plugin");
  cpSync(CLAUDE_PLUGIN, plugin, { recursive: true });
  setPackageVersion(plugin, join(plugin, ".claude-plugin", "plugin.json"), version);
  writeJson(join(root, ".claude-plugin", "marketplace.json"), {
    name: "apex-forge-lifecycle",
    owner: { name: "test" },
    plugins: [{
      name: "apex-forge-v2",
      version,
      source: "./plugin",
      description: "Lifecycle fixture"
    }]
  });
}

function setPackageVersion(pluginRoot, manifestPath, version) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  writeJson(manifestPath, manifest);
  const runtimePath = join(pluginRoot, "runtime", "runtime.json");
  const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
  runtime.release_version = version;
  writeJson(runtimePath, runtime);
  const provenancePath = join(pluginRoot, "PROVENANCE.json");
  const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
  provenance.release_version = version;
  writeJson(provenancePath, provenance);
  writeFileSync(join(pluginRoot, "RELEASE_MARKER"), `${version}\n`);
}

function installCodex(env) {
  const result = run("codex", [
    "plugin", "add", "apex-forge-v2@apex-forge-lifecycle", "--json"
  ], { env });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function installedClaudePlugin(project, env) {
  const result = run("claude", ["plugin", "list", "--json"], { cwd: project, env });
  assert.equal(result.status, 0, result.stderr);
  const plugin = JSON.parse(result.stdout)
    .find((item) => item.id === "apex-forge-v2@apex-forge-lifecycle");
  assert.ok(plugin);
  return plugin;
}

function assertInstalledRuntime(pluginRoot, version, project, baseline) {
  assert.equal(readFileSync(join(pluginRoot, "RELEASE_MARKER"), "utf8").trim(), version);
  const runtime = JSON.parse(readFileSync(join(pluginRoot, "runtime", "runtime.json"), "utf8"));
  assert.equal(runtime.release_version, version);
  const status = run(process.execPath, [
    join(pluginRoot, "scripts", "apex-host.mjs"),
    "status",
    "--project",
    project
  ]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(hashTree(join(project, ".apex-v2")), baseline);
}

function runNode(args) {
  const result = run(process.execPath, [CLI, ...args]);
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || REPO,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8"
  });
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hashTree(root) {
  const hash = createHash("sha256");
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        hash.update(path.slice(root.length));
        hash.update(readFileSync(path));
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}
