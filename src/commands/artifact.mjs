import { normalizeEnum, now, required, splitList } from "../lib/common.mjs";
import { appendEvent, projectRoot, requireStore, updateProject } from "../core/store.mjs";
import { createArtifact, listArtifactsForRun } from "../core/artifacts.mjs";
import { getRunNode, loadRun } from "../core/run-state.mjs";

export function handleArtifactCommand(subcommand, args) {
  if (subcommand === "submit") {
    submitArtifact(args);
    return;
  }
  if (subcommand === "list") {
    listArtifacts(args);
    return;
  }
  throw new Error(`未知 artifact 子命令：${subcommand || "(空)"}`);
}

function submitArtifact(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const nodeId = required(args, "node-id");
  getRunNode(run, nodeId);

  const timestamp = now();
  const artifact = createArtifact(root, run, nodeId, {
    type: normalizeEnum(args.type || "evidence", ["evidence", "patch", "plan", "review", "test", "decision", "note"], "type"),
    title: required(args, "title"),
    body: String(args.body || ""),
    refs: splitList(args.refs),
    timestamp
  });
  const event = appendEvent(root, "artifact.submitted", "apex-v2", {
    run_id: run.run_id,
    node_id: nodeId,
    artifact_id: artifact.artifact_id,
    type: artifact.type
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify(artifact, null, 2));
}

function listArtifacts(args) {
  const root = requireStore(projectRoot(args));
  const runId = required(args, "run-id");
  const run = loadRun(root, runId);
  console.log(JSON.stringify(listArtifactsForRun(root, run.run_id), null, 2));
}

