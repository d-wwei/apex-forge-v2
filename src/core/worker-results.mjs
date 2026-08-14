import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { now, readJson, shortId, writeJson } from "../lib/common.mjs";
import { workerDir } from "./worker.mjs";

export function buildWorkerSummary(root, worker, record = false) {
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const results = existsSync(dir)
    ? readdirSync(dir)
      .filter((file) => file.startsWith("adapter-result-") && file.endsWith(".json"))
      .map((file) => readJson(join(dir, file)))
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
    : [];
  const patch = readJson(join(dir, "patch-bundle.json"), null);
  const summary = {
    schema_version: "v0",
    summary_id: shortId("worker-summary"),
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    plan_node_id: worker.plan_node_id,
    generated_at: now(),
    final_status: worker.status,
    verdict: ["patch_submitted", "queued", "merged", "evidence_submitted", "decision_submitted"].includes(worker.status) ? "pass" : worker.status === "blocked" ? "fail" : "partial",
    adapters: Array.from(new Set(results.map((result) => result.adapter))),
    attempts: results.map((result) => ({
      result_id: result.result_id,
      adapter: result.adapter,
      status: result.status,
      failure_kind: result.failure_kind || null,
      exit_code: result.exit_code ?? null,
      duration_ms: result.duration_ms || 0,
      usage: result.usage || {
        input_tokens: null,
        output_tokens: null,
        tool_calls: null
      },
      summary: result.summary || ""
    })),
    failures: results.filter((result) => result.status === "FAIL").map((result) => result.failure_kind || "unknown"),
    changed_files: patch?.changed_files || Array.from(new Set(results.flatMap((result) => result.changed_files || []))),
    patch_id: patch?.patch_id || null,
    usage: results.reduce((total, result) => ({
      input_tokens: addNullable(total.input_tokens, result.usage?.input_tokens),
      output_tokens: addNullable(total.output_tokens, result.usage?.output_tokens),
      tool_calls: addNullable(total.tool_calls, result.usage?.tool_calls),
      duration_ms: total.duration_ms + (result.duration_ms || 0)
    }), {
      input_tokens: null,
      output_tokens: null,
      tool_calls: null,
      duration_ms: 0
    })
  };
  if (record) writeJson(join(dir, "worker-summary.json"), summary);
  return summary;
}

function addNullable(left, right) {
  if (left == null && right == null) return null;
  return Number(left || 0) + Number(right || 0);
}
