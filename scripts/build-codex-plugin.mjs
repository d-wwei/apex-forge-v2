import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(repoRoot, "plugins", "codex", "apex-forge-v2");
const claudePluginRoot = join(repoRoot, "plugins", "claude-code", "apex-forge-v2");
const runtimeRoot = join(pluginRoot, "runtime");
const workflowRoot = join(repoRoot, "workflows", "skills");
const packageValue = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const codexManifest = JSON.parse(
  readFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8")
);
const sourceCommit = gitValue(["rev-parse", "HEAD"]);
const sourceDirty = gitValue(["status", "--porcelain"]).trim() !== "";
const sourceTreeHash = selectedSourceHash();
const generatedAt = buildTimestamp();

rmSync(runtimeRoot, { recursive: true, force: true });
mkdirSync(runtimeRoot, { recursive: true });

await build({
  entryPoints: [join(repoRoot, "src", "apex-v2.mjs")],
  outfile: join(runtimeRoot, "apex-v2.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none"
});
cpSync(
  join(repoRoot, "src", "core", "capability-runner.mjs"),
  join(runtimeRoot, "capability-runner.mjs")
);

cpSync(join(repoRoot, "schemas"), join(runtimeRoot, "schemas"), { recursive: true });
const runtimeHash = fileHash(join(runtimeRoot, "apex-v2.mjs"));
const schemasHash = treeHash(join(runtimeRoot, "schemas"));
writeFileSync(join(runtimeRoot, "runtime.json"), `${JSON.stringify({
  schema_version: "v0",
  release_version: codexManifest.version,
  source_commit: sourceCommit,
  source_tree_hash: sourceTreeHash,
  source_dirty: sourceDirty,
  runtime_sha256: runtimeHash,
  schemas_sha256: schemasHash,
  build_tool_versions: {
    node: process.version,
    esbuild: JSON.parse(readFileSync(join(repoRoot, "node_modules", "esbuild", "package.json"), "utf8")).version
  },
  generated_at: generatedAt,
  entrypoint: "apex-v2.mjs",
  schema_dir: "schemas"
}, null, 2)}\n`);
writeReleaseArtifacts(pluginRoot, {
  releaseVersion: codexManifest.version,
  sourceCommit,
  sourceTreeHash,
  runtimeHash,
  schemasHash
});

renderSkills(pluginRoot, {
  HOST_SESSION: "current Codex session",
  HOST_ID: "codex-host",
  HOST_NAME: "Codex"
}, true);
renderSkills(claudePluginRoot, {
  HOST_SESSION: "current Claude Code session",
  HOST_ID: "claude-code-host",
  HOST_NAME: "Claude Code"
}, false);

for (const directory of ["scripts", "runtime"]) {
  const target = join(claudePluginRoot, directory);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(pluginRoot, directory), target, { recursive: true });
}
writeReleaseArtifacts(claudePluginRoot, {
  releaseVersion: JSON.parse(
    readFileSync(join(claudePluginRoot, ".claude-plugin", "plugin.json"), "utf8")
  ).version,
  sourceCommit,
  sourceTreeHash,
  runtimeHash,
  schemasHash
});

console.log(`Built Codex plugin runtime: ${runtimeRoot}`);
console.log(`Synchronized Claude Code plugin: ${claudePluginRoot}`);

function renderSkills(targetRoot, variables, preserveAgents) {
  const targetSkills = join(targetRoot, "skills");
  const savedAgents = new Map();
  if (preserveAgents && existsSync(targetSkills)) {
    for (const skill of readdirSync(targetSkills, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const agents = join(targetSkills, skill.name, "agents");
      if (existsSync(agents)) savedAgents.set(skill.name, agents);
    }
  }
  const stagedAgents = new Map();
  for (const [skill, agents] of savedAgents) {
    const staged = join(repoRoot, ".plugin-build-agents", skill);
    rmSync(staged, { recursive: true, force: true });
    mkdirSync(staged, { recursive: true });
    cpSync(agents, staged, { recursive: true });
    stagedAgents.set(skill, staged);
  }

  rmSync(targetSkills, { recursive: true, force: true });
  mkdirSync(targetSkills, { recursive: true });
  for (const skill of readdirSync(workflowRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const source = join(workflowRoot, skill.name, "SKILL.md");
    const target = join(targetSkills, skill.name, "SKILL.md");
    mkdirSync(dirname(target), { recursive: true });
    let content = readFileSync(source, "utf8");
    for (const [name, value] of Object.entries(variables)) {
      content = content.replaceAll(`{{${name}}}`, value);
    }
    writeFileSync(target, content);
    if (preserveAgents && stagedAgents.has(skill.name)) {
      cpSync(stagedAgents.get(skill.name), join(targetSkills, skill.name, "agents"), { recursive: true });
    }
  }
  rmSync(join(repoRoot, ".plugin-build-agents"), { recursive: true, force: true });
}

function writeReleaseArtifacts(targetRoot, values) {
  cpSync(join(repoRoot, "LICENSE"), join(targetRoot, "LICENSE"));
  cpSync(join(repoRoot, "THIRD_PARTY_NOTICES"), join(targetRoot, "THIRD_PARTY_NOTICES"));
  const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: packageValue.name,
        version: values.releaseVersion
      }
    },
    components: [
      component("ajv", "8.20.0", "MIT"),
      component("fast-deep-equal", "3.1.3", "MIT"),
      component("fast-uri", "3.1.0", "BSD-3-Clause"),
      component("json-schema-traverse", "1.0.0", "MIT"),
      component("require-from-string", "2.0.2", "MIT")
    ]
  };
  writeFileSync(join(targetRoot, "SBOM.json"), `${JSON.stringify(sbom, null, 2)}\n`);
  writeFileSync(join(targetRoot, "PROVENANCE.json"), `${JSON.stringify({
    schema_version: "v0",
    release_version: values.releaseVersion,
    source_commit: values.sourceCommit,
    source_tree_hash: values.sourceTreeHash,
    runtime_sha256: values.runtimeHash,
    schemas_sha256: values.schemasHash
  }, null, 2)}\n`);
  writeFileSync(join(targetRoot, "CHECKSUMS.sha256"), [
    `${values.runtimeHash}  runtime/apex-v2.mjs`,
    `${values.schemasHash}  runtime/schemas`,
    `${values.sourceTreeHash}  source-tree`
  ].join("\n") + "\n");
}

function component(name, version, license) {
  return {
    type: "library",
    name,
    version,
    licenses: [{ license: { id: license } }]
  };
}

function selectedSourceHash() {
  const hash = createHash("sha256");
  for (const root of ["src", "schemas", "workflows", "scripts"]) {
    const directory = join(repoRoot, root);
    for (const file of listFiles(directory)) {
      hash.update(relative(repoRoot, file));
      hash.update("\0");
      hash.update(readFileSync(file));
      hash.update("\n");
    }
  }
  for (const file of ["package.json", "package-lock.json"]) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(repoRoot, file)));
    hash.update("\n");
  }
  for (const file of [
    ".agents/plugins/marketplace.json",
    "plugins/codex/apex-forge-v2/.codex-plugin/plugin.json",
    "plugins/claude-code/.claude-plugin/marketplace.json",
    "plugins/claude-code/apex-forge-v2/.claude-plugin/plugin.json"
  ]) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(repoRoot, file)));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function treeHash(directory) {
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
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitValue(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) return "unavailable";
  return result.stdout.trim();
}

function buildTimestamp() {
  const configured = process.env.APEX_BUILD_TIMESTAMP;
  if (!configured) return new Date().toISOString();
  const value = new Date(configured);
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`APEX_BUILD_TIMESTAMP 无效：${configured}`);
  }
  return value.toISOString();
}
