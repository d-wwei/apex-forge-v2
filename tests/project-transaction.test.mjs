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
import { spawnSync } from "node:child_process";
import { withProjectLock } from "../src/core/project-lock.mjs";
import {
  recoverProjectTransactions,
  withProjectTransaction
} from "../src/core/project-transaction.mjs";

const TRANSACTION = new URL("../src/core/project-transaction.mjs", import.meta.url).href;

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

test("nested project transaction reuses the outer WAL without recovering it", () => {
  const project = projectFixture();
  const result = withProjectTransaction(project, {
    kind: "outer",
    idempotencyKey: "outer-1",
    extraPaths: ["source.txt"]
  }, () => {
    writeFileSync(join(project, ".apex-v2", "state.txt"), "outer");
    const nested = withProjectTransaction(project, {
      kind: "inner",
      idempotencyKey: "inner-1"
    }, () => {
      writeFileSync(join(project, "source.txt"), "inner");
      return "nested";
    });
    assert.equal(nested.nested, true);
    assert.equal(readFileSync(join(project, ".apex-v2", "state.txt"), "utf8"), "outer");
    return nested.result;
  });

  assert.equal(result.result, "nested");
  assert.equal(readFileSync(join(project, ".apex-v2", "state.txt"), "utf8"), "outer");
  assert.equal(readFileSync(join(project, "source.txt"), "utf8"), "inner");
  const journals = readdirSync(join(project, ".apex-v2", "transactions"));
  assert.equal(journals.length, 1);
});

test("SIGKILL 后下一次启动会从 durable journal 恢复", () => {
  const project = projectFixture();
  const script = join(project, "kill-transaction.mjs");
  writeFileSync(script, `
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { withProjectTransaction } from ${JSON.stringify(TRANSACTION)};
const project = process.argv[2];
withProjectTransaction(project, {
  kind: "kill-recovery",
  idempotencyKey: "kill-recovery-1",
  extraPaths: ["source.txt"]
}, () => {
  writeFileSync(join(project, ".apex-v2", "state.txt"), "after");
  writeFileSync(join(project, "source.txt"), "after");
  process.kill(process.pid, "SIGKILL");
});
`);
  const killed = spawnSync(process.execPath, [script, project], { encoding: "utf8" });
  assert.equal(killed.signal, "SIGKILL");
  assert.equal(readFileSync(join(project, ".apex-v2", "state.txt"), "utf8"), "after");
  assert.equal(readFileSync(join(project, "source.txt"), "utf8"), "after");

  const recovered = recoverProjectTransactions(project);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].status, "recovered");
  assert.equal(readFileSync(join(project, ".apex-v2", "state.txt"), "utf8"), "before");
  assert.equal(readFileSync(join(project, "source.txt"), "utf8"), "before");
  assert.equal(existsSync(join(project, ".apex-v2.transaction-backups")), false);
});

test("transaction extraPaths 不允许越出项目根", () => {
  const project = projectFixture();
  assert.throws(() => withProjectTransaction(project, {
    kind: "path-escape",
    idempotencyKey: "path-escape-1",
    extraPaths: ["../outside.txt"]
  }, () => ({ ok: true })), /不安全的 patch path|越出项目根/);
  assert.equal(existsSync(join(project, ".apex-v2.transaction-backups")), false);
});
