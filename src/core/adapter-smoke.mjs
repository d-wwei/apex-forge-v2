import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getWorkerExecutor,
  inspectWorkerExecutors
} from "../executors/registry.mjs";
import { DEFAULT_SMOKE_EXECUTOR_IDS } from "../executors/defaults.mjs";
import { now, shortId } from "../lib/common.mjs";
import { validateContract } from "./contracts.mjs";
import { schemaPath } from "./schema-paths.mjs";

const RESULT_SCHEMA = schemaPath("agent-result.schema.json");

export function runAdapterSmoke(options = {}) {
  const names = options.adapters || DEFAULT_SMOKE_EXECUTOR_IDS;
  const inspections = new Map(inspectWorkerExecutors().map((item) => [item.adapter, item]));
  const results = [];
  for (const name of names) {
    const info = inspections.get(name);
    if (!info?.available) {
      results.push({ adapter: name, status: "FAIL", mode: options.live ? "live" : "static", version: info?.version || "", session_id: null, duration_ms: 0, errors: [info?.error || "unavailable"] });
      continue;
    }
    if (!options.live) {
      results.push({ adapter: name, status: "PASS", mode: "static", version: info.version, session_id: null, duration_ms: 0, errors: [] });
      continue;
    }
    results.push(runLiveProbe(name, info, options.timeoutMs || 180000));
  }
  return {
    schema_version: "v0",
    smoke_id: shortId("adapter-smoke"),
    generated_at: now(),
    mode: options.live ? "live" : "static",
    status: results.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    results
  };
}

function runLiveProbe(name, info, timeoutMs) {
  const workspace = mkdtempSync(join(tmpdir(), `apex-adapter-smoke-${name}-`));
  const outputPath = join(workspace, "result.json");
  const prompt = 'Do not use tools or modify files. Return verdict "pass", summary "adapter smoke", tests [], risks [], evidence_refs [] using the required structured output.';
  try {
    const executor = getWorkerExecutor(name);
    const execution = executor.execute({
      executable: name,
      workspaceDir: workspace,
      prompt,
      outputSchemaPath: RESULT_SCHEMA,
      outputPath,
      timeoutMs,
      smoke: true
    });
    if (execution.exit_code !== 0 || !existsSync(outputPath)) {
      return { adapter: name, status: "FAIL", mode: "live", version: info.version, session_id: execution.session_id || null, duration_ms: execution.duration_ms, errors: [execution.stderr_tail || "missing structured output"] };
    }
    const value = JSON.parse(readFileSync(outputPath, "utf8"));
    const contract = validateContract("agent-result.schema.json", value, `${name} smoke`);
    return {
      adapter: name,
      status: contract.valid && value.verdict === "pass" ? "PASS" : "FAIL",
      mode: "live",
      version: info.version,
      session_id: execution.session_id || null,
      duration_ms: execution.duration_ms,
      errors: contract.errors.map((item) => `${item.instance_path} ${item.message}`)
    };
  } catch (error) {
    return { adapter: name, status: "FAIL", mode: "live", version: info.version, session_id: null, duration_ms: 0, errors: [error.message] };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
