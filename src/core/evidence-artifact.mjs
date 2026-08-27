import { createHash } from "node:crypto";
import { join } from "node:path";
import { shortId, writeJson } from "../lib/common.mjs";
import { assertContract } from "./contracts.mjs";
import { SCHEMA_VERSION } from "./store.mjs";

export function normalizeEvidenceSubmission(worker, input) {
  if (!input.evidenceArtifact) {
    if (worker.evidence_format === "unified-v1") {
      throw new Error(
        `worker ${worker.worker_id} requires unified evidence_artifact`
      );
    }
    return {
      semanticEvidence: input.semanticEvidence || null,
      capabilityEvidence: input.capabilityEvidence || [],
      submissionFormat: "legacy_projection"
    };
  }
  if (
    input.semanticEvidence
    || (input.capabilityEvidence || []).length > 0
  ) {
    throw new Error(
      "evidence_artifact 不能与 legacy semantic/capability evidence 同时提交"
    );
  }
  assertContract(
    "evidence-submission.schema.json",
    input.evidenceArtifact,
    `evidence submission:${worker.worker_id}`
  );
  let semanticEvidence = null;
  if (input.evidenceArtifact.semantic_evidence_json != null) {
    try {
      semanticEvidence = JSON.parse(
        input.evidenceArtifact.semantic_evidence_json
      );
    } catch (error) {
      throw new Error(`semantic_evidence_json 无效：${error.message}`);
    }
  }
  const bindingMap = new Map((worker.capability_bindings || []).map((binding) => [
    binding.capability_id,
    binding
  ]));
  const seen = new Set();
  const capabilityEvidence = input.evidenceArtifact.capability_outputs.map(
    (section) => {
      const binding = bindingMap.get(section.capability_id);
      if (!binding) {
        throw new Error(`Capability output 未绑定：${section.capability_id}`);
      }
      if (seen.has(section.capability_id)) {
        throw new Error(`Capability output 重复：${section.capability_id}`);
      }
      seen.add(section.capability_id);
      let output;
      try {
        output = JSON.parse(section.output_json);
      } catch (error) {
        throw new Error(
          `Capability output_json 无效：${section.capability_id} ${error.message}`
        );
      }
      return {
        schema_version: SCHEMA_VERSION,
        capability_id: binding.capability_id,
        capability_version: binding.capability_version,
        invocation_id: `capinv-${worker.worker_id}-${binding.capability_id}`,
        objective: worker.objective,
        source_refs: semanticEvidence?.source_refs || input.refs || [],
        claims: semanticEvidence?.claims || [input.summary],
        uncertainties: semanticEvidence?.uncertainties || [],
        verification_refs: worker.verification || [],
        output_contract: binding.output_contract,
        output,
        created_at: input.timestamp
      };
    }
  );
  return {
    semanticEvidence,
    capabilityEvidence,
    submissionFormat: "unified"
  };
}

export function persistUnifiedEvidence(root, worker, input) {
  const timestamp = input.timestamp;
  const evidenceArtifact = {
    schema_version: SCHEMA_VERSION,
    evidence_artifact_id: shortId("evidence"),
    run_id: worker.run_id,
    node_id: worker.plan_node_id,
    worker_id: worker.worker_id,
    action_id: input.actionId || null,
    attempt: input.attempt ?? Number(worker.attempt || 0) + 1,
    kind: evidenceKind(worker),
    objective: worker.objective,
    verdict: input.success ? "PASS" : "FAIL",
    candidate_digest: input.semanticEvidence?.candidate_digest || null,
    scope: {
      read: worker.read_scope || [],
      write: worker.write_scope || []
    },
    sections: [
      ...(input.semanticEvidence ? [{
        kind: "semantic",
        capability_id: null,
        output_contract: null,
        content: input.semanticEvidence
      }] : []),
      ...(input.capabilityEvidence || []).map((evidence) => ({
        kind: "capability",
        capability_id: evidence.capability_id,
        output_contract: evidence.output_contract,
        content: evidence.output
      })),
      ...((input.tests || []).length > 0 ? [{
        kind: "tests",
        capability_id: null,
        output_contract: null,
        content: { results: input.tests }
      }] : []),
      ...(input.patch ? [{
        kind: "patch",
        capability_id: null,
        output_contract: null,
        content: {
          patch_id: input.patch.patch_id,
          changed_files: input.patch.changed_files
        }
      }] : [])
    ],
    provenance: {
      submission_format: input.submissionFormat || "legacy_projection",
      executor: input.executor || null,
      model: input.model || null
    },
    evidence_refs: [...new Set(input.evidenceRefs || [])],
    gate: {
      status: input.success ? "PASS" : "FAIL",
      reasons: input.reasons || []
    },
    created_at: timestamp
  };
  const dir = join(root, "runs", worker.run_id, "workers", worker.worker_id);
  const artifactName = `evidence-artifact-${evidenceArtifact.evidence_artifact_id}.json`;
  writeJson(join(dir, artifactName), evidenceArtifact);
  const artifactRef = `${worker.namespace}/${artifactName}`;
  const receiptRefs = (input.capabilityEvidence || []).map((evidence) => {
    const validationPassed = input.capabilityValidation?.valid !== false;
    const receipt = {
      schema_version: SCHEMA_VERSION,
      receipt_id: shortId("capability-receipt"),
      evidence_artifact_id: evidenceArtifact.evidence_artifact_id,
      capability_id: evidence.capability_id,
      capability_version: evidence.capability_version,
      invocation_id: evidence.invocation_id,
      output_contract: evidence.output_contract,
      output_ref: artifactRef,
      output_digest: createHash("sha256")
        .update(JSON.stringify(evidence.output))
        .digest("hex"),
      source_refs: evidence.source_refs || [],
      verification_refs: evidence.verification_refs || [],
      validation: {
        binding_match: validationPassed,
        version_match: validationPassed,
        schema_valid: validationPassed,
        semantic_valid: validationPassed,
        status: validationPassed ? "PASS" : "FAIL"
      },
      derived_at: timestamp
    };
    const name = [
      "capability-receipt",
      evidenceArtifact.evidence_artifact_id,
      evidence.capability_id
    ].join("-") + ".json";
    writeJson(join(dir, name), receipt);
    return `${worker.namespace}/${name}`;
  });
  return {
    evidenceArtifact,
    evidenceArtifactRef: artifactRef,
    capabilityReceiptRefs: receiptRefs
  };
}

function evidenceKind(worker) {
  if (worker.plan_node_id === "delivery-design") return "plan";
  if (worker.plan_node_id === "delivery-risk-challenger") {
    return "risk_challenge";
  }
  if (worker.plan_node_id === "delivery-review") return "review";
  if (worker.execution_class === "workspace_patch") return "patch";
  return "execution";
}
