import { appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { appendEvent, updateProject } from "./store.mjs";
import { ensureDir, now, readJson, shortId, writeJson } from "../lib/common.mjs";

const SEVERITY = {
  info: 0,
  medium: 1,
  high: 2,
  critical: 3
};

export function defaultNotificationPolicy(timestamp = now()) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    enabled: true,
    minimum_severity: "high",
    dedupe_window_minutes: 60,
    notify_on: [
      "adapter.smoke.failed",
      "adapter.smoke.refresh_failed"
    ],
    delivery: {
      mode: "file",
      sink_path: "notifications/delivered.jsonl",
      max_attempts: 3,
      retry_backoff_seconds: 60
    }
  };
}

export function listNotifications(root, status = null) {
  const notifications = readJson(join(root, "notifications", "outbox.json"), []);
  return status ? notifications.filter((item) => item.status === status) : notifications;
}

export function enqueueNotification(root, input) {
  const policy = readJson(join(root, "policies", "notifications.json"), defaultNotificationPolicy());
  if (!policy.enabled) return { queued: false, reason: "policy-disabled", notification: null };
  if (!policy.notify_on.includes(input.event_type)) return { queued: false, reason: "event-disabled", notification: null };
  if (SEVERITY[input.severity] < SEVERITY[policy.minimum_severity]) {
    return { queued: false, reason: "below-minimum-severity", notification: null };
  }

  const path = join(root, "notifications", "outbox.json");
  const notifications = readJson(path, []);
  const dedupeAfter = Date.now() - policy.dedupe_window_minutes * 60000;
  const existing = notifications.find((item) =>
    item.dedupe_key === input.dedupe_key
    && Date.parse(item.created_at) >= dedupeAfter
  );
  if (existing) return { queued: false, reason: "deduplicated", notification: existing };

  const timestamp = now();
  const notification = {
    schema_version: "v0",
    id: shortId("notification"),
    event_type: input.event_type,
    severity: input.severity,
    status: "queued",
    dedupe_key: input.dedupe_key,
    title: input.title,
    body: input.body,
    evidence_refs: input.evidence_refs || [],
    payload: input.payload || {},
    attempts: 0,
    next_attempt_at: timestamp,
    last_error: "",
    delivered_at: null,
    delivery_receipt: "",
    created_at: timestamp,
    updated_at: timestamp,
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgement_reason: ""
  };
  notifications.push(notification);
  writeJson(path, notifications);
  const event = appendEvent(root, "notification.queued", "apex-v2", {
    notification_id: notification.id,
    event_type: notification.event_type,
    severity: notification.severity,
    dedupe_key: notification.dedupe_key
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return { queued: true, reason: "queued", notification };
}

export function acknowledgeNotification(root, id, reason) {
  const path = join(root, "notifications", "outbox.json");
  const notifications = readJson(path, []);
  const notification = notifications.find((item) => item.id === id);
  if (!notification) throw new Error(`找不到 notification：${id}`);
  if (notification.status === "acknowledged") throw new Error(`notification 已处理：${id}=${notification.status}`);
  const timestamp = now();
  notification.status = "acknowledged";
  notification.updated_at = timestamp;
  notification.acknowledged_at = timestamp;
  notification.acknowledged_by = "human";
  notification.acknowledgement_reason = reason || "";
  writeJson(path, notifications);
  const event = appendEvent(root, "notification.acknowledged", "human", {
    notification_id: notification.id
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return notification;
}

export function dispatchNotifications(root, options = {}) {
  const policy = readJson(join(root, "policies", "notifications.json"), defaultNotificationPolicy());
  const path = join(root, "notifications", "outbox.json");
  const notifications = readJson(path, []);
  const delivered = [];
  const failed = [];
  const deadLetter = [];
  const currentTime = options.now || now();
  const deliverer = options.deliverer
    || ((notification) => deliverToFile(root, policy, notification, currentTime));

  for (const notification of notifications) {
    if (!["queued", "failed"].includes(notification.status)) continue;
    if (!options.force && notification.next_attempt_at && notification.next_attempt_at > currentTime) continue;
    notification.status = "delivering";
    notification.attempts += 1;
    notification.updated_at = currentTime;
    writeJson(path, notifications);
    try {
      const receipt = deliverer(notification);
      notification.status = "delivered";
      notification.delivered_at = currentTime;
      notification.delivery_receipt = typeof receipt === "string" ? receipt : JSON.stringify(receipt);
      notification.last_error = "";
      notification.next_attempt_at = null;
      delivered.push(notification.id);
      appendNotificationEvent(root, "notification.delivered", notification);
    } catch (error) {
      notification.last_error = error.message;
      notification.status = notification.attempts >= policy.delivery.max_attempts
        ? "dead_letter"
        : "failed";
      notification.next_attempt_at = notification.status === "failed"
        ? new Date(Date.parse(currentTime) + retryDelayMs(policy, notification.attempts)).toISOString()
        : null;
      if (notification.status === "dead_letter") {
        deadLetter.push(notification.id);
        appendNotificationEvent(root, "notification.dead_letter", notification);
      } else {
        failed.push(notification.id);
        appendNotificationEvent(root, "notification.delivery_failed", notification);
      }
    }
    notification.updated_at = currentTime;
    writeJson(path, notifications);
  }
  return { delivered, failed, dead_letter: deadLetter };
}

export function migrateNotificationState(root, timestamp = now()) {
  const policyPath = join(root, "policies", "notifications.json");
  const policy = readJson(policyPath, defaultNotificationPolicy(timestamp));
  if (policy.delivery?.mode === "outbox" || !policy.delivery?.max_attempts) {
    policy.delivery = {
      mode: "file",
      sink_path: "notifications/delivered.jsonl",
      max_attempts: 3,
      retry_backoff_seconds: 60
    };
    policy.updated_at = timestamp;
    writeJson(policyPath, policy);
  }
  const outboxPath = join(root, "notifications", "outbox.json");
  const notifications = readJson(outboxPath, []);
  let changed = false;
  for (const notification of notifications) {
    if (notification.attempts != null) continue;
    notification.attempts = 0;
    notification.next_attempt_at = notification.created_at;
    notification.last_error = "";
    notification.delivered_at = null;
    notification.delivery_receipt = "";
    changed = true;
  }
  if (changed) writeJson(outboxPath, notifications);
  return { policy, notifications, changed };
}

function deliverToFile(root, policy, notification, deliveredAt) {
  if (policy.delivery.mode !== "file") {
    throw new Error(`unsupported notification delivery mode：${policy.delivery.mode}`);
  }
  const target = resolve(root, policy.delivery.sink_path);
  if (!target.startsWith(`${resolve(root)}/`)) {
    throw new Error(`notification sink 超出项目状态目录：${policy.delivery.sink_path}`);
  }
  ensureDir(dirname(target));
  appendFileSync(target, `${JSON.stringify({
    notification_id: notification.id,
    event_type: notification.event_type,
    severity: notification.severity,
    delivered_at: deliveredAt,
    payload: notification.payload,
    evidence_refs: notification.evidence_refs
  })}\n`);
  return `file:${policy.delivery.sink_path}#${notification.id}`;
}

function retryDelayMs(policy, attempts) {
  return policy.delivery.retry_backoff_seconds * 1000 * (2 ** Math.max(0, attempts - 1));
}

function appendNotificationEvent(root, type, notification) {
  const event = appendEvent(root, type, "apex-v2", {
    notification_id: notification.id,
    attempts: notification.attempts,
    status: notification.status,
    last_error: notification.last_error
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
}
