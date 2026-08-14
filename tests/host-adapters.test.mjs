import test from "node:test";
import assert from "node:assert/strict";
import {
  getHostAdapter,
  inspectHostAdapters
} from "../src/hosts/registry.mjs";

test("Codex and Claude HostAdapters expose the same Kernel action contract", () => {
  const inspections = inspectHostAdapters();
  assert.deepEqual(
    inspections.map((item) => item.host_id).sort(),
    ["claude-code-host", "codex-host"]
  );

  const input = {
    projectDir: "/tmp/project",
    workerId: "worker-1",
    summary: "completed",
    refs: ["evidence.json"]
  };
  const codex = getHostAdapter("codex-host");
  const claude = getHostAdapter("claude-code-host");

  assert.deepEqual(codex.claimAction(input).command, claude.claimAction(input).command);
  assert.deepEqual(codex.submitArtifact(input).command, claude.submitArtifact(input).command);
  assert.notEqual(codex.describeHost().id, claude.describeHost().id);
});

test("HostAdapter approval, progress, and cancellation remain platform-native envelopes", () => {
  const adapter = getHostAdapter("codex-host");
  assert.equal(adapter.requestApproval({ approvalId: "approval-1" }).kind, "approval_request");
  assert.equal(adapter.reportProgress({ message: "working" }).kind, "progress_report");
  assert.equal(adapter.cancelAction({ workerId: "worker-1" }).kind, "action_cancel");
});
