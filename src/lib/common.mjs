import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

let jsonWriteValidator = null;

export function registerJsonWriteValidator(validator) {
  jsonWriteValidator = validator;
}

export function now() {
  return new Date().toISOString();
}

export function shortId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  if (jsonWriteValidator) jsonWriteValidator(path, value);
  atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeTextIfMissing(path, content) {
  if (!existsSync(path)) {
    atomicWriteFile(path, content);
  }
}

export function atomicWriteFile(path, content) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o644;
  const tempPath = join(
    directory,
    `.${basename(path)}.tmp-${process.pid}-${randomUUID()}`
  );
  let descriptor = null;
  try {
    descriptor = openSync(tempPath, "wx", mode);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (process.env.APEX_V2_ATOMIC_WRITE_FAILPOINT === "before_rename") {
      throw new Error("atomic write failpoint: before_rename");
    }
    renameSync(tempPath, path);
    fsyncDirectory(directory);
  } finally {
    if (descriptor != null) closeSync(descriptor);
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }
}

export function appendDurableFile(path, content) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const existed = existsSync(path);
  let descriptor = null;
  try {
    descriptor = openSync(path, "a", 0o644);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (!existed) fsyncDirectory(directory);
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}

function fsyncDirectory(directory) {
  let descriptor = null;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(error.code)) throw error;
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}

export function bullet(items, empty = "- 暂无。") {
  if (!items || items.length === 0) return empty;
  return items.map((item) => `- ${item}`).join("\n");
}

export function assertSafeRelativePath(path) {
  if (path.startsWith("/") || path.includes("..") || path.includes("\0")) {
    throw new Error(`不安全的 patch path：${path}`);
  }
}

export function dirnameForPath(path) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/") || ".";
}

export function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}

export function tail(value, max = 4000) {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
}

export function splitList(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

export function required(args, name) {
  const value = args[name];
  if (value == null || value === true || String(value).trim() === "") {
    throw new Error(`缺少参数：--${name}`);
  }
  return String(value);
}

export function normalizeEnum(value, allowed, name) {
  const normalized = String(value);
  if (!allowed.includes(normalized)) {
    throw new Error(`参数 --${name} 只能是：${allowed.join(", ")}`);
  }
  return normalized;
}
