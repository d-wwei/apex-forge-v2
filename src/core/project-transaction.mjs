import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  ensureDir,
  now,
  shortId,
  writeJson
} from "../lib/common.mjs";
import { withProjectLock } from "./project-lock.mjs";

export function withProjectTransaction(projectDir, options, action) {
  const resolvedProject = resolve(projectDir);
  return withProjectLock(resolvedProject, () => {
    const root = join(resolvedProject, ".apex-v2");
    const transactionDir = join(root, "transactions");
    ensureDir(transactionDir);
    const replay = findCommittedTransaction(transactionDir, options.idempotencyKey);
    if (replay) return { result: replay.result, replayed: true };

    const backupDir = mkdtempSync(join(tmpdir(), "apex-project-transaction-"));
    const rootBackup = join(backupDir, "apex-v2");
    cpSync(root, rootBackup, { recursive: true });
    const extraSnapshots = snapshotExtraPaths(resolvedProject, options.extraPaths || [], backupDir);
    const transactionId = shortId("transaction");
    const recordPath = join(transactionDir, `${transactionId}.json`);
    const startedAt = now();
    writeJson(recordPath, transactionRecord({
      transactionId,
      kind: options.kind,
      idempotencyKey: options.idempotencyKey,
      status: "started",
      startedAt
    }));

    try {
      const result = action();
      if (process.env.APEX_V2_TRANSACTION_FAILPOINT === options.kind) {
        throw new Error(`transaction failpoint: ${options.kind}`);
      }
      writeJson(recordPath, transactionRecord({
        transactionId,
        kind: options.kind,
        idempotencyKey: options.idempotencyKey,
        status: "committed",
        startedAt,
        completedAt: now(),
        result
      }));
      return { result, replayed: false };
    } catch (error) {
      restoreRoot(root, rootBackup);
      restoreExtraPaths(resolvedProject, extraSnapshots);
      ensureDir(join(root, "transactions"));
      writeJson(join(root, "transactions", `${transactionId}.json`), transactionRecord({
        transactionId,
        kind: options.kind,
        idempotencyKey: options.idempotencyKey,
        status: "failed",
        startedAt,
        completedAt: now(),
        error: error.message
      }));
      throw error;
    } finally {
      rmSync(backupDir, { recursive: true, force: true });
    }
  });
}

function findCommittedTransaction(transactionDir, idempotencyKey) {
  if (!idempotencyKey || !existsSync(transactionDir)) return null;
  for (const file of readdirSync(transactionDir).filter((name) => name.endsWith(".json")).sort().reverse()) {
    try {
      const record = JSON.parse(readFileSync(join(transactionDir, file), "utf8"));
      if (record.idempotency_key === idempotencyKey && record.status === "committed") return record;
    } catch {}
  }
  return null;
}

function transactionRecord(input) {
  return {
    schema_version: "v0",
    transaction_id: input.transactionId,
    kind: input.kind,
    idempotency_key: input.idempotencyKey,
    status: input.status,
    started_at: input.startedAt,
    completed_at: input.completedAt || null,
    result: input.result ?? null,
    error: input.error || null
  };
}

function snapshotExtraPaths(projectDir, paths, backupDir) {
  return paths.map((relativePath, index) => {
    const source = join(projectDir, relativePath);
    const backup = join(backupDir, "extra", String(index));
    const exists = existsSync(source);
    if (exists) {
      mkdirSync(dirname(backup), { recursive: true });
      cpSync(source, backup, { recursive: true });
    }
    return { relativePath, backup, exists };
  });
}

function restoreRoot(root, backup) {
  rmSync(root, { recursive: true, force: true });
  cpSync(backup, root, { recursive: true });
}

function restoreExtraPaths(projectDir, snapshots) {
  for (const snapshot of snapshots) {
    const target = join(projectDir, snapshot.relativePath);
    rmSync(target, { recursive: true, force: true });
    if (!snapshot.exists) continue;
    mkdirSync(dirname(target), { recursive: true });
    cpSync(snapshot.backup, target, { recursive: true });
  }
}
