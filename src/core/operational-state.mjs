import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "../lib/common.mjs";
import { stableHash } from "./candidate.mjs";
import {
  readWorkerPatchBundles,
  workerStatusForMergeItems
} from "./worker.mjs";

export function inspectOperationalIntegrity(root) {
  const state = buildOperationalState(root);
  const issues = [];
  const warnings = [];
  const candidateDigests = new Set();

  for (const run of state.runs) {
    for (const candidate of run.candidates) {
      const { candidate_digest: declared, ...content } = candidate;
      const actual = stableHash(content);
      if (declared !== actual) {
        issues.push(issue(
          "candidate-digest-mismatch",
          `.apex-v2/runs/${run.run_id}/candidates/candidate-${declared}.json`,
          `${declared} != ${actual}`
        ));
      } else {
        candidateDigests.add(declared);
      }
    }

    const verification = run.verification;
    const review = run.review;
    const integration = run.integration;
    const reports = [verification, review, integration].filter(Boolean);
    const legacyUnbound = run.run_status === "done"
      && reports.length > 0
      && reports.every((report) => !report.candidate_digest);
    if (legacyUnbound) {
      warnings.push({
        kind: "legacy-unbound-completed-run",
        path: `.apex-v2/runs/${run.run_id}`,
        detail: "历史完成 run 的 report 没有 candidate_digest，保持只读不可重开 merge"
      });
    } else {
      if (review?.status === "PASS") {
        if (!verification || verification.status !== "PASS") {
          issues.push(issue(
            "review-without-verification",
            `.apex-v2/runs/${run.run_id}/review-report.json`,
            "PASS review 缺少 PASS verification"
          ));
        } else if (!review.candidate_digest || review.candidate_digest !== verification.candidate_digest) {
          issues.push(issue(
            "review-candidate-mismatch",
            `.apex-v2/runs/${run.run_id}/review-report.json`,
            `${review.candidate_digest || "missing"} != ${verification.candidate_digest || "missing"}`
          ));
        }
      }
      if (integration && ["MERGED", "NOOP"].includes(integration.status)) {
        if (!review || review.status !== "PASS") {
          issues.push(issue(
            "integration-without-review",
            `.apex-v2/runs/${run.run_id}/integration-report.json`,
            `${integration.status} integration 缺少 PASS review`
          ));
        } else if (!integration.candidate_digest || integration.candidate_digest !== review.candidate_digest) {
          issues.push(issue(
            "integration-candidate-mismatch",
            `.apex-v2/runs/${run.run_id}/integration-report.json`,
            `${integration.candidate_digest || "missing"} != ${review.candidate_digest || "missing"}`
          ));
        }
      }
    }

    const patchById = new Map(run.patches.map((patch) => [patch.patch_id, patch]));
    const workerById = new Map(run.workers.map((worker) => [worker.worker_id, worker]));
    for (const worker of run.workers) {
      if (!worker.patch_alias_drift) continue;
      issues.push(issue(
        "patch-alias-drift",
        `.apex-v2/runs/${run.run_id}/workers/${worker.worker_id}/patch-bundle.json`,
        worker.patch_alias_drift
      ));
    }
    for (const item of run.merge_queue?.items || []) {
      const patch = patchById.get(item.patch_id);
      if (!patch) {
        issues.push(issue(
          "merge-item-missing-patch",
          `.apex-v2/runs/${run.run_id}/merge-queue.json`,
          item.patch_id
        ));
        continue;
      }
      if (stableHash([...patch.changed_files].sort()) !== stableHash([...item.changed_files].sort())) {
        issues.push(issue(
          "merge-item-files-mismatch",
          `.apex-v2/runs/${run.run_id}/merge-queue.json`,
          item.patch_id
        ));
      }
      const worker = workerById.get(item.worker_id);
      if (!worker) {
        issues.push(issue(
          "merge-item-missing-worker",
          `.apex-v2/runs/${run.run_id}/merge-queue.json`,
          item.worker_id
        ));
        continue;
      }
    }
    const itemsByWorker = new Map();
    for (const item of run.merge_queue?.items || []) {
      if (!itemsByWorker.has(item.worker_id)) itemsByWorker.set(item.worker_id, []);
      itemsByWorker.get(item.worker_id).push(item);
    }
    for (const [workerId, items] of itemsByWorker) {
      const worker = workerById.get(workerId);
      if (!worker) continue;
      const expectedStatus = workerStatusForMergeItems(items);
      const expectedStatuses = expectedStatus === "queued"
        ? ["queued", "patch_submitted"]
        : [expectedStatus];
      if (!expectedStatuses.includes(worker.status)) {
        issues.push(issue(
          "worker-merge-status-mismatch",
          `.apex-v2/runs/${run.run_id}/workers/${worker.worker_id}/worker.json`,
          `${worker.status} not in ${expectedStatuses.join(",")} for ${items.map((item) => item.status).join(",")}`
        ));
      }
    }

    for (const workspace of run.action_workspaces) {
      const worker = workerById.get(workspace.worker_id);
      if (workspace.status === "active" && (!worker || worker.status !== "claimed")) {
        issues.push(issue(
          "orphan-active-action-workspace",
          `.apex-v2/runs/${run.run_id}/workers/${workspace.worker_id}/action-workspace.json`,
          `worker=${worker?.status || "missing"}`
        ));
      }
    }

    if (run.run_status !== "done") {
      for (const report of [verification, review, integration].filter(Boolean)) {
        if (report.candidate_digest && !candidateDigests.has(report.candidate_digest)) {
          issues.push(issue(
            "report-missing-candidate",
            `.apex-v2/runs/${run.run_id}`,
            report.candidate_digest
          ));
        }
      }
    }
  }

  for (const approval of state.approvals) {
    if (
      approval.kind === "merge"
      && approval.candidate_digest
      && !candidateDigests.has(approval.candidate_digest)
    ) {
      issues.push(issue(
        "approval-missing-candidate",
        ".apex-v2/approvals/items.json",
        `${approval.id}:${approval.candidate_digest}`
      ));
    }
  }
  for (const transaction of state.transactions) {
    if (transaction.status === "started") {
      issues.push(issue(
        "unfinished-transaction",
        `.apex-v2/transactions/${transaction.transaction_id}.json`,
        transaction.kind
      ));
    }
  }
  for (const run of state.runs) {
    const record = run.negative_control;
    if (!record) continue;
    if (record.run_id !== run.run_id) {
      issues.push(issue(
        "negative-control-run-mismatch",
        `.apex-v2/runs/${run.run_id}/negative-control.json`,
        `${record.run_id} != ${run.run_id}`
      ));
    }
    if (
      record.status === "restored"
      && (
        record.red_evidence_refs.length === 0
        || record.green_evidence_refs.length === 0
        || record.restoration_evidence_refs.length === 0
      )
    ) {
      issues.push(issue(
        "negative-control-incomplete-restoration",
        `.apex-v2/runs/${run.run_id}/negative-control.json`,
        record.record_id
      ));
    }
  }
  for (const decision of state.decisions) {
    const artifactPath = join(
      root,
      "artifacts",
      decision.run_id,
      `${decision.artifact_id}.json`
    );
    const artifact = readJson(artifactPath, null);
    if (!artifact) {
      issues.push(issue(
        "decision-artifact-missing",
        ".apex-v2/decisions/index.json",
        decision.decision_id
      ));
      continue;
    }
    const actualHash = createHash("sha256")
      .update(JSON.stringify(artifact))
      .digest("hex");
    if (actualHash !== decision.artifact_sha256) {
      issues.push(issue(
        "decision-artifact-hash-mismatch",
        ".apex-v2/decisions/index.json",
        decision.decision_id
      ));
    }
  }
  const receiptsById = new Map(
    state.learning.receipts.map((receipt) => [receipt.receipt_id, receipt])
  );
  const jobsById = new Map(
    state.learning.jobs.map((job) => [job.job_id, job])
  );
  for (const proposal of state.learning.proposals) {
    if (proposal.status !== "applied") continue;
    if (!proposal.apply_job_id && !proposal.apply_receipt_id) {
      warnings.push({
        kind: "legacy-applied-learning-without-receipt",
        path: ".apex-v2/learning/proposals.json",
        detail: proposal.id
      });
      continue;
    }
    const receipt = receiptsById.get(proposal.apply_receipt_id);
    if (!receipt) {
      issues.push(issue(
        "applied-learning-missing-receipt",
        ".apex-v2/learning/proposals.json",
        proposal.id
      ));
      continue;
    }
    const job = jobsById.get(proposal.apply_job_id);
    if (!job || job.status !== "applied" || job.receipt_id !== receipt.receipt_id) {
      issues.push(issue(
        "learning-job-receipt-mismatch",
        ".apex-v2/learning/jobs.json",
        proposal.id
      ));
    }
    const target = join(root, proposal.target_file);
    const content = existsSync(target) ? readFileSync(target, "utf8") : "";
    const actualHash = createHash("sha256")
      .update(receipt.applied_content || "")
      .digest("hex");
    if (
      !content.includes(receipt.applied_content || "")
      || actualHash !== receipt.content_sha256
    ) {
      issues.push(issue(
        "learning-receipt-content-mismatch",
        `.apex-v2/learning/receipts/receipt-${receipt.receipt_id}.json`,
        `${receipt.content_sha256} != ${actualHash || "missing"}`
      ));
    }
  }

  return {
    state,
    state_hash: stableHash(state),
    issues,
    warnings
  };
}

export function buildOperationalState(root) {
  return {
    schema_version: "v0",
    runs: readRuns(root),
    approvals: readJson(join(root, "approvals", "items.json"), [])
      .map((approval) => ({
        id: approval.id,
        kind: approval.kind,
        run_id: approval.run_id,
        status: approval.status,
        decision: approval.decision,
        candidate_digest: approval.candidate_digest ?? null,
        action_hash: approval.action_hash
      }))
      .sort(byId),
    decisions: readJson(join(root, "decisions", "index.json"), [])
      .map((decision) => ({
        decision_id: decision.decision_id,
        run_id: decision.run_id,
        status: decision.status,
        mode: decision.mode,
        revision: decision.revision,
        artifact_id: decision.artifact_id,
        artifact_sha256: decision.artifact_sha256,
        candidate_digest: decision.candidate_digest || null
      }))
      .sort((left, right) =>
        left.decision_id.localeCompare(right.decision_id)
      ),
    learning: {
      proposals: readJson(join(root, "learning", "proposals.json"), [])
        .map((proposal) => ({
          id: proposal.id,
          source_run_id: proposal.source_run_id,
          target_file: proposal.target_file,
          status: proposal.status,
          apply_job_id: proposal.apply_job_id || null,
          apply_receipt_id: proposal.apply_receipt_id || null
        }))
        .sort(byId),
      jobs: readJson(join(root, "learning", "jobs.json"), [])
        .map((job) => ({
          job_id: job.job_id,
          run_id: job.run_id,
          proposal_id: job.proposal_id,
          status: job.status,
          attempt: job.attempt,
          receipt_id: job.receipt_id || null
        }))
        .sort((left, right) => left.job_id.localeCompare(right.job_id)),
      receipts: readJsonFiles(join(root, "learning", "receipts"))
        .map((receipt) => ({
          receipt_id: receipt.receipt_id,
          job_id: receipt.job_id,
          proposal_id: receipt.proposal_id,
          target_file: receipt.target_file,
          applied_content: receipt.applied_content,
          content_sha256: receipt.content_sha256,
          knowledge_version_after: receipt.knowledge_version_after
        }))
        .sort((left, right) =>
          left.receipt_id.localeCompare(right.receipt_id)
        )
    },
    transactions: readJsonFiles(join(root, "transactions"))
      .map((transaction) => ({
        transaction_id: transaction.transaction_id,
        kind: transaction.kind,
        status: transaction.status,
        idempotency_key: transaction.idempotency_key
      }))
      .sort((left, right) => left.transaction_id.localeCompare(right.transaction_id))
  };
}

function readRuns(root) {
  const runsDir = join(root, "runs");
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const runDir = join(runsDir, entry.name);
      const run = readJson(join(runDir, "run.json"), {});
      const workers = readWorkers(runDir);
      return {
        run_id: entry.name,
        run_status: run.status || "missing",
        workers: workers.map(({ worker, patchAliasDrift }) => ({
          ...worker,
          patch_alias_drift: patchAliasDrift
        })).sort((left, right) => left.worker_id.localeCompare(right.worker_id)),
        patches: workers.flatMap(({ patches }) => patches.map(patchSummary))
          .sort((left, right) => left.patch_id.localeCompare(right.patch_id)),
        action_workspaces: workers.map(({ actionWorkspace }) => actionWorkspace)
          .filter(Boolean)
          .sort((left, right) => left.worker_id.localeCompare(right.worker_id)),
        merge_queue: readJson(join(runDir, "merge-queue.json"), null),
        verification: reportSummary(readJson(join(runDir, "verification-report.json"), null)),
        review: reportSummary(readJson(join(runDir, "review-report.json"), null)),
        integration: reportSummary(readJson(join(runDir, "integration-report.json"), null)),
        negative_control: negativeControlSummary(
          readJson(join(runDir, "negative-control.json"), null)
        ),
        candidates: readJsonFiles(join(runDir, "candidates")).sort((left, right) =>
          left.candidate_digest.localeCompare(right.candidate_digest)
        )
      };
    })
    .sort((left, right) => left.run_id.localeCompare(right.run_id));
}

function negativeControlSummary(record) {
  if (!record) return null;
  return {
    record_id: record.record_id,
    run_id: record.run_id,
    mode: record.mode,
    status: record.status,
    revision: record.revision,
    red_evidence_refs: record.red_evidence_refs || [],
    green_evidence_refs: record.green_evidence_refs || [],
    restoration_evidence_refs: record.restoration_evidence_refs || [],
    waiver: record.waiver || null
  };
}

function readWorkers(runDir) {
  const workersDir = join(runDir, "workers");
  if (!existsSync(workersDir)) return [];
  return readdirSync(workersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(workersDir, entry.name);
      const worker = readJson(join(dir, "worker.json"), {});
      const patches = readWorkerPatchBundles(dir).map(({ patch }) => patch);
      const alias = readJson(join(dir, "patch-bundle.json"), null);
      const immutableAlias = alias?.patch_id
        ? readJson(join(dir, "patches", alias.patch_id, "patch-bundle.json"), null)
        : null;
      return {
        worker: {
          worker_id: entry.name,
          plan_node_id: worker.plan_node_id,
          status: worker.status || "missing",
          adapter: worker.adapter || null,
          fencing_token: Number(worker.fencing_token || 0),
          claim_expires_at: worker.claim_expires_at || null
        },
        patches,
        patchAliasDrift: immutableAlias && stableHash(alias) !== stableHash(immutableAlias)
          ? alias.patch_id
          : null,
        actionWorkspace: readJson(join(dir, "action-workspace.json"), null)
      };
    });
}

function reportSummary(report) {
  if (!report) return null;
  return {
    report_id: report.report_id,
    status: report.status,
    candidate_digest: report.candidate_digest || null
  };
}

function patchSummary(patch) {
  if (!patch) return null;
  return {
    patch_id: patch.patch_id,
    worker_id: patch.worker_id,
    plan_node_id: patch.plan_node_id,
    status: patch.status,
    changed_files: patch.changed_files || [],
    content_hash: stableHash(patch)
  };
}

function readJsonFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(join(directory, name), null))
    .filter(Boolean);
}

function issue(kind, path, detail) {
  return { kind, path, detail };
}

function byId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}
