import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { computeBenchmarkBaseIdentity } from "../src/benchmark/base-provenance.mjs";

test("base fingerprint is stable across generated paths and timestamps", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-base-provenance-"));
  writeBase(root, "repo", {
    target: "/first/path",
    prepared_at: "2026-08-01T00:00:00.000Z"
  });
  const first = computeBenchmarkBaseIdentity({
    baseRoot: root,
    repositories: [{ id: "repo" }]
  });

  writeBase(root, "repo", {
    target: "/second/path",
    prepared_at: "2026-08-27T00:00:00.000Z"
  });
  const second = computeBenchmarkBaseIdentity({
    baseRoot: root,
    repositories: [{ id: "repo" }]
  });

  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
});

test("base fingerprint changes when selected dependency provenance changes", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-base-provenance-"));
  writeBase(root, "repo", { dependency_hash: "1".repeat(64) });
  const first = computeBenchmarkBaseIdentity({
    baseRoot: root,
    repositories: [{ id: "repo" }]
  });
  writeBase(root, "repo", { dependency_hash: "2".repeat(64) });
  const second = computeBenchmarkBaseIdentity({
    baseRoot: root,
    repositories: [{ id: "repo" }]
  });
  assert.notEqual(first.fingerprint, second.fingerprint);
});

function writeBase(root, id, overrides = {}) {
  const repositoryRoot = join(root, id);
  mkdirSync(repositoryRoot, { recursive: true });
  writeFileSync(join(repositoryRoot, ".benchmark-source.json"), JSON.stringify({
    id,
    source_commit: "a".repeat(40),
    source_tree: "b".repeat(40),
    source_manifest_sha256: "c".repeat(64),
    source_file_count: 3,
    prepared_at: "2026-08-01T00:00:00.000Z",
    target: "/tmp/base"
  }));
  writeFileSync(join(repositoryRoot, ".benchmark-dependencies.json"), JSON.stringify({
    install_command: "npm install",
    dependency_hash: "d".repeat(64),
    evidence: [{ path: "package-lock.json", sha256: "e".repeat(64) }],
    prepare: {
      command: "npm run build",
      artifacts: [{ path: "dist/index.js", sha256: "f".repeat(64) }]
    },
    package_manager_versions: { npm: "10.0.0" },
    ...overrides
  }));
}
