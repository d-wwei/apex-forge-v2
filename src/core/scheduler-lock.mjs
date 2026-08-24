import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));

export function acquireSchedulerLock(projectDir, options = {}) {
  const root = resolve(projectDir);
  const lockPath = join(root, ".apex-v2.scheduler-lock");
  const ownerPath = join(lockPath, "owner.json");
  const token = randomUUID();
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 30000;
  const retryMs = options.retryMs ?? 25;

  while (true) {
    try {
      mkdirSync(lockPath);
      writeFileSync(ownerPath, `${JSON.stringify({
        token,
        pid: process.pid,
        created_at: new Date().toISOString()
      })}\n`);
      return () => releaseSchedulerLock(lockPath, ownerPath, token);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      clearDeadScheduler(lockPath, ownerPath);
      if (!existsSync(lockPath)) continue;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`scheduler lock timeout：${lockPath}`);
      }
      Atomics.wait(SLEEP_BUFFER, 0, 0, retryMs);
    }
  }
}

function clearDeadScheduler(lockPath, ownerPath) {
  let owner;
  try {
    owner = JSON.parse(readFileSync(ownerPath, "utf8"));
  } catch {
    try {
      if (Date.now() - statSync(lockPath).mtimeMs < 1000) return;
    } catch {
      return;
    }
    rmSync(lockPath, { recursive: true, force: true });
    return;
  }
  if (processAlive(owner.pid)) return;
  const quarantine = `${lockPath}.stale-${randomUUID()}`;
  try {
    renameSync(lockPath, quarantine);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return;
  }
  rmSync(quarantine, { recursive: true, force: true });
}

function releaseSchedulerLock(lockPath, ownerPath, token) {
  try {
    const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
    if (owner.token !== token) return;
  } catch {
    return;
  }
  rmSync(lockPath, { recursive: true, force: true });
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
