import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { appendDurableFile, now, readJson, shortId, writeJson } from "../lib/common.mjs";
import { recoverOrphanActionWorkspaces } from "./action-workspace.mjs";
import { assertContract } from "./contracts.mjs";
import { withProjectLock } from "./project-lock.mjs";
import { recoverProjectTransactions } from "./project-transaction.mjs";
import { SCHEMA_VERSION } from "./schema-version.mjs";

export const STORE_DIR = ".apex-v2";
export { SCHEMA_VERSION };

export function projectRoot(args) {
  return resolve(String(args.project || "."));
}

export function storeRoot(projectDir) {
  return join(projectDir, STORE_DIR);
}

export function requireStore(projectDir) {
  const root = storeRoot(projectDir);
  withProjectLock(projectDir, () => {
    if (existsSync(join(root, "transactions"))) recoverProjectTransactions(projectDir);
    if (!existsSync(join(root, "project.json"))) {
      throw new Error(`项目尚未初始化：${root}`);
    }
    const recovered = recoverOrphanActionWorkspaces(root);
    for (const workspace of recovered) {
      appendEvent(root, "worker.host.workspace_recovered", "apex-v2", workspace);
    }
  });
  return root;
}

export function appendEvent(root, type, actor, payload) {
  const projectDir = resolve(root, "..");
  return withProjectLock(projectDir, () => {
    const projectPath = join(root, "project.json");
    const project = existsSync(projectPath) ? readJson(projectPath) : null;
    const event = {
      schema_version: SCHEMA_VERSION,
      event_id: shortId("event"),
      type,
      timestamp: nextEventTimestamp(project?.updated_at),
      actor,
      payload
    };
    assertContract("event.schema.json", event, `${root}/events.jsonl`);
    appendDurableFile(join(root, "events.jsonl"), `${JSON.stringify(event)}\n`);
    if (project) {
      writeJson(projectPath, {
        ...project,
        last_event_id: event.event_id,
        updated_at: event.timestamp,
        revision: Number(project.revision || 0) + 1
      });
    }
    return event;
  });
}

export function updateProject(root, patch, options = {}) {
  const projectDir = resolve(root, "..");
  withProjectLock(projectDir, () => {
    const path = join(root, "project.json");
    const project = readJson(path);
    const revision = Number(project.revision || 0);
    if (options.expectedRevision != null && Number(options.expectedRevision) !== revision) {
      throw new Error(`ProjectState revision 冲突：expected=${options.expectedRevision} actual=${revision}`);
    }
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
    writeJson(path, {
      ...project,
      ...nextPatch,
      revision: revision + 1
    });
  });
}

function nextEventTimestamp(previousTimestamp) {
  const current = now();
  const previousMs = Date.parse(previousTimestamp || "");
  const currentMs = Date.parse(current);
  if (!Number.isFinite(previousMs) || currentMs > previousMs) return current;
  return new Date(previousMs + 1).toISOString();
}
