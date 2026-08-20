import test from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PLUGIN = new URL("../plugins/codex/apex-forge-v2/", import.meta.url).pathname;
const CLAUDE_PLUGIN = new URL("../plugins/claude-code/apex-forge-v2/", import.meta.url).pathname;
const BRIDGE = join(PLUGIN, "scripts", "apex-host.mjs");
const VALIDATE_PLUGINS = new URL("../scripts/validate-agent-plugins.mjs", import.meta.url).pathname;
const RELEASE_VERIFY = new URL("../scripts/release-verify.mjs", import.meta.url).pathname;
const BUILD_PLUGIN = new URL("../scripts/build-codex-plugin.mjs", import.meta.url).pathname;

test("Codex plugin package contains validated Skills and a self-contained runtime", () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, ".codex-plugin", "plugin.json"), "utf8"));
  const skillDirs = readdirSync(join(PLUGIN, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.equal(manifest.name, "apex-forge-v2");
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  assert.ok(Array.isArray(manifest.interface.defaultPrompt));
  assert.equal(skillDirs.length, 6);
  for (const skill of skillDirs) {
    const source = readFileSync(join(PLUGIN, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(source, /\[TODO|TODO:/);
  }
  assert.equal(existsSync(join(PLUGIN, "runtime", "apex-v2.mjs")), true);
  assert.equal(existsSync(join(PLUGIN, "runtime", "capability-runner.mjs")), true);
  assert.equal(existsSync(join(PLUGIN, "runtime", "schemas", "project-state.schema.json")), true);
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES", "SBOM.json", "PROVENANCE.json", "CHECKSUMS.sha256"]) {
    assert.equal(existsSync(join(PLUGIN, file)), true, file);
  }
  const runtime = JSON.parse(readFileSync(join(PLUGIN, "runtime", "runtime.json"), "utf8"));
  assert.match(runtime.source_commit, /^[a-f0-9]{40}$/);
  assert.match(runtime.source_tree_hash, /^[a-f0-9]{64}$/);
  assert.match(runtime.runtime_sha256, /^[a-f0-9]{64}$/);
  assert.match(runtime.schemas_sha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof runtime.source_dirty, "boolean");
});

test("ship Skill requires durable run closure before claiming completion", () => {
  const source = readFileSync(
    join(PLUGIN, "skills", "apex-forge-ship", "SKILL.md"),
    "utf8"
  );

  assert.match(source, /--apply-learning/);
  assert.match(source, /run\.status.*done/s);
  assert.match(source, /project\.active_runs/);
  assert.match(source, /reconcile is `CONSISTENT`/);
  assert.match(source, /Never claim end-to-end completion while the durable run remains active/);
});

test("plugin validation resolves Codex tooling without a machine-specific home path", () => {
  const source = readFileSync(VALIDATE_PLUGINS, "utf8");

  assert.doesNotMatch(source, /\/Users\/admin/);
  assert.match(source, /CODEX_HOME/);
  assert.match(source, /CODEX_PLUGIN_VALIDATOR/);
  assert.match(source, /homedir\(\)/);
});

test("release verification exposes every mandatory gate in fixed order", () => {
  const result = spawnSync(process.execPath, [RELEASE_VERIFY, "--list"], {
    cwd: new URL("../", import.meta.url).pathname,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(plan.steps.map((step) => step.id), [
    "clean-source",
    "full-tests",
    "strict-validate",
    "contract-validation",
    "full-reconcile",
    "host-workspace-adversarial",
    "candidate-mutation",
    "crash-recovery",
    "executor-host-conformance",
    "candidate-codex-validator",
    "candidate-claude-validator",
    "native-plugin-lifecycle",
    "dependency-audit",
    "plugin-build",
    "plugin-provenance",
    "product-gate"
  ]);
  assert.match(plan.steps[0].command, /release:validate-candidate/);
  assert.match(
    plan.steps.find((step) => step.id === "plugin-build").command,
    /release:candidate/
  );
  assert.ok(plan.steps.every((step) => step.timeout_ms > 0));
});

test("plugin build captures source provenance before mutating generated output", () => {
  const source = readFileSync(BUILD_PLUGIN, "utf8");
  const dirtyIndex = source.indexOf("const sourceDirty =");
  const sourceHashIndex = source.indexOf("const sourceTreeHash =");
  const mutationIndex = source.indexOf("rmSync(runtimeRoot");
  assert.ok(dirtyIndex >= 0 && dirtyIndex < mutationIndex);
  assert.ok(sourceHashIndex >= 0 && sourceHashIndex < mutationIndex);
  assert.match(source, /APEX_BUILD_TIMESTAMP/);
});

test("installed-shape Host Bridge initializes and reads a project without repository source", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-plugin-runtime-"));
  const env = {
    ...process.env,
    APEX_FORGE_V2_CLI: join(PLUGIN, "runtime", "apex-v2.mjs")
  };
  const initialized = spawnSync(process.execPath, [
    BRIDGE,
    "init",
    "--project",
    project,
    "--name",
    "Plugin Runtime"
  ], { encoding: "utf8", env });
  assert.equal(initialized.status, 0, initialized.stderr);

  const status = spawnSync(process.execPath, [
    BRIDGE,
    "status",
    "--project",
    project
  ], { encoding: "utf8", env });
  assert.equal(status.status, 0, status.stderr);
  const parsed = JSON.parse(status.stdout);
  assert.equal(parsed.project, "Plugin Runtime");
  assert.deepEqual(parsed.active_runs, []);
});

test("Codex and Claude packages share workflows but render native Host identity", () => {
  const manifest = JSON.parse(readFileSync(join(CLAUDE_PLUGIN, ".claude-plugin", "plugin.json"), "utf8"));
  const codexSkills = readdirSync(join(PLUGIN, "skills")).sort();
  const claudeSkills = readdirSync(join(CLAUDE_PLUGIN, "skills")).sort();

  assert.equal(manifest.name, "apex-forge-v2");
  assert.deepEqual(claudeSkills, codexSkills);
  for (const skill of codexSkills) {
    const codex = readFileSync(join(PLUGIN, "skills", skill, "SKILL.md"), "utf8");
    const claude = readFileSync(join(CLAUDE_PLUGIN, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(codex, /\{\{HOST_/);
    assert.doesNotMatch(claude, /\{\{HOST_/);
    assert.doesNotMatch(claude, /current Codex session|codex-host/);
  }
  assert.match(
    readFileSync(join(CLAUDE_PLUGIN, "skills", "using-apex-forge", "SKILL.md"), "utf8"),
    /current Claude Code session/
  );
  assert.match(
    readFileSync(join(CLAUDE_PLUGIN, "skills", "apex-forge-plan", "SKILL.md"), "utf8"),
    /claude-code-host/
  );
  assert.equal(existsSync(join(CLAUDE_PLUGIN, "runtime", "apex-v2.mjs")), true);
});

test("plugin upgrade, rollback, and uninstall leave project state unchanged", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-plugin-state-"));
  const installRoot = mkdtempSync(join(tmpdir(), "apex-plugin-install-"));
  const init = spawnSync(process.execPath, [
    BRIDGE, "init", "--project", project, "--name", "Lifecycle"
  ], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const baseline = hashTree(join(project, ".apex-v2"));

  const v1 = join(installRoot, "0.1.0");
  const v2 = join(installRoot, "0.1.1");
  cpSync(PLUGIN, v1, { recursive: true });
  cpSync(PLUGIN, v2, { recursive: true });

  for (const bridge of [join(v1, "scripts", "apex-host.mjs"), join(v2, "scripts", "apex-host.mjs"), join(v1, "scripts", "apex-host.mjs")]) {
    const status = spawnSync(process.execPath, [bridge, "status", "--project", project], { encoding: "utf8" });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(hashTree(join(project, ".apex-v2")), baseline);
  }

  rmSync(v2, { recursive: true, force: true });
  rmSync(installRoot, { recursive: true, force: true });
  assert.equal(hashTree(join(project, ".apex-v2")), baseline);
});

function hashTree(root) {
  const hash = createHash("sha256");
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
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
