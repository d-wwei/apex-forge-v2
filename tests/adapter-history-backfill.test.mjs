import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backfillAdapterObservations,
  buildAdapterTrend
} from "../src/core/adapter-observability.mjs";
import { writeJson } from "../src/lib/common.mjs";

test("historical smoke and capability artifacts backfill trend idempotently", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-adapter-backfill-"));
  const root = join(project, ".apex-v2");
  mkdirSync(join(root, "adapters", "history"), { recursive: true });
  mkdirSync(join(root, "approvals"), { recursive: true });
  writeJson(join(root, "project.json"), {
    schema_version: "v0",
    format_version: 1,
    revision: 0,
    project_id: "backfill",
    project_name: "Backfill",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [],
    wip_limits: { active_runs: 1, parallel_workers: 1 }
  });
  writeJson(join(root, "adapters", "capabilities.json"), {
    schema_version: "v0",
    generated_at: "2026-08-01T00:00:00.000Z",
    adapters: [{
      adapter: "codex",
      available: true,
      version: "1.0.0",
      capabilities: ["structured_output"]
    }]
  });
  for (const [index, generatedAt] of [
    "2026-08-02T00:00:00.000Z",
    "2026-08-03T00:00:00.000Z"
  ].entries()) {
    writeJson(join(root, "adapters", `smoke-smoke-${index}.json`), {
      schema_version: "v0",
      smoke_id: `smoke-${index}`,
      generated_at: generatedAt,
      mode: "live",
      status: "PASS",
      results: [{
        adapter: "codex",
        status: "PASS",
        mode: "live",
        version: `${index + 1}.0.0`,
        session_id: null,
        duration_ms: 1,
        errors: []
      }]
    });
  }

  const first = backfillAdapterObservations(root, {
    inspections: [{
      adapter: "codex",
      available: true,
      version: "2.0.0",
      capabilities: ["structured_output"]
    }]
  });
  assert.equal(first.created, 3);
  assert.equal(buildAdapterTrend(root).snapshot_count, 3);
  assert.equal(backfillAdapterObservations(root, { inspections: [] }).created, 0);
  assert.equal(buildAdapterTrend(root).snapshot_count, 3);
});
