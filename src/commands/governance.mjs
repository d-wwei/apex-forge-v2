import { join, resolve } from "node:path";
import { normalizeEnum, readJson, required, splitList } from "../lib/common.mjs";
import { appendEvent, projectRoot, requireStore, updateProject } from "../core/store.mjs";
import { migrateLegacyContracts, scanProjectContracts } from "../core/contracts.mjs";
import { decideApproval } from "../core/governance.mjs";
import { addRisk, listRisks, updateRisk } from "../core/risks.mjs";
import { acknowledgeNotification, dispatchNotifications, listNotifications } from "../core/notifications.mjs";
import { withProjectTransaction } from "../core/project-transaction.mjs";

export function handleContractsCommand(subcommand, args) {
  const projectDir = projectRoot(args);
  requireStore(projectDir);
  if (subcommand === "validate") {
    const report = scanProjectContracts(projectDir);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "PASS") process.exitCode = 1;
    return;
  }
  if (subcommand === "migrate") {
    const report = migrateLegacyContracts(projectDir, Boolean(args.apply));
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  throw new Error(`未知 contracts 子命令：${subcommand || "(空)"}`);
}

export function handleApprovalCommand(subcommand, args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  if (subcommand === "list") {
    console.log(JSON.stringify(readJson(join(root, "approvals", "items.json"), []), null, 2));
    return;
  }
  if (subcommand === "decide") {
    const decision = normalizeEnum(required(args, "decision"), ["approved", "rejected"], "decision");
    const approvalId = required(args, "id");
    const approvalItem = readJson(join(root, "approvals", "items.json"), [])
      .find((item) => item.id === approvalId);
    if (!approvalItem) throw new Error(`找不到 approval：${approvalId}`);
    const approval = withProjectTransaction(resolve(projectDir), {
      kind: "approval-decide",
      idempotencyKey: `approval-decide:${approvalId}:${decision}:${approvalItem.revision || 1}`
    }, () => {
      const decided = decideApproval(root, approvalId, decision, String(args.reason || ""), {
        actor: String(args.actor || "human"),
        capabilities: args.capabilities ? splitList(args.capabilities) : [approvalItem.capability]
      });
      const event = appendEvent(root, "approval.decided", "human", {
        approval_id: decided.id,
        decision,
        capability: decided.capability,
        candidate_digest: decided.candidate_digest,
        decided_by: decided.decided_by
      });
      updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
      return decided;
    }).result;
    console.log(JSON.stringify(approval, null, 2));
    return;
  }
  throw new Error(`未知 approval 子命令：${subcommand || "(空)"}`);
}

export function handleRiskCommand(subcommand, args) {
  const root = requireStore(projectRoot(args));
  if (subcommand === "list") {
    console.log(JSON.stringify(listRisks(root, args.status ? String(args.status) : null), null, 2));
    return;
  }
  if (subcommand === "add") {
    const risk = addRisk(root, {
      source: "manual",
      title: required(args, "title"),
      description: String(args.description || ""),
      severity: normalizeEnum(args.severity || "medium", ["low", "medium", "high", "critical"], "severity"),
      owner: String(args.owner || "human"),
      evidence_refs: splitList(args.evidence)
    });
    console.log(JSON.stringify(risk, null, 2));
    return;
  }
  if (subcommand === "update") {
    const risk = updateRisk(
      root,
      required(args, "id"),
      normalizeEnum(required(args, "status"), ["open", "mitigated", "accepted", "closed"], "status"),
      String(args.reason || "")
    );
    console.log(JSON.stringify(risk, null, 2));
    return;
  }
  throw new Error(`未知 risk 子命令：${subcommand || "(空)"}`);
}

export function handleNotificationCommand(subcommand, args) {
  const root = requireStore(projectRoot(args));
  if (subcommand === "list") {
    console.log(JSON.stringify(listNotifications(root, args.status ? String(args.status) : null), null, 2));
    return;
  }
  if (subcommand === "acknowledge") {
    const notification = acknowledgeNotification(root, required(args, "id"), String(args.reason || ""));
    console.log(JSON.stringify(notification, null, 2));
    return;
  }
  if (subcommand === "dispatch") {
    console.log(JSON.stringify(dispatchNotifications(root, {
      force: Boolean(args.force)
    }), null, 2));
    return;
  }
  throw new Error(`未知 notification 子命令：${subcommand || "(空)"}`);
}
