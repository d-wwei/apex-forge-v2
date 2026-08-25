import { join, resolve } from "node:path";
import {
  now,
  readJson,
  shortId,
  writeJson
} from "../lib/common.mjs";
import { listArtifactsForRun } from "./artifacts.mjs";
import {
  bindLifecycleEvent,
  initializeLifecycleRecord,
  transitionLifecycleRecord
} from "./lifecycle.mjs";
import { appendEvent, SCHEMA_VERSION, updateProject } from "./store.mjs";
import { withProjectLock } from "./project-lock.mjs";

const TRANSITIONS = {
  required: ["red_verified", "waived"],
  red_verified: ["green_verified", "waived"],
  green_verified: ["restored", "waived"],
  restored: [],
  waived: []
};

export function ensureNegativeControlRecord(root, run, plan) {
  const policy = negativeControlPolicy(root);
  if (
    policy.mode === "off"
    || !policy.intake_types.includes(plan.source_intake_type)
  ) {
    return null;
  }
  return withProjectLock(resolve(root, ".."), () => {
    const existing = readNegativeControlRecord(root, run.run_id);
    if (existing) return existing;
    const timestamp = now();
    const record = initializeLifecycleRecord({
      schema_version: SCHEMA_VERSION,
      record_id: shortId("negative-control"),
      run_id: run.run_id,
      source_intake_id: plan.source_intake_id,
      mode: policy.mode,
      status: "required",
      fault_model: "",
      red_command: null,
      expected_failure_signature: null,
      observed_failure_signature: null,
      red_evidence_refs: [],
      green_command: null,
      green_evidence_refs: [],
      restoration_evidence_refs: [],
      waiver: null
    }, timestamp);
    const event = appendEvent(root, "negative-control.required", "apex-v2", {
      run_id: run.run_id,
      record_id: record.record_id,
      source_intake_id: plan.source_intake_id,
      mode: record.mode
    });
    bindLifecycleEvent(record, event);
    writeNegativeControlRecord(root, record);
    updateProject(root, {
      last_event_id: event.event_id,
      updated_at: event.timestamp
    });
    return record;
  });
}

export function readNegativeControlRecord(root, runId) {
  return readJson(
    join(root, "runs", runId, "negative-control.json"),
    null
  );
}

export function recordNegativeControlRed(root, run, input) {
  const record = requireNegativeControlRecord(root, run.run_id);
  if (!input.faultModel) {
    throw new Error("Negative Control RED 必须声明 fault model");
  }
  if (!input.expectedFailureSignature) {
    throw new Error("Negative Control RED 必须声明 expected failure signature");
  }
  if (!input.observedFailureSignature.includes(input.expectedFailureSignature)) {
    throw new Error(
      "Negative Control failure signature 不匹配："
      + `${input.observedFailureSignature} !~ ${input.expectedFailureSignature}`
    );
  }
  const evidenceRefs = assertRunEvidence(
    root,
    run.run_id,
    input.evidenceRefs
  );
  transitionLifecycleRecord(record, "red_verified", TRANSITIONS);
  record.fault_model = input.faultModel;
  record.red_command = input.command;
  record.expected_failure_signature = input.expectedFailureSignature;
  record.observed_failure_signature = input.observedFailureSignature;
  record.red_evidence_refs = evidenceRefs;
  return persistNegativeControlTransition(
    root,
    record,
    "negative-control.red-verified",
    {
      command: input.command,
      expected_failure_signature: input.expectedFailureSignature,
      observed_failure_signature: input.observedFailureSignature,
      evidence_refs: evidenceRefs
    }
  );
}

export function recordNegativeControlGreen(root, run, input) {
  const record = requireNegativeControlRecord(root, run.run_id);
  if (input.command !== record.red_command) {
    throw new Error(
      `Negative Control GREEN 必须复用 RED command：`
      + `${input.command} != ${record.red_command}`
    );
  }
  const evidenceRefs = assertRunEvidence(
    root,
    run.run_id,
    input.evidenceRefs
  );
  transitionLifecycleRecord(record, "green_verified", TRANSITIONS);
  record.green_command = input.command;
  record.green_evidence_refs = evidenceRefs;
  return persistNegativeControlTransition(
    root,
    record,
    "negative-control.green-verified",
    { command: input.command, evidence_refs: evidenceRefs }
  );
}

export function restoreNegativeControl(root, run, input) {
  const record = requireNegativeControlRecord(root, run.run_id);
  const evidenceRefs = assertRunEvidence(
    root,
    run.run_id,
    input.evidenceRefs
  );
  transitionLifecycleRecord(record, "restored", TRANSITIONS);
  record.restoration_evidence_refs = evidenceRefs;
  return persistNegativeControlTransition(
    root,
    record,
    "negative-control.restored",
    { evidence_refs: evidenceRefs }
  );
}

export function inspectNegativeControlGate(root, runId) {
  const policy = negativeControlPolicy(root);
  const record = readNegativeControlRecord(root, runId);
  if (policy.mode === "off") {
    return {
      required: false,
      mode: "off",
      status: "not_required",
      ready: true,
      fingerprint: "off",
      message: ""
    };
  }
  if (!record) {
    return {
      required: true,
      mode: policy.mode,
      status: "missing",
      ready: false,
      fingerprint: `missing:${policy.mode}`,
      message: "Negative Control record 缺失"
    };
  }
  const ready = record.status === "restored"
    || (
      record.status === "waived"
      && record.waiver
      && Date.parse(record.waiver.expires_at) > Date.now()
    );
  return {
    required: true,
    mode: policy.mode,
    status: record.status,
    ready,
    revision: record.revision,
    fingerprint: [
      record.record_id,
      record.revision,
      policy.mode,
      record.status
    ].join(":"),
    message: ready
      ? ""
      : `Negative Control 未闭合：status=${record.status}`
  };
}

export function negativeControlPolicy(root) {
  const gates = readJson(join(root, "policies", "gates.json"), {});
  return {
    mode: gates.dsh_lifecycle?.negative_control?.mode || "shadow",
    intake_types: gates.dsh_lifecycle?.negative_control?.intake_types
      || ["bug", "test_failure"]
  };
}

function requireNegativeControlRecord(root, runId) {
  const record = readNegativeControlRecord(root, runId);
  if (!record) {
    throw new Error(`run 未要求 Negative Control：${runId}`);
  }
  return record;
}

function assertRunEvidence(root, runId, evidenceRefs = []) {
  const refs = Array.from(new Set(evidenceRefs.filter(Boolean)));
  if (refs.length === 0) {
    throw new Error("Negative Control transition 必须提供 evidence");
  }
  const artifacts = new Set(
    listArtifactsForRun(root, runId).map((artifact) => artifact.artifact_id)
  );
  for (const ref of refs) {
    if (!artifacts.has(ref)) {
      throw new Error(`Negative Control evidence 不属于当前 run：${ref}`);
    }
  }
  return refs;
}

function persistNegativeControlTransition(root, record, eventType, payload) {
  const event = appendEvent(root, eventType, "apex-v2", {
    run_id: record.run_id,
    record_id: record.record_id,
    revision: record.revision,
    status: record.status,
    ...payload
  });
  bindLifecycleEvent(record, event);
  writeNegativeControlRecord(root, record);
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
  return record;
}

function writeNegativeControlRecord(root, record) {
  writeJson(
    join(root, "runs", record.run_id, "negative-control.json"),
    record
  );
}
