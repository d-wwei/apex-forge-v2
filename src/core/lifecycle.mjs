import { now } from "../lib/common.mjs";

export function initializeLifecycleRecord(record, timestamp = now()) {
  return {
    ...record,
    revision: 1,
    last_event_id: null,
    created_at: timestamp,
    updated_at: timestamp
  };
}

export function transitionLifecycleRecord(
  record,
  nextStatus,
  transitions,
  timestamp = now()
) {
  const allowed = transitions[record.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(
      `非法 lifecycle transition：${record.status} -> ${nextStatus}`
    );
  }
  record.status = nextStatus;
  record.revision = Number(record.revision || 0) + 1;
  record.updated_at = timestamp;
  return record;
}

export function bindLifecycleEvent(record, event) {
  record.last_event_id = event.event_id;
  record.updated_at = event.timestamp;
  return record;
}
