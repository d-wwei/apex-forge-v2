import { resolve } from "node:path";
import {
  projectRoot,
  requireStore
} from "../core/store.mjs";
import { loadRun } from "../core/run-state.mjs";
import {
  getDecisionNote,
  listDecisionNotes,
  proposeDecisionNote
} from "../core/decision-notes.mjs";
import {
  readNegativeControlRecord,
  recordNegativeControlGreen,
  recordNegativeControlRed,
  restoreNegativeControl
} from "../core/negative-control.mjs";
import {
  required,
  splitList
} from "../lib/common.mjs";
import { withProjectTransaction } from "../core/project-transaction.mjs";

export function handleDecisionCommand(subcommand, args) {
  const root = requireStore(projectRoot(args));
  if (subcommand === "list") {
    console.log(JSON.stringify(listDecisionNotes(root, {
      runId: args["run-id"] ? String(args["run-id"]) : null,
      status: args.status ? String(args.status) : null
    }), null, 2));
    return;
  }
  if (subcommand === "show") {
    console.log(JSON.stringify(
      getDecisionNote(root, required(args, "id")),
      null,
      2
    ));
    return;
  }
  if (subcommand === "propose") {
    const run = loadRun(root, required(args, "run-id"));
    const options = splitList(args.options).map((summary, index) => ({
      option_id: `option-${index + 1}`,
      summary,
      tradeoffs: []
    }));
    if (options.length < 2) {
      throw new Error("Decision propose 必须提供至少两个 --options");
    }
    const proposedOption = String(args["proposed-option"] || options[0].option_id);
    if (!options.some((option) => option.option_id === proposedOption)) {
      throw new Error(`Decision proposed option 不存在：${proposedOption}`);
    }
    const note = withProjectTransaction(resolve(root, ".."), {
      kind: "decision-propose",
      idempotencyKey: [
        "decision-propose",
        run.run_id,
        required(args, "title"),
        proposedOption
      ].join(":")
    }, () => proposeDecisionNote(root, run, {
      trigger: "manual",
      title: required(args, "title"),
      scope: String(args.scope || "project"),
      rationale: required(args, "rationale"),
      options,
      proposedOption,
      refs: splitList(args.refs)
    })).result;
    console.log(JSON.stringify(note, null, 2));
    return;
  }
  throw new Error(`未知 decision 子命令：${subcommand || "(空)"}`);
}

export function handleNegativeControlCommand(subcommand, args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  if (subcommand === "show") {
    const record = readNegativeControlRecord(root, run.run_id);
    if (!record) throw new Error(`run 未要求 Negative Control：${run.run_id}`);
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  const transition = withProjectTransaction(resolve(root, ".."), {
    kind: `negative-control-${subcommand}`,
    idempotencyKey: [
      "negative-control",
      subcommand,
      run.run_id,
      String(args.command || ""),
      String(args.evidence || "")
    ].join(":")
  }, () => {
    if (subcommand === "record-red") {
      return recordNegativeControlRed(root, run, {
        command: required(args, "command"),
        faultModel: required(args, "fault-model"),
        expectedFailureSignature: required(args, "expected-signature"),
        observedFailureSignature: required(args, "observed-signature"),
        evidenceRefs: splitList(args.evidence)
      });
    }
    if (subcommand === "record-green") {
      return recordNegativeControlGreen(root, run, {
        command: required(args, "command"),
        evidenceRefs: splitList(args.evidence)
      });
    }
    if (subcommand === "restore") {
      return restoreNegativeControl(root, run, {
        evidenceRefs: splitList(args.evidence)
      });
    }
    throw new Error(
      `未知 negative-control 子命令：${subcommand || "(空)"}`
    );
  }).result;
  console.log(JSON.stringify(transition, null, 2));
}
