import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectWorkspaceChanges } from "../src/core/worker-execution.mjs";

test("worker diff ignores the transient scheduler lock", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-worker-diff-"));
  const project = join(root, "project");
  const workspace = join(root, "workspace");
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(workspace, "src"), { recursive: true });
  mkdirSync(join(project, ".apex-v2.scheduler-lock"), { recursive: true });
  writeFileSync(join(project, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(workspace, "src", "value.mjs"), "export const value = 2;\n");
  writeFileSync(
    join(project, ".apex-v2.scheduler-lock", "owner.json"),
    "{\"pid\":123}\n"
  );

  const changes = collectWorkspaceChanges(project, workspace, ["src/value.mjs"]);
  assert.deepEqual(changes.changed_files, ["src/value.mjs"]);
  assert.deepEqual(changes.out_of_scope_files, []);
});
