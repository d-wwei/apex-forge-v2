import { required } from "../lib/common.mjs";
import { projectRoot, requireStore } from "../core/store.mjs";
import { addIntakeItem, listIntakeItems, promoteRoadmapNode, triageIntakeItem } from "../core/intake-roadmap.mjs";
import { normalizeSpecSource } from "../core/spec-adapter.mjs";

export function handleIntakeCommand(subcommand, args) {
  if (subcommand === "add") {
    addIntake(args);
    return;
  }
  if (subcommand === "list") {
    listIntake(args);
    return;
  }
  if (subcommand === "triage") {
    triageIntake(args);
    return;
  }
  if (subcommand === "import-spec") {
    importSpec(args);
    return;
  }
  throw new Error(`未知 intake 子命令：${subcommand || "(空)"}`);
}

function importSpec(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const normalized = normalizeSpecSource(projectDir, {
    format: args.format || "auto",
    path: required(args, "path")
  });
  const item = addIntakeItem(root, {
    source: normalized.source,
    type: args.type || normalized.type,
    title: args.title || normalized.title,
    description: normalized.description,
    priority: args.priority || normalized.priority,
    risk: args.risk || normalized.risk,
    area: normalized.affected_area,
    "method-pack": args["method-pack"],
    "acceptance-json": JSON.stringify(normalized.acceptance_commands),
    evidence: normalized.evidence_refs.join(","),
    source_spec: normalized.source_spec
  });
  console.log(JSON.stringify(item, null, 2));
}

function addIntake(args) {
  required(args, "title");
  const root = requireStore(projectRoot(args));
  const item = addIntakeItem(root, args);
  console.log(JSON.stringify(item, null, 2));
}

function listIntake(args) {
  const root = requireStore(projectRoot(args));
  const statusFilter = args.status ? String(args.status) : null;
  console.log(JSON.stringify(listIntakeItems(root, statusFilter), null, 2));
}

function triageIntake(args) {
  const root = requireStore(projectRoot(args));
  const id = required(args, "id");
  const item = triageIntakeItem(root, id, args);
  console.log(JSON.stringify(item, null, 2));
}

export function handleRoadmapCommand(subcommand, args) {
  if (subcommand === "promote") {
    promoteRoadmap(args);
    return;
  }
  throw new Error(`未知 roadmap 子命令：${subcommand || "(空)"}`);
}

function promoteRoadmap(args) {
  const root = requireStore(projectRoot(args));
  const intakeId = required(args, "intake-id");
  const node = promoteRoadmapNode(root, intakeId, args);
  console.log(JSON.stringify(node, null, 2));
}
