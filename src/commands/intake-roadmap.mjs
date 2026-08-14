import { required } from "../lib/common.mjs";
import { projectRoot, requireStore } from "../core/store.mjs";
import { addIntakeItem, listIntakeItems, promoteRoadmapNode, triageIntakeItem } from "../core/intake-roadmap.mjs";

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
  throw new Error(`未知 intake 子命令：${subcommand || "(空)"}`);
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

