import { join, resolve } from "node:path";
import { readJson } from "../lib/common.mjs";
import { buildCandidateSet } from "./candidate.mjs";
import { assertCognitiveEvidenceSemantics } from "./cognitive-evidence.mjs";
import { validateContract } from "./contracts.mjs";
import { loadRun } from "./run-state.mjs";

export function validateWorkerSemanticEvidence(root, worker, evidence) {
  if (!evidence) {
    throw new Error(
      `cognitive action 必须提交 typed semantic evidence：${worker.plan_node_id}`
    );
  }
  const expectedType = cognitiveEvidenceType(worker.plan_node_id);
  if (evidence.evidence_type !== expectedType) {
    throw new Error(
      `cognitive evidence 类型不匹配：${evidence.evidence_type} != ${expectedType}`
    );
  }
  if (evidence.objective !== worker.objective) {
    throw new Error("cognitive evidence objective 必须与 Worker objective 一致");
  }
  if (expectedType === "review") {
    const expectedDigest = cognitiveEvidenceCandidateDigest(root, worker);
    if (evidence.candidate_digest !== expectedDigest) {
      throw new Error("review evidence 未绑定当前 candidate_digest");
    }
  }
  const validation = validateContract(
    "cognitive-evidence.schema.json",
    evidence,
    `${worker.namespace}/cognitive-evidence.json`
  );
  if (!validation.valid) {
    throw new Error(
      `cognitive evidence contract 无效：${JSON.stringify(validation.errors)}`
    );
  }
  assertCognitiveEvidenceSemantics(evidence);
  return evidence;
}

export function cognitiveEvidenceCandidateDigest(root, worker) {
  if (cognitiveEvidenceType(worker.plan_node_id) !== "review") return null;
  const run = loadRun(root, worker.run_id);
  const queue = readJson(join(root, "runs", worker.run_id, "merge-queue.json"), {
    schema_version: "v0",
    run_id: worker.run_id,
    updated_at: new Date().toISOString(),
    items: [],
    conflicts: [],
    resolutions: []
  });
  return buildCandidateSet(root, run, queue, resolve(root, ".."))
    .candidate_digest;
}

export function cognitiveEvidenceType(planNodeId) {
  if (planNodeId.endsWith("context")) return "context";
  if (planNodeId.endsWith("risk")) return "risk";
  if (planNodeId.endsWith("design")) return "design";
  if (planNodeId.endsWith("review")) return "review";
  throw new Error(`未知 cognitive evidence 类型：${planNodeId}`);
}
