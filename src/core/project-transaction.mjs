import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  assertSafeRelativePath,
  ensureDir,
  now,
  shortId,
  writeJson
} from "../lib/common.mjs";
import { withProjectLock } from "./project-lock.mjs";

const BACKUP_ROOT_NAME = ".apex-v2.transaction-backups";
const ACTIVE_TRANSACTIONS = new Map();

export function withProjectTransaction(projectDir, options, action) {
  const resolvedProject = resolve(projectDir);
  return withProjectLock(resolvedProject, () => {
    const active = ACTIVE_TRANSACTIONS.get(resolvedProject);
    if (active) {
      active.depth += 1;
      try {
        return { result: action(), replayed: false, nested: true };
      } finally {
        active.depth -= 1;
      }
    }
    recoverStartedTransactionsUnlocked(resolvedProject);
    const root = join(resolvedProject, ".apex-v2");
    const transactionDir = join(root, "transactions");
    ensureDir(transactionDir);
    const replay = findCommittedTransaction(transactionDir, options.idempotencyKey);
    if (replay) return { result: replay.result, replayed: true };

    const transactionId = shortId("transaction");
    const backupDir = join(resolvedProject, BACKUP_ROOT_NAME, transactionId);
    const rootBackup = join(backupDir, "apex-v2");
    for (const path of options.extraPaths || []) {
      assertContainedRelativePath(resolvedProject, path);
    }
    ensureDir(backupDir);
    cpSync(root, rootBackup, { recursive: true });
    const extraSnapshots = snapshotExtraPaths(
      resolvedProject,
      options.extraPaths || [],
      backupDir
    );
    const recordPath = join(transactionDir, `${transactionId}.json`);
    const startedAt = now();
    const startedRecord = transactionRecord({
      transactionId,
      kind: options.kind,
      idempotencyKey: options.idempotencyKey,
      status: "started",
      startedAt,
      backupPath: relative(resolvedProject, rootBackup),
      extraSnapshots
    });
    writeJson(recordPath, startedRecord);
    ACTIVE_TRANSACTIONS.set(resolvedProject, {
      transaction_id: transactionId,
      depth: 1
    });

    try {
      const result = action();
      if (process.env.APEX_V2_TRANSACTION_FAILPOINT === options.kind) {
        throw new Error(`transaction failpoint: ${options.kind}`);
      }
      writeJson(recordPath, transactionRecord({
        ...startedRecord,
        status: "committed",
        completedAt: now(),
        result
      }));
      cleanupBackup(resolvedProject, backupDir);
      return { result, replayed: false };
    } catch (error) {
      restoreTransaction(resolvedProject, startedRecord);
      ensureDir(join(root, "transactions"));
      writeJson(join(root, "transactions", `${transactionId}.json`), transactionRecord({
        ...startedRecord,
        status: "failed",
        completedAt: now(),
        error: error.message
      }));
      cleanupBackup(resolvedProject, backupDir);
      throw error;
    } finally {
      ACTIVE_TRANSACTIONS.delete(resolvedProject);
    }
  });
}

export function recoverProjectTransactions(projectDir) {
  const resolvedProject = resolve(projectDir);
  return withProjectLock(
    resolvedProject,
    () => recoverStartedTransactionsUnlocked(resolvedProject)
  );
}

function recoverStartedTransactionsUnlocked(projectDir) {
  const root = join(projectDir, ".apex-v2");
  const transactionDir = join(root, "transactions");
  if (!existsSync(transactionDir)) {
    cleanupOrphanBackups(projectDir, new Set());
    return [];
  }
  const records = readdirSync(transactionDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, record: readTransaction(join(transactionDir, name)) }))
    .filter(({ record }) => record?.status === "started");
  const liveBackups = new Set(records.map(({ record }) =>
    dirname(resolveContainedPath(projectDir, record.backup_path))
  ));
  const recovered = [];
  for (const { name, record } of records) {
    restoreTransaction(projectDir, record);
    const restoredRoot = join(projectDir, ".apex-v2");
    ensureDir(join(restoredRoot, "transactions"));
    const completedAt = now();
    const next = transactionRecord({
      ...record,
      status: "recovered",
      completedAt,
      recoveredAt: completedAt,
      error: "recovered unfinished transaction during startup"
    });
    writeJson(join(restoredRoot, "transactions", name), next);
    const backupDir = dirname(resolveContainedPath(projectDir, record.backup_path));
    cleanupBackup(projectDir, backupDir);
    recovered.push(next);
  }
  cleanupOrphanBackups(projectDir, liveBackups);
  return recovered;
}

function findCommittedTransaction(transactionDir, idempotencyKey) {
  if (!idempotencyKey || !existsSync(transactionDir)) return null;
  for (const file of readdirSync(transactionDir).filter((name) => name.endsWith(".json")).sort().reverse()) {
    const record = readTransaction(join(transactionDir, file));
    if (record?.idempotency_key === idempotencyKey && record.status === "committed") return record;
  }
  return null;
}

function readTransaction(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function transactionRecord(input) {
  return {
    schema_version: "v0",
    transaction_id: input.transactionId || input.transaction_id,
    kind: input.kind,
    idempotency_key: input.idempotencyKey || input.idempotency_key,
    status: input.status,
    started_at: input.startedAt || input.started_at,
    completed_at: input.completedAt || input.completed_at || null,
    recovered_at: input.recoveredAt || input.recovered_at || null,
    backup_path: input.backupPath || input.backup_path,
    extra_snapshots: input.extraSnapshots || input.extra_snapshots || [],
    result: input.result ?? null,
    error: input.error || null
  };
}

function snapshotExtraPaths(projectDir, paths, backupDir) {
  return paths.map((relativePath, index) => {
    assertContainedRelativePath(projectDir, relativePath);
    const source = resolve(projectDir, relativePath);
    const backup = join(backupDir, "extra", String(index));
    const existed = existsSync(source);
    if (existed) {
      mkdirSync(dirname(backup), { recursive: true });
      cpSync(source, backup, { recursive: true });
    }
    return {
      relative_path: relativePath,
      backup_path: relative(projectDir, backup),
      existed
    };
  });
}

function restoreTransaction(projectDir, record) {
  const root = join(projectDir, ".apex-v2");
  const rootBackup = resolveContainedPath(projectDir, record.backup_path);
  if (!existsSync(rootBackup)) {
    throw new Error(`transaction backup 缺失：${record.backup_path}`);
  }
  rmSync(root, { recursive: true, force: true });
  cpSync(rootBackup, root, { recursive: true });
  for (const snapshot of record.extra_snapshots || []) {
    assertContainedRelativePath(projectDir, snapshot.relative_path);
    const target = resolve(projectDir, snapshot.relative_path);
    const backup = resolveContainedPath(projectDir, snapshot.backup_path);
    rmSync(target, { recursive: true, force: true });
    if (!snapshot.existed) continue;
    if (!existsSync(backup)) {
      throw new Error(`transaction extra backup 缺失：${snapshot.backup_path}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    cpSync(backup, target, { recursive: true });
  }
}

function assertContainedRelativePath(projectDir, path) {
  assertSafeRelativePath(path);
  const projectRoot = resolve(projectDir);
  const target = resolve(projectRoot, path);
  if (target !== projectRoot && !target.startsWith(`${projectRoot}/`)) {
    throw new Error(`transaction path 越出项目根：${path}`);
  }
}

function resolveContainedPath(projectDir, path) {
  assertContainedRelativePath(projectDir, path);
  return resolve(projectDir, path);
}

function cleanupBackup(projectDir, backupDir) {
  rmSync(backupDir, { recursive: true, force: true });
  const backupRoot = join(projectDir, BACKUP_ROOT_NAME);
  if (existsSync(backupRoot) && readdirSync(backupRoot).length === 0) {
    rmSync(backupRoot, { recursive: true, force: true });
  }
}

function cleanupOrphanBackups(projectDir, liveBackups) {
  const backupRoot = join(projectDir, BACKUP_ROOT_NAME);
  if (!existsSync(backupRoot)) return;
  for (const entry of readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(backupRoot, entry.name);
    if (!liveBackups.has(path)) rmSync(path, { recursive: true, force: true });
  }
  if (readdirSync(backupRoot).length === 0) {
    rmSync(backupRoot, { recursive: true, force: true });
  }
}
