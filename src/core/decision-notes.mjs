import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import {
  ensureDir,
  now,
  readJson,
  shortId,
  writeJson
} from "../lib/common.mjs";
import { createArtifact } from "./artifacts.mjs";
import { initializeLifecycleRecord, bindLifecycleEvent } from "./lifecycle.mjs";
import { appendEvent, SCHEMA_VERSION, updateProject } from "./store.mjs";
import { withProjectLock } from "./project-lock.mjs";

export function listDecisionNotes(root, filters = {}) {
  return readJson(join(root, "decisions", "index.json"), [])
    .filter((note) => !filters.runId || note.run_id === filters.runId)
    .filter((note) => !filters.status || note.status === filters.status)
    .sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at))
    );
}

export function getDecisionNote(root, decisionId) {
  const note = listDecisionNotes(root).find((item) =>
    item.decision_id === decisionId
  );
  if (!note) throw new Error(`找不到 Decision Note：${decisionId}`);
  return note;
}

export function ensureDecisionNoteProposal(root, run, plan) {
  const policy = decisionNotePolicy(root);
  if (
    policy.mode === "off"
    || policy.auto_propose !== true
    || !policy.workflows.includes(plan.method_pack?.workflow)
    || !policy.risk_levels.includes(maxPlanRisk(plan))
  ) {
    return null;
  }
  return withProjectLock(resolve(root, ".."), () => {
    const existing = listDecisionNotes(root, { runId: run.run_id })
      .find((note) => note.trigger === "high_risk_plan");
    if (existing) return existing;
    return proposeDecisionNote(root, run, {
      mode: policy.mode,
      trigger: "high_risk_plan",
      sourceIntakeId: plan.source_intake_id,
      title: `Decision：${plan.source_title}`,
      scope: plan.affected_area || "project",
      rationale: plan.strategy,
      options: [
        {
          option_id: "generated-plan",
          summary: "按当前 PlanGraph 和 Method Pack 实施。",
          tradeoffs: ["保留当前 evidence、verification 和 rollback 边界。"]
        },
        {
          option_id: "replan",
          summary: "暂停执行并重新规划。",
          tradeoffs: ["增加一次规划往返，但避免高风险方案直接进入实现。"]
        }
      ],
      proposedOption: "generated-plan",
      refs: [
        `.apex-v2/runs/${run.run_id}/plan-graph.json`,
        `.apex-v2/intake/items.json#${plan.source_intake_id}`
      ]
    });
  });
}

export function proposeDecisionNote(root, run, input) {
  const timestamp = now();
  const artifact = createArtifact(root, run, "plan_graph", {
    type: "decision",
    title: input.title,
    body: renderDecisionBody(input),
    refs: input.refs || [],
    timestamp
  });
  const note = initializeLifecycleRecord({
    schema_version: SCHEMA_VERSION,
    decision_id: shortId("decision"),
    run_id: run.run_id,
    source_intake_id: input.sourceIntakeId || null,
    mode: (input.mode || decisionNotePolicy(root).mode) === "enforce"
      ? "enforce"
      : "shadow",
    trigger: input.trigger || "manual",
    status: "proposed",
    title: input.title,
    scope: input.scope,
    rationale: input.rationale,
    options: input.options,
    proposed_option: input.proposedOption,
    artifact_id: artifact.artifact_id,
    artifact_sha256: createHash("sha256")
      .update(JSON.stringify(artifact))
      .digest("hex"),
    accepted_by: null,
    accepted_at: null,
    approval_id: null,
    supersedes: null,
    superseded_by: null,
    implementation_refs: [],
    candidate_digest: null,
    verification_refs: [],
    archived_at: null
  }, timestamp);
  const event = appendEvent(root, "decision.proposed", "apex-v2", {
    decision_id: note.decision_id,
    run_id: note.run_id,
    artifact_id: note.artifact_id,
    mode: note.mode,
    trigger: note.trigger
  });
  bindLifecycleEvent(note, event);
  const path = join(root, "decisions", "index.json");
  ensureDir(join(root, "decisions"));
  const notes = readJson(path, []);
  notes.push(note);
  writeJson(path, notes);
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
  return note;
}

export function decisionNotePolicy(root) {
  const gates = readJson(join(root, "policies", "gates.json"), {});
  return {
    mode: gates.dsh_lifecycle?.decision_note?.mode || "shadow",
    auto_propose: gates.dsh_lifecycle?.decision_note?.auto_propose !== false,
    risk_levels: gates.dsh_lifecycle?.decision_note?.risk_levels
      || ["high", "critical"],
    workflows: gates.dsh_lifecycle?.decision_note?.workflows
      || ["governed"]
  };
}

function maxPlanRisk(plan) {
  const order = ["low", "medium", "high", "critical"];
  return (plan.nodes || []).reduce((highest, node) =>
    order.indexOf(node.risk) > order.indexOf(highest) ? node.risk : highest,
  "low");
}

function renderDecisionBody(input) {
  return [
    input.rationale,
    "",
    "## Options",
    ...input.options.flatMap((option) => [
      `### ${option.option_id}: ${option.summary}`,
      ...option.tradeoffs.map((item) => `- ${item}`)
    ]),
    "",
    `Proposed option: ${input.proposedOption}`
  ].join("\n");
}
