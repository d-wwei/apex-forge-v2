import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withProjectLock } from "../src/core/project-lock.mjs";
import { withProjectTransaction } from "../src/core/project-transaction.mjs";

function projectFixture() {
  const project = mkdtempSync(join(tmpdir(), "apex-transaction-"));
  mkdirSync(join(project, ".apex-v2"), { recursive: true });
  writeFileSync(join(project, ".apex-v2", "state.txt"), "before");
  writeFileSync(join(project, "source.txt"), "before");
  return project;
}

test("project lock is reentrant inside one process", () => {
  const project = projectFixture();
  const values = [];
  withProjectLock(project, () => {
    values.push("outer");
    withProjectLock(project, () => values.push("inner"));
  });
  assert.deepEqual(values, ["outer", "inner"]);
});

test("project transaction restores Kernel and source files after failure", () => {
  const project = projectFixture();
  assert.throws(() => withProjectTransaction(project, {
    kind: "merge-apply",
    idempotencyKey: "merge-1",
    extraPaths: ["source.txt"]
  }, () => {
    writeFileSync(join(project, ".apex-v2", "state.txt"), "after");
    writeFileSync(join(project, "source.txt"), "after");
    throw new Error("failpoint");
  }), /failpoint/);

  assert.equal(readFileSync(join(project, ".apex-v2", "state.txt"), "utf8"), "before");
  assert.equal(readFileSync(join(project, "source.txt"), "utf8"), "before");
  const journals = readdirSync(join(project, ".apex-v2", "transactions"));
  assert.equal(journals.length, 1);
  const record = JSON.parse(readFileSync(join(project, ".apex-v2", "transactions", journals[0]), "utf8"));
  assert.equal(record.status, "failed");
});

test("committed idempotency key returns the previous result without rerunning", () => {
  const project = projectFixture();
  let calls = 0;
  const first = withProjectTransaction(project, {
    kind: "run-create",
    idempotencyKey: "roadmap-1"
  }, () => {
    calls += 1;
    return { run_id: "run-1" };
  });
  const second = withProjectTransaction(project, {
    kind: "run-create",
    idempotencyKey: "roadmap-1"
  }, () => {
    calls += 1;
    return { run_id: "run-2" };
  });

  assert.deepEqual(first, { result: { run_id: "run-1" }, replayed: false });
  assert.deepEqual(second, { result: { run_id: "run-1" }, replayed: true });
  assert.equal(calls, 1);
  assert.equal(existsSync(join(project, ".apex-v2", "transactions")), true);
});
