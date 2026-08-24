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
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const PLUGIN = new URL("../plugins/codex/apex-forge-v2/", import.meta.url).pathname;
const CLAUDE_PLUGIN = new URL("../plugins/claude-code/apex-forge-v2/", import.meta.url).pathname;
const CLAUDE_MARKETPLACE = new URL("../plugins/claude-code/.claude-plugin/marketplace.json", import.meta.url).pathname;
const BRIDGE = join(PLUGIN, "scripts", "apex-host.mjs");
const VALIDATE_PLUGINS = new URL("../scripts/validate-agent-plugins.mjs", import.meta.url).pathname;
const RELEASE_VERIFY = new URL("../scripts/release-verify.mjs", import.meta.url).pathname;
const BUILD_PLUGIN = new URL("../scripts/build-codex-plugin.mjs", import.meta.url).pathname;
const COMPATIBILITY_ALIASES = new URL(
  "../workflows/compatibility-aliases/",
  import.meta.url
).pathname;
const LIFECYCLE_ROUTES = {
  plan: "understand, add, triage, or plan work",
  execute: "implement, test, fix, resume, or continue ready actions",
  review: "inspect quality, requirements, patches, evidence, or risks",
  ship: "verify closure, approve, integrate, deliver, or release",
  status: "explain progress, blockers, approvals, risks, or next action"
};

test("Codex plugin package contains validated Skills and a self-contained runtime", () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, ".codex-plugin", "plugin.json"), "utf8"));
  const skillDirs = readdirSync(join(PLUGIN, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.equal(manifest.name, "apex-forge-v2");
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  assert.ok(Array.isArray(manifest.interface.defaultPrompt));
  assert.deepEqual(skillDirs, ["using-apex-forge"]);
  for (const skill of skillDirs) {
    const source = readFileSync(join(PLUGIN, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(source, /\[TODO|TODO:/);
  }
  assert.deepEqual(
    listRelativeFiles(join(PLUGIN, "skills"))
      .filter((path) => path.endsWith("SKILL.md")),
    ["using-apex-forge/SKILL.md"]
  );
  const router = readFileSync(
    join(PLUGIN, "skills", "using-apex-forge", "SKILL.md"),
    "utf8"
  );
  for (const [route, intent] of Object.entries(LIFECYCLE_ROUTES)) {
    const reference = join(
      PLUGIN,
      "skills",
      "using-apex-forge",
      "references",
      "workflows",
      `${route}.md`
    );
    assert.equal(existsSync(reference), true, route);
    assert.match(router, new RegExp(`\\| ${escapeRegExp(intent)} \\| \`${route}\` \\|`));
    assert.match(router, new RegExp(`references/workflows/${route}\\.md`));
    assert.doesNotMatch(readFileSync(reference, "utf8"), /^---\n/);
  }
  assert.equal(existsSync(join(PLUGIN, "runtime", "apex-v2.mjs")), true);
  assert.equal(existsSync(join(PLUGIN, "runtime", "capability-runner.mjs")), true);
  assert.equal(existsSync(join(PLUGIN, "runtime", "schemas", "project-state.schema.json")), true);
  assert.equal(existsSync(join(PLUGIN, "runtime", "capabilities", "registry.json")), true);
  assert.equal(
    existsSync(join(
      PLUGIN,
      "runtime",
      "capabilities",
      "core",
      "systematic-debugging",
      "PROTOCOL.md"
    )),
    true
  );
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES", "SBOM.json", "PROVENANCE.json", "CHECKSUMS.sha256"]) {
    assert.equal(existsSync(join(PLUGIN, file)), true, file);
  }
  const runtime = JSON.parse(readFileSync(join(PLUGIN, "runtime", "runtime.json"), "utf8"));
  assert.match(runtime.source_commit, /^[a-f0-9]{40}$/);
  assert.match(runtime.source_tree_hash, /^[a-f0-9]{64}$/);
  assert.match(runtime.runtime_sha256, /^[a-f0-9]{64}$/);
  assert.match(runtime.schemas_sha256, /^[a-f0-9]{64}$/);
  assert.match(runtime.capabilities_sha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof runtime.source_dirty, "boolean");
});

test("ship Skill requires durable run closure before claiming completion", () => {
  const source = readFileSync(
    join(
      PLUGIN,
      "skills",
      "using-apex-forge",
      "references",
      "workflows",
      "ship.md"
    ),
    "utf8"
  );

  assert.match(source, /--learning-worker/);
  assert.match(source, /durable proposal and apply job/);
  assert.match(source, /run\.status.*done/s);
  assert.match(source, /project\.active_runs/);
  assert.match(source, /reconcile is `CONSISTENT`/);
  assert.match(source, /Never claim end-to-end completion while the durable run remains active/);
});

test("quick execute workflow requires patch landing before completion", () => {
  const source = readFileSync(
    join(
      PLUGIN,
      "skills",
      "using-apex-forge",
      "references",
      "workflows",
      "execute.md"
    ),
    "utf8"
  );

  assert.match(source, /merge-queue\.json/);
  assert.match(source, /integration-report\.json/);
  assert.match(source, /public acceptance commands pass again in the project root/);
  assert.match(source, /status\.active_runs/);
  assert.match(source, /Never treat an ActionWorkspace-local PASS as delivery/);
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
    "throughput-architecture-gate",
    "capability-gate",
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
  assert.match(source, /APEX_PLUGIN_COMPAT_ALIASES/);
  assert.match(source, /join\(workflowRoot, "using-apex-forge"\)/);
  assert.match(source, /compatibilityAliasRoot/);
});

test("compatibility build preserves the five deprecated lifecycle aliases", () => {
  const aliases = readdirSync(COMPATIBILITY_ALIASES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(aliases, [
    "apex-forge-execute",
    "apex-forge-plan",
    "apex-forge-review",
    "apex-forge-ship",
    "apex-forge-status"
  ]);
  for (const alias of aliases) {
    const route = alias.replace("apex-forge-", "");
    const source = readFileSync(
      join(COMPATIBILITY_ALIASES, alias, "SKILL.md"),
      "utf8"
    );
    assert.match(source, new RegExp(`name: ${alias}`));
    assert.match(source, /Route through `using-apex-forge`/);
    assert.match(source, new RegExp(`references/workflows/${route}\\.md`));
  }
  const instructions = readFileSync(
    join(COMPATIBILITY_ALIASES, "README.md"),
    "utf8"
  );
  assert.match(instructions, /APEX_PLUGIN_COMPAT_ALIASES=1 npm run build:plugin/);
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
  const codexManifest = JSON.parse(readFileSync(join(PLUGIN, ".codex-plugin", "plugin.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(CLAUDE_PLUGIN, ".claude-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(readFileSync(CLAUDE_MARKETPLACE, "utf8"));
  const codexSkills = readdirSync(join(PLUGIN, "skills")).sort();
  const claudeSkills = readdirSync(join(CLAUDE_PLUGIN, "skills")).sort();

  assert.equal(manifest.name, "apex-forge-v2");
  assert.equal(manifest.version, codexManifest.version);
  assert.equal(
    marketplace.plugins.find((plugin) => plugin.name === manifest.name)?.version,
    codexManifest.version
  );
  assert.deepEqual(claudeSkills, codexSkills);
  assert.deepEqual(codexSkills, ["using-apex-forge"]);
  assert.equal(
    existsSync(join(PLUGIN, "skills", "using-apex-forge", "agents", "openai.yaml")),
    true
  );
  const codexFiles = listRelativeFiles(join(PLUGIN, "skills"))
    .filter((file) => !file.includes("/agents/"));
  const claudeFiles = listRelativeFiles(join(CLAUDE_PLUGIN, "skills"));
  assert.deepEqual(claudeFiles, codexFiles);
  for (const file of codexFiles) {
    const codex = readFileSync(join(PLUGIN, "skills", file), "utf8");
    const claude = readFileSync(join(CLAUDE_PLUGIN, "skills", file), "utf8");
    assert.doesNotMatch(codex, /\{\{HOST_/);
    assert.doesNotMatch(claude, /\{\{HOST_/);
    assert.doesNotMatch(claude, /current Codex session|codex-host/);
  }
  assert.match(
    readFileSync(join(CLAUDE_PLUGIN, "skills", "using-apex-forge", "SKILL.md"), "utf8"),
    /current Claude Code session/
  );
  assert.match(
    readFileSync(
      join(
        CLAUDE_PLUGIN,
        "skills",
        "using-apex-forge",
        "references",
        "workflows",
        "plan.md"
      ),
      "utf8"
    ),
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

function listRelativeFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
