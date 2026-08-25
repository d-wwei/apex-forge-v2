import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  inspectPreparedSource,
  sourceManifestFromGit
} from "../src/benchmark/prepared-source.mjs";

test("prepared source provenance is derived from Git objects, not a self-reported manifest", () => {
  const fixture = sourceFixture();
  const expected = sourceManifestFromGit(fixture.repository);
  const initial = inspectPreparedSource({
    repository: fixture.repository,
    workspace: fixture.workspace
  });

  assert.equal(initial.status, "PASS", JSON.stringify(initial.errors));
  assert.equal(initial.source_manifest_sha256, expected.source_manifest_sha256);

  writeFileSync(join(fixture.workspace, "src", "value.mjs"), "export const value = 999;\n");
  writeFileSync(join(fixture.workspace, ".benchmark-source.json"), JSON.stringify({
    id: fixture.repository.id,
    source_commit: fixture.repository.source_commit,
    source_tree: fixture.repository.source_tree,
    source_manifest_sha256: expected.source_manifest_sha256
  }));

  const tampered = inspectPreparedSource({
    repository: fixture.repository,
    workspace: fixture.workspace
  });
  assert.equal(tampered.status, "FAIL");
  assert.ok(tampered.errors.some((error) => error.kind === "source_content_mismatch"));
});

test("prepared source provenance rejects deleted, added, and mode-changed source files", () => {
  const deleted = sourceFixture();
  spawn(deleted.workspace, ["rm", "src/value.mjs"]);
  assert.equal(inspectPreparedSource({
    repository: deleted.repository,
    workspace: deleted.workspace
  }).status, "FAIL");

  const added = sourceFixture();
  writeFileSync(join(added.workspace, "src", "extra.mjs"), "export const extra = true;\n");
  assert.ok(inspectPreparedSource({
    repository: added.repository,
    workspace: added.workspace
  }).errors.some((error) => error.kind === "unexpected_source_file"));

  const modeChanged = sourceFixture();
  spawn(modeChanged.workspace, ["chmod", "+x", "src/value.mjs"]);
  assert.ok(inspectPreparedSource({
    repository: modeChanged.repository,
    workspace: modeChanged.workspace
  }).errors.some((error) => error.kind === "source_mode_mismatch"));
});

function sourceFixture() {
  const root = mkdtempSync(join(tmpdir(), "apex-prepared-source-"));
  const source = join(root, "source");
  const workspace = join(root, "workspace");
  mkdirSync(join(source, "src"), { recursive: true });
  writeFileSync(join(source, "src", "value.mjs"), "export const value = 1;\n");
  spawn(source, ["git", "init", "-q"]);
  spawn(source, ["git", "config", "user.name", "Test"]);
  spawn(source, ["git", "config", "user.email", "test@example.com"]);
  spawn(source, ["git", "add", "-A"]);
  spawn(source, ["git", "commit", "-qm", "source"]);
  const sourceCommit = output(source, ["git", "rev-parse", "HEAD"]);
  const sourceTree = output(source, ["git", "rev-parse", "HEAD^{tree}"]);
  spawn(root, ["cp", "-R", `${source}/.`, workspace]);
  spawn(workspace, ["rm", "-rf", ".git"]);
  writeFileSync(join(workspace, ".benchmark-source.json"), "{}\n");
  return {
    workspace,
    repository: {
      id: "repo",
      source_path: source,
      source_commit: sourceCommit,
      source_tree: sourceTree,
      prepare_outputs: []
    }
  };
}

function output(cwd, args) {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function spawn(cwd, args) {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
