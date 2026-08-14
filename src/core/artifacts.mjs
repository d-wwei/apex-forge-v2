import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, now, readJson, shortId, writeJson } from "../lib/common.mjs";
import { SCHEMA_VERSION } from "./store.mjs";
import { getRunNode } from "./run-state.mjs";

export function createArtifact(root, run, nodeId, input) {
  getRunNode(run, nodeId);
  const timestamp = input.timestamp || now();
  const artifact = {
    schema_version: SCHEMA_VERSION,
    artifact_id: shortId("artifact"),
    run_id: run.run_id,
    node_id: nodeId,
    type: input.type,
    title: input.title,
    body: input.body || "",
    refs: input.refs || [],
    created_at: timestamp,
    updated_at: timestamp
  };

  const dir = join(root, "artifacts", run.run_id);
  ensureDir(dir);
  writeJson(join(dir, `${artifact.artifact_id}.json`), artifact);
  return artifact;
}

export function assertArtifact(root, runId, artifactId, expectedNodeId) {
  const artifact = readJson(join(root, "artifacts", runId, `${artifactId}.json`), null);
  if (!artifact) throw new Error(`找不到 artifact：${artifactId}`);
  if (artifact.run_id !== runId) throw new Error(`artifact 不属于当前 run：${artifactId}`);
  if (artifact.node_id !== expectedNodeId) {
    throw new Error(`artifact 不属于当前 node：${artifactId} 属于 ${artifact.node_id}`);
  }
  return artifact;
}

export function readDirectoryJsonFiles(dir) {
  return readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
}

export function listArtifactsForRun(root, runId) {
  const dir = join(root, "artifacts", runId);
  ensureDir(dir);
  const files = existsSync(dir) ? Array.from(new Set(readDirectoryJsonFiles(dir))) : [];
  return files.map((file) => readJson(join(dir, file)));
}

export function listAllArtifacts(root) {
  const artifactsDir = join(root, "artifacts");
  if (!existsSync(artifactsDir)) return [];
  const artifacts = [];
  for (const runEntry of readdirSync(artifactsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    for (const file of readDirectoryJsonFiles(join(artifactsDir, runEntry.name))) {
      artifacts.push(readJson(join(artifactsDir, runEntry.name, file)));
    }
  }
  return artifacts;
}

