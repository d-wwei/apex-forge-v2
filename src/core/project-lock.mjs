import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const HELD_LOCKS = new Map();

export function withProjectLock(projectDir, action, options = {}) {
  const key = resolve(projectDir);
  const held = HELD_LOCKS.get(key);
  if (held) {
    held.depth += 1;
    try {
      return action();
    } finally {
      held.depth -= 1;
    }
  }
  const release = acquireProjectLock(key, options);
  HELD_LOCKS.set(key, { depth: 1 });
  try {
    return action();
  } finally {
    HELD_LOCKS.delete(key);
    release();
  }
}

export function acquireProjectLock(projectDir, options = {}) {
  const lockPath = join(projectDir, ".apex-v2.lock");
  const ownerPath = join(lockPath, "owner.json");
  const token = randomUUID();
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 30000;
  const retryMs = options.retryMs ?? 20;

  while (true) {
    try {
      mkdirSync(lockPath);
      writeFileSync(ownerPath, `${JSON.stringify({
        token,
        pid: process.pid,
        created_at: new Date().toISOString()
      })}\n`);
      return () => releaseOwnedLock(lockPath, ownerPath, token);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      clearDeadOwner(lockPath, ownerPath);
      if (!existsSync(lockPath)) continue;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`project lock timeout：${lockPath}`);
      }
      Atomics.wait(SLEEP_BUFFER, 0, 0, retryMs);
    }
  }
}

function clearDeadOwner(lockPath, ownerPath) {
  let owner = null;
  try {
    owner = JSON.parse(readFileSync(ownerPath, "utf8"));
  } catch {
    return;
  }
  if (!processAlive(owner.pid)) {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function releaseOwnedLock(lockPath, ownerPath, token) {
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
