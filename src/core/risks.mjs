import { join } from "node:path";
import { now, readJson, shortId, writeJson } from "../lib/common.mjs";

export function listRisks(root, status = null) {
  const risks = readJson(join(root, "risks", "register.json"), []);
  return status ? risks.filter((risk) => risk.status === status) : risks;
}

export function addRisk(root, input) {
  const risks = listRisks(root);
  const existing = input.dedupe_key ? risks.find((risk) => risk.dedupe_key === input.dedupe_key) : null;
  if (existing) return existing;
  const timestamp = now();
  const risk = {
    schema_version: "v0",
    id: shortId("risk"),
    dedupe_key: input.dedupe_key || "",
    source: input.source,
    title: input.title,
    description: input.description || "",
    severity: input.severity || "medium",
    status: "open",
    run_id: input.run_id || null,
    carry_id: input.carry_id || null,
    conflict_key: input.conflict_key || null,
    owner: input.owner || "project-kernel",
    evidence_refs: input.evidence_refs || [],
    resolution: "",
    created_at: timestamp,
    updated_at: timestamp
  };
  risks.push(risk);
  writeJson(join(root, "risks", "register.json"), risks);
  return risk;
}

export function updateRisk(root, id, status, resolution) {
  const path = join(root, "risks", "register.json");
  const risks = readJson(path, []);
  const risk = risks.find((item) => item.id === id);
  if (!risk) throw new Error(`找不到 risk：${id}`);
  risk.status = status;
  risk.resolution = resolution || "";
  risk.updated_at = now();
  writeJson(path, risks);
  return risk;
}

export function syncCarryRisk(root, runId, carry) {
  const risk = addRisk(root, {
    dedupe_key: `carry:${runId}:${carry.id}`,
    source: "carry_forward",
    title: carry.description,
    description: `source_node=${carry.source_node_id}; target_node=${carry.target_node_id || "none"}`,
    severity: carry.severity,
    run_id: runId,
    carry_id: carry.id,
    evidence_refs: carry.evidence_refs
  });
  if (carry.status === "resolved") return updateRisk(root, risk.id, "mitigated", carry.resolution);
  if (carry.status === "accepted") return updateRisk(root, risk.id, "accepted", carry.resolution);
  return risk;
}

export function syncConflictRisks(root, runId, conflicts) {
  return conflicts.map((conflict) => addRisk(root, {
    dedupe_key: `conflict:${runId}:${conflict.kind}:${conflict.file}:${[...conflict.patch_ids].sort().join(",")}`,
    source: "merge_conflict",
    title: `Merge conflict：${conflict.file}`,
    description: `${conflict.kind}; patches=${conflict.patch_ids.join(",")}`,
    severity: "high",
    run_id: runId,
    conflict_key: `${conflict.kind}:${conflict.file}`,
    evidence_refs: [`.apex-v2/runs/${runId}/merge-queue.json`]
  }));
}

export function resolveConflictRisks(root, runId, conflicts, resolution) {
  const risks = listRisks(root);
  const keys = new Set(conflicts.map((conflict) => `${conflict.kind}:${conflict.file}`));
  const updated = [];
  for (const risk of risks) {
    if (risk.run_id !== runId || risk.source !== "merge_conflict" || !keys.has(risk.conflict_key)) continue;
    updated.push(updateRisk(root, risk.id, "mitigated", resolution));
  }
  return updated;
}

export function syncVerificationRisk(root, runId, report) {
  const existing = listRisks(root).find((risk) => risk.dedupe_key === `verification:${runId}`);
  if (report.status === "PASS") {
    return existing?.status === "open" ? updateRisk(root, existing.id, "mitigated", "subsequent verification passed") : null;
  }
  const risk = addRisk(root, {
    dedupe_key: `verification:${runId}`,
    source: "verification",
    title: `Verification failed：${runId}`,
    description: report.checks.filter((check) => check.status === "FAIL").map((check) => `${check.id}:${check.command}`).join("; "),
    severity: "high",
    run_id: runId,
    evidence_refs: [`.apex-v2/runs/${runId}/verification-report.json`]
  });
  return risk;
}

export function syncReviewRisk(root, runId, report) {
  const existing = listRisks(root).find((risk) => risk.dedupe_key === `review:${runId}`);
  if (report.status === "PASS") {
    return existing?.status === "open" ? updateRisk(root, existing.id, "mitigated", "subsequent review passed") : null;
  }
  const risk = addRisk(root, {
    dedupe_key: `review:${runId}`,
    source: "review",
    title: `Review blocked：${runId}`,
    description: report.blocking_findings.join("; "),
    severity: "high",
    run_id: runId,
    evidence_refs: [`.apex-v2/runs/${runId}/review-report.json`]
  });
  return risk;
}

export function syncAdapterSmokeRisk(root, report) {
  if (report.mode !== "live") return null;
  const existing = listRisks(root).find((risk) => risk.dedupe_key === "adapter-smoke");
  if (report.status === "PASS") {
    return existing?.status === "open" ? updateRisk(root, existing.id, "mitigated", "subsequent adapter smoke passed") : null;
  }
  if (existing && existing.status !== "open") {
    return updateRisk(root, existing.id, "open", "reopened after adapter smoke failure");
  }
  return addRisk(root, {
    dedupe_key: "adapter-smoke",
    source: "verification",
    title: "Adapter smoke failed",
    description: report.results.filter((item) => item.status === "FAIL").map((item) => `${item.adapter}:${item.errors.join(",")}`).join("; "),
    severity: "critical",
    evidence_refs: [`.apex-v2/adapters/${report.mode === "live" ? "latest-live-smoke.json" : "latest-static-smoke.json"}`]
  });
}
