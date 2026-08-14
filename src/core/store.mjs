import { appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { now, readJson, shortId, writeJson } from "../lib/common.mjs";
import { assertContract } from "./contracts.mjs";
import { withProjectLock } from "./project-lock.mjs";

export const STORE_DIR = ".apex-v2";
export const SCHEMA_VERSION = "v0";

export function projectRoot(args) {
  return resolve(String(args.project || "."));
}

export function storeRoot(projectDir) {
  return join(projectDir, STORE_DIR);
}

export function requireStore(projectDir) {
  const root = storeRoot(projectDir);
  if (!existsSync(join(root, "project.json"))) {
    throw new Error(`项目尚未初始化：${root}`);
  }
  return root;
}

export function appendEvent(root, type, actor, payload) {
  const event = {
    schema_version: SCHEMA_VERSION,
    event_id: shortId("event"),
    type,
    timestamp: now(),
    actor,
    payload
  };
  assertContract("event.schema.json", event, `${root}/events.jsonl`);
  const projectDir = resolve(root, "..");
  withProjectLock(projectDir, () => {
    appendFileSync(join(root, "events.jsonl"), `${JSON.stringify(event)}\n`);
    const projectPath = join(root, "project.json");
    if (existsSync(projectPath)) {
      const project = readJson(projectPath);
      writeJson(projectPath, {
        ...project,
        last_event_id: event.event_id,
        updated_at: event.timestamp
      });
    }
  });
  return event;
}

export function updateProject(root, patch) {
  const projectDir = resolve(root, "..");
  withProjectLock(projectDir, () => {
    const path = join(root, "project.json");
    const project = readJson(path);
    const nextPatch = { ...patch };
    if (
      nextPatch.last_event_id
      && nextPatch.updated_at
      && project.updated_at
      && project.updated_at > nextPatch.updated_at
    ) {
      delete nextPatch.last_event_id;
      delete nextPatch.updated_at;
    }
    writeJson(path, { ...project, ...nextPatch });
  });
}
