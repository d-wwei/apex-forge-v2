import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  boundWorkspaceChanges,
  collectWorkspaceChanges
} from "../src/core/worker-execution.mjs";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`
  );
  return result.stdout.trim();
}

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

test("worker diff ignores executor-owned metadata directories", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-worker-metadata-"));
  const project = join(root, "project");
  const workspace = join(root, "workspace");
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(project, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(workspace, "src", "value.mjs"), "export const value = 1;\n");
  for (const directory of [".codex", ".claude", ".gemini", ".npm"]) {
    mkdirSync(join(workspace, directory), { recursive: true });
    writeFileSync(join(workspace, directory, "state.json"), "{}\n");
  }

  const changes = collectWorkspaceChanges(project, workspace, []);
  assert.deepEqual(changes.changed_files, []);
  assert.deepEqual(changes.out_of_scope_files, []);
});

test("worktree diff uses its own HEAD instead of dirty project files", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-worker-git-diff-"));
  const project = join(root, "project");
  const workspace = join(root, "workspace");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(project, "README.md"), "clean\n");
  git(project, ["init", "-b", "main"]);
  git(project, ["config", "user.email", "test@example.com"]);
  git(project, ["config", "user.name", "Apex Test"]);
  git(project, ["add", "."]);
  git(project, ["commit", "-m", "baseline"]);
  git(project, ["worktree", "add", "--detach", workspace, "HEAD"]);

  writeFileSync(join(project, "README.md"), "dirty parent\n");
  mkdirSync(join(project, "benchmarks", "generated"), { recursive: true });
  writeFileSync(join(project, "benchmarks", "generated", "result.json"), "{}\n");
  writeFileSync(join(workspace, "src", "value.mjs"), "export const value = 2;\n");

  const changes = collectWorkspaceChanges(project, workspace, ["src/value.mjs"]);
  assert.deepEqual(changes.changed_files, ["src/value.mjs"]);
  assert.deepEqual(changes.out_of_scope_files, []);
  assert.equal(changes.operations.length, 1);
  assert.equal(changes.operations[0].old_text, "export const value = 1;\n");
});

test("nested scratch sandbox is not mistaken for the parent Git worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-worker-scratch-diff-"));
  const project = join(root, "project");
  const workspace = join(project, ".apex-v2", "runs", "run-1", "sandbox");
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(project, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(workspace, "src", "value.mjs"), "export const value = 2;\n");
  git(project, ["init", "-b", "main"]);
  git(project, ["config", "user.email", "test@example.com"]);
  git(project, ["config", "user.name", "Apex Test"]);
  git(project, ["add", "src/value.mjs"]);
  git(project, ["commit", "-m", "baseline"]);

  const changes = collectWorkspaceChanges(project, workspace, ["src/value.mjs"]);
  assert.deepEqual(changes.changed_files, ["src/value.mjs"]);
  assert.deepEqual(changes.out_of_scope_files, []);
  assert.equal(changes.operations.length, 1);
});

test("persisted workspace change evidence is bounded without losing counts", () => {
  const paths = Array.from({ length: 1000 }, (_, index) =>
    `benchmarks/generated/result-${String(index).padStart(4, "0")}.json`
  );
  const bounded = boundWorkspaceChanges({
    changed_files: paths,
    out_of_scope_files: paths,
    unsupported_files: [],
    operations: []
  }, 25);

  assert.equal(bounded.changed_files.length, 25);
  assert.equal(bounded.out_of_scope_files.length, 25);
  assert.deepEqual(bounded.change_summary, {
    changed_file_count: 1000,
    out_of_scope_file_count: 1000,
    unsupported_file_count: 0,
    list_limit: 25,
    truncated: true
  });
});
