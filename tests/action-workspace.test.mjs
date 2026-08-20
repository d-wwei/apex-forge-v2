import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  collectActionWorkspaceChanges,
  createActionWorkspace,
  discardActionWorkspace
} from "../src/core/action-workspace.mjs";
import { requireStore } from "../src/core/store.mjs";

test("ActionWorkspace excludes secret files from base, workspace, and manifest", () => {
  const fixture = createFixture();
  write(fixture.project, ".env", "API_TOKEN=audit-secret\n");
  write(fixture.project, "credentials.json", "{\"token\":\"secret\"}\n");

  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-secret");
  assert.equal(existsSync(join(fixture.project, manifest.base_path, ".env")), false);
  assert.equal(existsSync(join(fixture.project, manifest.workspace_path, "credentials.json")), false);
  assert.ok(manifest.excluded.secret >= 2);
  assert.doesNotMatch(
    readFileSync(join(fixture.workerDir, "action-workspace.json"), "utf8"),
    /audit-secret|\"token\":\"secret\"/
  );
});

test("ActionWorkspace reports out-of-scope text without touching the project", () => {
  const fixture = createFixture();
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-scope");
  write(fixture.project, `${manifest.workspace_path}/docs/outside.md`, "outside\n");

  const changes = collectActionWorkspaceChanges(fixture.project, manifest);
  assert.deepEqual(changes.out_of_scope_files, ["docs/outside.md"]);
  assert.equal(existsSync(join(fixture.project, "docs", "outside.md")), false);
});

test("ActionWorkspace turns delete into an explicit unsupported change", () => {
  const fixture = createFixture();
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-delete");
  rmSync(join(fixture.project, manifest.workspace_path, "src", "app.mjs"));

  const changes = collectActionWorkspaceChanges(fixture.project, manifest);
  assert.deepEqual(changes.unsupported_files, ["src/app.mjs:delete"]);
  assert.equal(readFileSync(join(fixture.project, "src", "app.mjs"), "utf8"), "export const value = 1;\n");
});

test("ActionWorkspace rejects binary additions explicitly", () => {
  const fixture = createFixture();
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-binary");
  write(fixture.project, `${manifest.workspace_path}/src/payload.bin`, Buffer.from([0, 1, 2, 3]));

  const changes = collectActionWorkspaceChanges(fixture.project, manifest);
  assert.deepEqual(changes.unsupported_files, ["src/payload.bin:binary"]);
  assert.equal(existsSync(join(fixture.project, "src", "payload.bin")), false);
});

test("ActionWorkspace rejects symlinks without reading their external target", () => {
  const fixture = createFixture();
  const external = join(fixture.project, "..", `apex-external-${Date.now()}.txt`);
  writeFileSync(external, "external-secret\n");
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-symlink");
  symlinkSync(external, join(fixture.project, manifest.workspace_path, "src", "external-link"));

  const changes = collectActionWorkspaceChanges(fixture.project, manifest);
  assert.deepEqual(changes.unsupported_files, ["src/external-link:symlink"]);
  assert.equal(readFileSync(external, "utf8"), "external-secret\n");
  rmSync(external, { force: true });
});

test("ActionWorkspace preserves concurrent project edits while producing base-relative patch", () => {
  const fixture = createFixture();
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-concurrent");
  write(fixture.project, `${manifest.workspace_path}/src/app.mjs`, "export const value = 2;\n");
  write(fixture.project, "src/app.mjs", "export const value = 99;\n");

  const changes = collectActionWorkspaceChanges(fixture.project, manifest);
  assert.equal(changes.operations[0].old_text, "export const value = 1;\n");
  assert.equal(changes.operations[0].new_text, "export const value = 2;\n");
  assert.equal(readFileSync(join(fixture.project, "src", "app.mjs"), "utf8"), "export const value = 99;\n");
});

test("ActionWorkspace creation is idempotent for the same action", () => {
  const fixture = createFixture();
  const first = createActionWorkspace(fixture.root, fixture.worker, "action-repeat");
  write(fixture.project, `${first.workspace_path}/src/app.mjs`, "export const value = 2;\n");
  const second = createActionWorkspace(fixture.root, fixture.worker, "action-repeat");

  assert.equal(second.base_fingerprint, first.base_fingerprint);
  assert.equal(second.workspace_path, first.workspace_path);
  assert.equal(
    readFileSync(join(fixture.project, second.workspace_path, "src", "app.mjs"), "utf8"),
    "export const value = 2;\n"
  );
});

test("ActionWorkspace validation failure cannot leave a main-workspace mutation", () => {
  const fixture = createFixture();
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-failure");
  write(fixture.project, `${manifest.workspace_path}/private/outside.txt`, "outside\n");
  const before = readFileSync(join(fixture.project, "src", "app.mjs"), "utf8");

  const changes = collectActionWorkspaceChanges(fixture.project, manifest);
  assert.equal(changes.out_of_scope_files.length, 1);
  assert.equal(readFileSync(join(fixture.project, "src", "app.mjs"), "utf8"), before);
  assert.equal(existsSync(join(fixture.project, "private", "outside.txt")), false);
});

test("ActionWorkspace cancel removes only action-owned files", () => {
  const fixture = createFixture();
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-cancel");
  write(fixture.project, `${manifest.workspace_path}/src/app.mjs`, "export const value = 2;\n");
  write(fixture.project, "README.md", "concurrent user edit\n");

  const cancelled = discardActionWorkspace(fixture.project, manifest);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(existsSync(resolve(fixture.project, manifest.workspace_path)), false);
  assert.equal(readFileSync(join(fixture.project, "README.md"), "utf8"), "concurrent user edit\n");
  assert.equal(readFileSync(join(fixture.project, "src", "app.mjs"), "utf8"), "export const value = 1;\n");
});

test("startup recovery removes an orphan ActionWorkspace and records durable evidence", () => {
  const fixture = createFixture();
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-orphan");
  writeStartupState(fixture, {
    ...fixture.worker,
    status: "cancelled",
    claim_expires_at: null
  });

  assert.equal(requireStore(fixture.project), fixture.root);

  const recovered = JSON.parse(
    readFileSync(join(fixture.workerDir, "action-workspace.json"), "utf8")
  );
  assert.equal(recovered.status, "failed");
  assert.equal(existsSync(resolve(fixture.project, manifest.workspace_path)), false);
  const events = readFileSync(join(fixture.root, "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(events.at(-1).type, "worker.host.workspace_recovered");
  assert.equal(events.at(-1).payload.worker_id, fixture.worker.worker_id);
  assert.equal(events.at(-1).payload.reason, "worker_cancelled");
});

test("startup recovery expires abandoned claims and permits a fresh ActionWorkspace", () => {
  const fixture = createFixture();
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-expired");
  writeStartupState(fixture, {
    ...fixture.worker,
    status: "claimed",
    claimed_by: "codex-host",
    claim_expires_at: "2000-01-01T00:00:00.000Z"
  });

  requireStore(fixture.project);
  const recovered = JSON.parse(
    readFileSync(join(fixture.workerDir, "action-workspace.json"), "utf8")
  );
  assert.equal(recovered.status, "failed");
  assert.equal(existsSync(resolve(fixture.project, manifest.workspace_path)), false);

  const fresh = createActionWorkspace(fixture.root, fixture.worker, "action-fresh");
  assert.equal(fresh.status, "active");
  assert.equal(fresh.action_id, "action-fresh");
  assert.equal(existsSync(resolve(fixture.project, fresh.workspace_path)), true);
});

test("ActionWorkspace cleanup rejects a persisted path outside its owned container", () => {
  const fixture = createFixture();
  const external = mkdtempSync(join(tmpdir(), "apex-action-external-"));
  const sentinel = join(external, "keep.txt");
  writeFileSync(sentinel, "keep\n");
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-path");
  const tampered = {
    ...manifest,
    workspace_path: relative(fixture.project, join(external, "workspace"))
  };

  assert.throws(
    () => discardActionWorkspace(fixture.project, tampered),
    /ActionWorkspace path|不安全的 patch path/
  );
  assert.equal(readFileSync(sentinel, "utf8"), "keep\n");
});

test("ActionWorkspace fingerprints and patches a dirty project base", () => {
  const fixture = createFixture();
  write(fixture.project, "src/app.mjs", "export const value = 41;\n");
  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-dirty");
  write(fixture.project, `${manifest.workspace_path}/src/app.mjs`, "export const value = 42;\n");

  const changes = collectActionWorkspaceChanges(fixture.project, manifest);
  assert.match(manifest.base_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(changes.operations[0].old_text, "export const value = 41;\n");
  assert.equal(changes.operations[0].new_text, "export const value = 42;\n");
});

test("ActionWorkspace links nested dependency directories without scanning them", () => {
  const fixture = createFixture();
  write(fixture.project, "packages/core/node_modules/tool/package.json", "{\"name\":\"tool\"}\n");

  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-dependencies");
  const dependencyPath = join(
    fixture.project,
    manifest.workspace_path,
    "packages",
    "core",
    "node_modules"
  );

  assert.equal(existsSync(join(dependencyPath, "tool", "package.json")), true);
  write(
    fixture.project,
    `${manifest.workspace_path}/packages/core/node_modules/.vite-temp/cache.mjs`,
    "generated\n"
  );
  assert.equal(
    existsSync(join(fixture.project, "packages", "core", "node_modules", ".vite-temp")),
    false
  );
  assert.equal(collectActionWorkspaceChanges(fixture.project, manifest).changed_files.length, 0);
});

test("ActionWorkspace ignores new Git-ignored test artifacts outside write scope", () => {
  const fixture = createFixture();
  write(fixture.project, ".gitignore", ".apex/\n");
  const initialized = spawnSync("git", ["init", "-q"], {
    cwd: fixture.project,
    encoding: "utf8"
  });
  assert.equal(initialized.status, 0, initialized.stderr);

  const manifest = createActionWorkspace(fixture.root, fixture.worker, "action-gitignore");
  write(
    fixture.project,
    `${manifest.workspace_path}/.apex/orchestrator-logs/test.log`,
    "generated\n"
  );

  const changes = collectActionWorkspaceChanges(fixture.project, manifest);
  assert.deepEqual(changes.changed_files, []);
  assert.deepEqual(changes.out_of_scope_files, []);
});

function createFixture() {
  const project = mkdtempSync(join(tmpdir(), "apex-action-workspace-"));
  const root = join(project, ".apex-v2");
  const workerDir = join(root, "runs", "run-1", "workers", "worker-1");
  mkdirSync(workerDir, { recursive: true });
  write(project, "src/app.mjs", "export const value = 1;\n");
  write(project, "README.md", "fixture\n");
  return {
    project,
    root,
    workerDir,
    worker: {
      worker_id: "worker-1",
      run_id: "run-1",
      plan_node_id: "delivery-implementation",
      write_scope: ["src/"]
    }
  };
}

function writeStartupState(fixture, worker) {
  writeFileSync(
    join(fixture.workerDir, "worker.json"),
    `${JSON.stringify(worker, null, 2)}\n`
  );
  writeFileSync(join(fixture.root, "events.jsonl"), "");
  writeFileSync(
    join(fixture.root, "project.json"),
    `${JSON.stringify({
      schema_version: "v0",
      format_version: 1,
      revision: 0,
      project_id: "project-action-workspace",
      project_name: "Action Workspace",
      created_at: "2026-08-17T00:00:00.000Z",
      updated_at: "2026-08-17T00:00:00.000Z",
      active_milestone: null,
      knowledge_version: 0,
      last_event_id: null,
      active_runs: ["run-1"],
      wip_limits: { active_runs: 1, parallel_workers: 1 }
    }, null, 2)}\n`
  );
}

function write(project, path, content) {
  const target = join(project, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
