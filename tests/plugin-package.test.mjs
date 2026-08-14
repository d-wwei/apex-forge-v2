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

test("Codex plugin package contains validated Skills and a self-contained runtime", () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, ".codex-plugin", "plugin.json"), "utf8"));
  const skillDirs = readdirSync(join(PLUGIN, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.equal(manifest.name, "apex-forge-v2");
  assert.match(manifest.version, /^0\.1\.0(?:\+codex\.[0-9]+)?$/);
  assert.ok(Array.isArray(manifest.interface.defaultPrompt));
  assert.equal(skillDirs.length, 6);
  for (const skill of skillDirs) {
    const source = readFileSync(join(PLUGIN, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(source, /\[TODO|TODO:/);
  }
  assert.equal(existsSync(join(PLUGIN, "runtime", "apex-v2.mjs")), true);
  assert.equal(existsSync(join(PLUGIN, "runtime", "schemas", "project-state.schema.json")), true);
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

test("Claude Code plugin reuses the same Skills and bundled Kernel runtime", () => {
  const manifest = JSON.parse(readFileSync(join(CLAUDE_PLUGIN, ".claude-plugin", "plugin.json"), "utf8"));
  const codexSkills = readdirSync(join(PLUGIN, "skills")).sort();
  const claudeSkills = readdirSync(join(CLAUDE_PLUGIN, "skills")).sort();

  assert.equal(manifest.name, "apex-forge-v2");
  assert.deepEqual(claudeSkills, codexSkills);
  for (const skill of codexSkills) {
    assert.equal(
      readFileSync(join(CLAUDE_PLUGIN, "skills", skill, "SKILL.md"), "utf8"),
      readFileSync(join(PLUGIN, "skills", skill, "SKILL.md"), "utf8")
    );
  }
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
