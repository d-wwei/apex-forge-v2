import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFile, now, readJson, writeJson } from "../lib/common.mjs";
import { appendEvent, projectRoot, requireStore, SCHEMA_VERSION, updateProject } from "../core/store.mjs";
import { loadRun, writeRun } from "../core/run-state.mjs";
import { KNOWLEDGE_FILES } from "../core/knowledge-constants.mjs";
import { renderConventions, renderDangerZones, renderDecisions, renderEnvironment, renderGlossary, renderKnowledgeIndex, renderKnownIssues, renderModuleMap, renderTaskToFileMap, renderTestMap, withKnowledgeMetadata } from "../core/knowledge-renderers.mjs";

export function handleKnowledgeCommand(subcommand, args, deps) {
  if (subcommand === "refresh") {
    refreshKnowledge(args, deps);
    return;
  }
  throw new Error(`未知 knowledge 子命令：${subcommand || "(空)"}`);
}

function refreshKnowledge(args, deps) {
  const { appendAppliedLearning } = deps;
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const timestamp = now();
  const inventory = buildProjectInventory(projectDir);
  const manifestPath = join(root, "knowledge", "manifest.json");
  const existingManifest = readJson(manifestPath, { version: 0 });
  const nextVersion = Number(existingManifest.version || 0) + 1;

  const knowledgeDir = join(root, "knowledge");
  const rendered = new Map([
    ["index.md", renderKnowledgeIndex(inventory, nextVersion, timestamp)],
    ["module-map.md", renderModuleMap(inventory)],
    ["task-to-file-map.md", renderTaskToFileMap(inventory)],
    ["danger-zones.md", renderDangerZones(inventory)],
    ["conventions.md", renderConventions(inventory)],
    ["test-map.md", renderTestMap(inventory)],
    ["known-issues.md", renderKnownIssues(inventory)],
    ["decisions.md", renderDecisions(inventory)],
    ["environment.md", renderEnvironment(inventory)],
    ["glossary.md", renderGlossary()]
  ]);
  const staleAfter = new Date(Date.parse(timestamp) + 7 * 86400000).toISOString();
  for (const [name, content] of rendered) {
    atomicWriteFile(join(knowledgeDir, name), withKnowledgeMetadata(
      content,
      timestamp,
      staleAfter,
      inventory.sourceRefs
    ));
  }
  appendAppliedLearning(root);

  writeJson(manifestPath, {
    schema_version: SCHEMA_VERSION,
    version: nextVersion,
    updated_at: timestamp,
    files: KNOWLEDGE_FILES.map(([name, purpose]) => ({
      path: `knowledge/${name}`,
      purpose,
      owner: "project-kernel",
      derived: false,
      generated_at: timestamp,
      stale_after: staleAfter,
      confidence: 0.9,
      source_refs: inventory.sourceRefs
    })),
    source_refs: inventory.sourceRefs
  });

  const project = readJson(join(root, "project.json"));
  project.knowledge_version = nextVersion;
  project.updated_at = timestamp;
  writeJson(join(root, "project.json"), project);
  const updatedRuns = refreshActiveRunContextSnapshots(root, nextVersion);
  const event = appendEvent(root, "knowledge.refreshed", "apex-v2", {
    knowledge_version: nextVersion,
    source_refs: inventory.sourceRefs,
    updated_runs: updatedRuns
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });

  console.log(JSON.stringify({
    knowledge_version: nextVersion,
    files: KNOWLEDGE_FILES.map(([name]) => `knowledge/${name}`),
    source_refs: inventory.sourceRefs,
    updated_runs: updatedRuns
  }, null, 2));
}

export function buildProjectInventory(projectDir) {
  const files = walkProjectFiles(projectDir);
  const packageJson = readJson(join(projectDir, "package.json"), null);
  const scripts = packageJson?.scripts || {};
  const sourceFiles = files.filter((file) => file.startsWith("src/"));
  const testFiles = files.filter((file) => file.startsWith("tests/") || file.includes(".test."));
  const schemaFiles = files.filter((file) => file.startsWith("schemas/") && file.endsWith(".json"));
  const planningDocs = files.filter((file) => file.startsWith("planning/") && file.endsWith(".md"));
  const contractDocs = files.filter((file) => file.startsWith("contracts/") && file.endsWith(".md"));
  const researchDocs = files.filter((file) => file.startsWith("research/") && file.endsWith(".md"));
  const adapterDirs = directoryChildren(projectDir, "adapters");
  const disciplineDirs = directoryChildren(projectDir, "disciplines");

  return {
    projectDir,
    files,
    packageJson,
    scripts,
    sourceFiles,
    testFiles,
    schemaFiles,
    planningDocs,
    contractDocs,
    researchDocs,
    adapterDirs,
    disciplineDirs,
    sourceRefs: [
      "package.json",
      ...sourceFiles,
      ...testFiles,
      ...schemaFiles,
      ...planningDocs,
      ...contractDocs,
      ...researchDocs
    ].slice(0, 80)
  };
}

function walkProjectFiles(projectDir) {
  const ignored = new Set([".git", "node_modules", ".apex-v2", ".DS_Store"]);
  const out = [];

  function walk(relativeDir) {
    const absoluteDir = join(projectDir, relativeDir);
    if (!existsSync(absoluteDir)) return;
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (entry.isFile()) {
        out.push(relativePath);
      }
    }
  }

  walk("");
  return out.sort();
}

function directoryChildren(projectDir, relativeDir) {
  const dir = join(projectDir, relativeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function refreshActiveRunContextSnapshots(root, knowledgeVersion) {
  const project = readJson(join(root, "project.json"));
  const updated = [];
  for (const runId of project.active_runs) {
    const run = loadRun(root, runId);
    const contextNode = run.nodes.find((node) => node.id === "context");
    if (contextNode && ["passed", "partial_pass"].includes(contextNode.status)) {
      continue;
    }
    run.context_snapshot = {
      knowledge_version: knowledgeVersion,
      files: KNOWLEDGE_FILES.map(([name]) => `knowledge/${name}`)
    };
    run.updated_at = now();
    writeRun(root, run);
    updated.push(runId);
  }
  return updated;
}


