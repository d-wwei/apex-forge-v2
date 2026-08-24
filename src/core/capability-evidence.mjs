import { assertContract, validateContract } from "./contracts.mjs";

const REQUIRED_OUTPUT_FIELDS = {
  "engineering-spec-evidence": [
    "objective", "in_scope", "out_of_scope", "acceptance", "assumptions",
    "open_questions", "verification_plan"
  ],
  "source-grounding-evidence": [
    "detected_version", "authoritative_sources", "verified_claims", "conflicts",
    "unverified_assumptions"
  ],
  "architecture-design-evidence": [
    "problem", "constraints", "alternatives", "selected_design",
    "state_ownership", "failure_modes", "rollback", "verification"
  ],
  "root-cause-evidence": [
    "reproduction", "observed_failure", "failure_signature", "data_flow",
    "hypotheses", "experiments", "confirmed_root_cause", "affected_scope",
    "fix_constraints", "regression_target"
  ],
  "negative-control-evidence": [
    "test_entry", "fault_model", "red_command", "red_signature",
    "green_command", "green_result", "restoration_result"
  ],
  "incremental-plan-evidence": [
    "slices", "slice_dependencies", "write_scopes", "verification_per_slice"
  ],
  "code-review-evidence": [
    "candidate_digest", "findings", "residual_risks", "merge_posture"
  ],
  "security-audit-evidence": [
    "scope", "threat_model", "findings", "residual_risks", "merge_posture"
  ],
  "high-risk-evidence": [
    "safety_claim", "assumptions", "adversarial_cases", "blast_radius",
    "rollback", "residual_risks"
  ],
  "test-strategy-evidence": [
    "test_mode", "affected_surfaces", "selected_test_groups",
    "excluded_groups", "selection_rationale", "stop_conditions"
  ],
  "documentation-sync-evidence": [
    "changed_behavior", "affected_docs", "updated_docs",
    "intentionally_unchanged", "stale_refs", "verification"
  ],
  "frontend-design-evidence": [
    "brief", "information_architecture", "selected_direction", "design_tokens",
    "layout_spec", "responsive_rules", "interaction_states", "acceptance"
  ],
  "design-to-code-evidence": [
    "design_artifact_ref", "implementation_spec", "component_map",
    "changed_files", "acceptance_checklist", "fidelity_findings"
  ],
  "browser-qa-evidence": [
    "url", "browser_provider", "viewport", "user_flows", "screenshots",
    "console_errors", "network_errors", "behavior_results"
  ],
  "mobile-qa-evidence": [
    "platform", "device", "os_version", "app_artifact", "flows",
    "screenshots_or_video", "crashes", "logs", "cleanup"
  ],
  "performance-evidence": [
    "metric", "baseline", "candidate", "environment_fingerprint",
    "sample_count", "distribution", "threshold", "verdict"
  ],
  "migration-safety-evidence": [
    "source_version", "target_version", "preconditions", "dry_run", "backup",
    "forward_steps", "rollback_steps", "idempotency", "replay_or_reconcile",
    "data_diff"
  ],
  "deployment-receipt": [
    "candidate_digest", "environment", "approval", "deployment_id",
    "started_at", "completed_at", "health_checks", "canary_results",
    "rollback_token"
  ],
  "project-audit-evidence": [
    "objective", "commitments", "checks", "findings", "coverage",
    "confidence", "unverified_items", "release_posture"
  ],
  "postmortem-evidence": [
    "impact", "timeline", "detection_gap", "root_causes", "failed_controls",
    "corrective_actions", "control_candidates", "owners", "verification"
  ],
  "simplification-evidence": [
    "candidates", "consumer_evidence", "deletion_plan", "risk",
    "verification_plan", "estimated_savings", "actual_savings", "decision"
  ]
};

export function validateCapabilityEvidence(evidence, context = "capability evidence") {
  return validateContract("capability-evidence.schema.json", evidence, context);
}

export function validateCapabilityEvidenceForBindings(
  bindings = [],
  evidenceItems = [],
  options = {}
) {
  const declared = new Map(bindings.map((binding) => [
    binding.capability_id,
    binding
  ]));
  const submitted = new Map();
  for (const evidence of evidenceItems || []) {
    assertContract(
      "capability-evidence.schema.json",
      evidence,
      `capability evidence:${evidence?.capability_id || "unknown"}`
    );
    const binding = declared.get(evidence.capability_id);
    if (!binding) {
      throw new Error(`Capability Evidence 未绑定：${evidence.capability_id}`);
    }
    if (submitted.has(evidence.capability_id)) {
      throw new Error(`Capability Evidence 重复：${evidence.capability_id}`);
    }
    if (evidence.capability_version !== binding.capability_version) {
      throw new Error(
        `Capability Evidence version 不匹配：${evidence.capability_id} `
        + `${evidence.capability_version} != ${binding.capability_version}`
      );
    }
    if (evidence.output_contract !== binding.output_contract) {
      throw new Error(
        `Capability Evidence output contract 不匹配：${evidence.capability_id} `
        + `${evidence.output_contract} != ${binding.output_contract}`
      );
    }
    const requiredFields = REQUIRED_OUTPUT_FIELDS[evidence.output_contract];
    if (!requiredFields) {
      throw new Error(`未知 Capability Evidence output contract：${evidence.output_contract}`);
    }
    const missingFields = requiredFields.filter((field) =>
      !Object.hasOwn(evidence.output || {}, field)
    );
    if (missingFields.length > 0) {
      throw new Error(
        `Capability Evidence 缺少 output 字段：${evidence.capability_id} ${missingFields.join(",")}`
      );
    }
    assertContract(
      `${evidence.output_contract}.schema.json`,
      evidence.output,
      `capability output:${evidence.capability_id}`
    );
    const genericIssues = genericEvidenceIssues(evidence, options);
    if (genericIssues.length > 0) {
      throw new Error(
        `Capability Evidence 语义无效：${evidence.capability_id} `
        + genericIssues.join("; ")
      );
    }
    const semanticIssues = capabilityEvidenceSemanticIssues(evidence);
    if (semanticIssues.length > 0) {
      throw new Error(
        `Capability Evidence 语义无效：${evidence.capability_id} `
        + semanticIssues.join("; ")
      );
    }
    submitted.set(evidence.capability_id, evidence);
  }
  const missing = bindings
    .filter((binding) => binding.required)
    .map((binding) => binding.capability_id)
    .filter((capabilityId) => !submitted.has(capabilityId));
  const enforceRequired = options.enforceRequired ?? options.requireAll ?? true;
  if (missing.length > 0 && enforceRequired) {
    throw new Error(`缺少 required capability evidence：${missing.join(", ")}`);
  }
  return [...submitted.values()];
}

function genericEvidenceIssues(evidence, options) {
  const issues = [];
  const normalizedClaims = evidence.claims.map(normalizeClaim);
  if (evidence.claims.some(isGenericClaim)) {
    issues.push("generic claim 不能作为完成证据");
  }
  if (new Set(normalizedClaims).size !== normalizedClaims.length) {
    issues.push("copied claim 重复");
  }
  if (hasContradictoryClaims(normalizedClaims)) {
    issues.push("claims 存在 contradict 冲突");
  }
  if (Array.isArray(options.declaredEvidenceRefs)) {
    const declared = new Set(options.declaredEvidenceRefs);
    const undeclared = [
      ...(evidence.source_refs || []),
      ...(evidence.verification_refs || [])
    ].filter((ref) => !declared.has(ref));
    if (undeclared.length > 0) {
      issues.push(`undeclared evidence ref 未声明：${[...new Set(undeclared)].join(",")}`);
    }
  }
  const candidateDigest = evidence.output?.candidate_digest;
  if (
    options.expectedCandidateDigest
    && candidateDigest
    && candidateDigest !== options.expectedCandidateDigest
  ) {
    issues.push(
      `candidate digest stale/不匹配：${candidateDigest} != ${options.expectedCandidateDigest}`
    );
  }
  if (
    options.expectedEnvironmentFingerprint
    && evidence.output?.environment_fingerprint
    && evidence.output.environment_fingerprint
      !== options.expectedEnvironmentFingerprint
  ) {
    issues.push(
      "environment fingerprint drift/不匹配："
      + `${evidence.output.environment_fingerprint} `
      + `!= ${options.expectedEnvironmentFingerprint}`
    );
  }
  return issues;
}

function isGenericClaim(claim) {
  const value = normalizeClaim(claim);
  return /^(done|complete|completed|pass|passed|ok|okay|success|successful|fixed|implemented|完成|已完成|通过|成功)$/.test(
    value
  );
}

function normalizeClaim(claim) {
  return String(claim || "")
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?'"`(){}[\]，。；：！？“”‘’]/g, " ")
    .replace(/\s+/g, " ");
}

function hasContradictoryClaims(claims) {
  const values = claims.map((claim) => {
    const match = claim.match(/^(not|no|without|never|不|未|无)\s*(.+)$/);
    return match
      ? { negated: true, value: match[2].trim() }
      : { negated: false, value: claim };
  });
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (
        values[left].value
        && values[left].value === values[right].value
        && values[left].negated !== values[right].negated
      ) {
        return true;
      }
    }
  }
  return false;
}

export function capabilityEvidenceSemanticIssues(evidence) {
  const output = evidence?.output || {};
  const issues = [];
  if (evidence.capability_id === "engineering-spec") {
    requireNonEmptyArray(output.in_scope, "in_scope", issues);
    requireNonEmptyArray(output.acceptance, "acceptance", issues);
    rejectArrayOverlap(output.in_scope, output.out_of_scope, "scope contradiction", issues);
  }
  if (evidence.capability_id === "source-grounding") {
    requireNonEmptyArray(output.authoritative_sources, "authoritative_sources", issues);
    requireNonEmptyArray(output.verified_claims, "verified_claims", issues);
    rejectArrayOverlap(
      output.verified_claims,
      output.conflicts,
      "verified claim conflicts with source evidence",
      issues
    );
  }
  if (evidence.capability_id === "architecture-design") {
    if (!Array.isArray(output.alternatives) || output.alternatives.length < 2) {
      issues.push("architecture alternatives 必须至少 2 个");
    }
    requireNonEmptyValue(output.state_ownership, "state_ownership", issues);
    requireNonEmptyValue(output.rollback, "rollback", issues);
    if (
      typeof output.selected_design === "string"
      && Array.isArray(output.alternatives)
      && !output.alternatives.some((item) =>
        typeof item === "string"
        && normalizeSemanticValue(item) === normalizeSemanticValue(output.selected_design)
      )
    ) {
      issues.push("selected_design 不在 alternatives 中");
    }
  }
  if (evidence.capability_id === "systematic-debugging") {
    if (!Array.isArray(output.hypotheses) || output.hypotheses.length < 3) {
      issues.push("debug hypotheses 必须至少 3 个");
    }
    requireNonEmptyArray(output.experiments, "experiments", issues);
    if (
      typeof output.confirmed_root_cause !== "string"
      || output.confirmed_root_cause.trim().length < 12
      || /^(unknown|unclear|not sure|未知|不确定)$/i.test(
        output.confirmed_root_cause.trim()
      )
    ) {
      issues.push("confirmed_root_cause 不具体");
    }
  }
  if (evidence.capability_id === "tdd-negative-control") {
    requireNonEmptyValue(output.red_signature, "red_signature", issues);
    requireNonEmptyValue(output.red_command, "red_command", issues);
    requireNonEmptyValue(output.green_command, "green_command", issues);
    if (
      typeof output.test_entry === "string"
      && (
        !String(output.red_command || "").includes(output.test_entry)
        || !String(output.green_command || "").includes(output.test_entry)
      )
    ) {
      issues.push("RED/GREEN 必须使用同一 test_entry");
    }
  }
  if (evidence.capability_id === "incremental-delivery") {
    requireNonEmptyArray(output.slices, "slices", issues);
    requireNonEmptyValue(output.write_scopes, "write_scopes", issues);
    requireNonEmptyValue(output.verification_per_slice, "verification_per_slice", issues);
  }
  if (evidence.capability_id === "code-review") {
    requireDigest(output.candidate_digest, "candidate_digest", issues);
    if (
      output.merge_posture === "approve"
      && hasBlockingFinding(output.findings)
    ) {
      issues.push("blocking review finding 不能 approve");
    }
  }
  if (evidence.capability_id === "security-audit") {
    if (
      output.merge_posture === "approve"
      && hasBlockingFinding(output.findings)
    ) {
      issues.push("critical/high security finding 不能 approve");
    }
  }
  if (evidence.capability_id === "high-risk-review") {
    requireNonEmptyArray(output.assumptions, "assumptions", issues);
    requireNonEmptyArray(output.adversarial_cases, "adversarial_cases", issues);
    requireNonEmptyValue(output.rollback, "rollback", issues);
  }
  if (evidence.capability_id === "test-strategy") {
    requireNonEmptyArray(output.selected_test_groups, "selected_test_groups", issues);
    requireNonEmptyValue(output.selection_rationale, "selection_rationale", issues);
    const onlySmoke = (output.selected_test_groups || []).length > 0
      && output.selected_test_groups.every((item) => /\bsmoke\b/i.test(String(item)));
    const highRiskSurface = (output.affected_surfaces || []).some((item) =>
      /\b(auth(?:orization|entication)?|security|permission|migration|deploy|trading|payment|credential)\b/i.test(
        String(item)
      )
    );
    if (onlySmoke && highRiskSurface) {
      issues.push("high-risk surface 不能只选择 smoke tests");
    }
  }
  if (evidence.capability_id === "documentation-sync") {
    const affected = new Set(output.affected_docs || []);
    const handled = new Set([
      ...(output.updated_docs || []),
      ...(output.intentionally_unchanged || [])
    ]);
    const missing = [...affected].filter((item) => !handled.has(item));
    if (missing.length > 0) {
      issues.push(`affected_docs 未处理：${missing.join(",")}`);
    }
  }
  if (evidence.capability_id === "frontend-design") {
    requireNonEmptyValue(output.brief, "brief", issues);
    requireNonEmptyValue(output.information_architecture, "information_architecture", issues);
    requireNonEmptyValue(output.selected_direction, "selected_direction", issues);
    requireNonEmptyValue(output.design_tokens, "design_tokens", issues);
    requireNonEmptyArray(output.acceptance, "acceptance", issues);
  }
  if (evidence.capability_id === "design-to-code") {
    requireNonEmptyValue(output.design_artifact_ref, "design_artifact_ref", issues);
    requireNonEmptyValue(output.implementation_spec, "implementation_spec", issues);
    requireNonEmptyValue(output.component_map, "component_map", issues);
    requireNonEmptyValue(output.acceptance_checklist, "acceptance_checklist", issues);
  }
  if (evidence.capability_id === "browser-qa") {
    requireNonEmptyValue(output.url, "url", issues);
    requireNonEmptyArray(output.user_flows, "user_flows", issues);
    requireNonEmptyArray(output.screenshots, "screenshots", issues);
    requireNonEmptyValue(output.behavior_results, "behavior_results", issues);
    if (
      claimsAssertSuccess(evidence.claims)
      && (
        hasFailureStatus(output.behavior_results)
        || hasRecordedIssues(output.console_errors)
        || hasRecordedIssues(output.network_errors)
      )
    ) {
      issues.push("Browser PASS 与 behavior/console/network failure 冲突");
    }
  }
  if (evidence.capability_id === "mobile-qa") {
    requireNonEmptyValue(output.platform, "platform", issues);
    requireNonEmptyValue(output.device, "device", issues);
    requireNonEmptyValue(output.app_artifact, "app_artifact", issues);
    requireNonEmptyArray(output.flows, "flows", issues);
    requireNonEmptyValue(output.screenshots_or_video, "screenshots_or_video", issues);
    requireNonEmptyValue(output.cleanup, "cleanup", issues);
    if (
      claimsAssertSuccess(evidence.claims)
      && hasRecordedIssues(output.crashes)
    ) {
      issues.push("Mobile PASS 与 crash evidence 冲突");
    }
  }
  if (evidence.capability_id === "performance-validation") {
    requireNonEmptyValue(output.environment_fingerprint, "environment_fingerprint", issues);
    if (!Number.isInteger(output.sample_count) || output.sample_count < 5) {
      issues.push("performance sample_count 必须至少 5");
    }
    requireNonEmptyValue(output.distribution, "distribution", issues);
    requireNonEmptyValue(output.threshold, "threshold", issues);
  }
  if (evidence.capability_id === "migration-safety") {
    requireNonEmptyValue(output.dry_run, "dry_run", issues);
    requireNonEmptyValue(output.backup, "backup", issues);
    requireNonEmptyValue(output.rollback_steps, "rollback_steps", issues);
    requireNonEmptyValue(output.idempotency, "idempotency", issues);
    requireNonEmptyValue(output.replay_or_reconcile, "replay_or_reconcile", issues);
    if (
      claimsAssertSuccess(evidence.claims)
      && (
        hasFailureStatus([output.dry_run])
        || hasFailureStatus([output.replay_or_reconcile])
      )
    ) {
      issues.push("Migration PASS 与 dry-run/reconcile failure 冲突");
    }
  }
  if (evidence.capability_id === "deploy-release") {
    requireDigest(output.candidate_digest, "candidate_digest", issues);
    requireNonEmptyValue(output.approval, "approval", issues);
    requireNonEmptyValue(output.health_checks, "health_checks", issues);
    requireNonEmptyValue(output.rollback_token, "rollback_token", issues);
    if (
      claimsAssertSuccess(evidence.claims)
      && (
        hasFailureStatus(output.health_checks)
        || hasFailureStatus(output.canary_results)
      )
    ) {
      issues.push("Deploy PASS 与 health/canary failure 冲突");
    }
  }
  if (evidence.capability_id === "project-audit") {
    requireNonEmptyArray(output.commitments, "commitments", issues);
    requireNonEmptyArray(output.checks, "checks", issues);
    requireNonEmptyValue(output.release_posture, "release_posture", issues);
    if (
      ["PASS", "GO"].includes(output.release_posture)
      && (
        hasFailureStatus(output.checks)
        || Number(output.coverage) < 1
        || hasRecordedIssues(output.unverified_items)
      )
    ) {
      issues.push("Audit PASS 含失败检查、覆盖缺口或未验证项");
    }
  }
  if (evidence.capability_id === "postmortem") {
    requireNonEmptyValue(output.impact, "impact", issues);
    requireNonEmptyArray(output.failed_controls, "failed_controls", issues);
    requireNonEmptyArray(output.corrective_actions, "corrective_actions", issues);
    requireNonEmptyArray(output.control_candidates, "control_candidates", issues);
    requireNonEmptyValue(output.verification, "verification", issues);
  }
  if (evidence.capability_id === "simplification") {
    requireNonEmptyArray(output.candidates, "candidates", issues);
    requireNonEmptyValue(output.consumer_evidence, "consumer_evidence", issues);
    requireNonEmptyValue(output.verification_plan, "verification_plan", issues);
    if (!Object.hasOwn(output, "actual_savings")) {
      issues.push("actual_savings 必须显式记录或为 null");
    }
    if (
      output.decision === "delete"
      && (output.consumer_evidence || []).some(hasActiveConsumerEvidence)
    ) {
      issues.push("存在真实 consumer 时不能 delete");
    }
  }
  return issues;
}

function requireNonEmptyArray(value, name, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${name} 不能为空`);
  }
}

function requireNonEmptyValue(value, name, issues) {
  if (
    value == null
    || (typeof value === "string" && value.trim() === "")
    || (Array.isArray(value) && value.length === 0)
    || (
      typeof value === "object"
      && !Array.isArray(value)
      && Object.keys(value).length === 0
    )
  ) {
    issues.push(`${name} 不能为空`);
  }
}

function requireDigest(value, name, issues) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    issues.push(`${name} 必须是 candidate digest`);
  }
}

function rejectArrayOverlap(left, right, label, issues) {
  const rightValues = new Set((right || [])
    .filter((item) => typeof item === "string")
    .map(normalizeSemanticValue));
  const overlap = (left || [])
    .filter((item) => typeof item === "string")
    .filter((item) => rightValues.has(normalizeSemanticValue(item)));
  if (overlap.length > 0) {
    issues.push(`${label}：${overlap.join(",")}`);
  }
}

function normalizeSemanticValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function claimsAssertSuccess(claims = []) {
  return claims.some((claim) =>
    /\b(pass|passed|success|successful|safe|approved|ready)\b|通过|成功|安全|可发布/i.test(
      String(claim)
    )
  );
}

function hasRecordedIssues(values) {
  return Array.isArray(values) && values.length > 0;
}

function hasFailureStatus(values = []) {
  return (values || []).some((value) => {
    if (typeof value === "string") {
      return /\b(fail|failed|error|blocked|inconsistent|unhealthy)\b/i.test(value);
    }
    return /\b(fail|failed|error|blocked|inconsistent|unhealthy)\b/i.test(
      String(value?.status || value?.verdict || value?.result || "")
    );
  });
}

function hasActiveConsumerEvidence(value) {
  if (typeof value === "string") {
    return /\b(exists|active|used|imported|consumer found|production import)\b/i.test(value)
      && !/\b(no|none|not|zero|absent|unused)\b/i.test(value);
  }
  return Boolean(
    value?.active === true
    || value?.exists === true
    || ["active", "used", "present"].includes(value?.status)
  );
}

function hasBlockingFinding(findings) {
  return (findings || []).some((finding) => {
    if (typeof finding === "string") {
      return /\b(P0|P1|critical|high|blocking)\b/i.test(finding);
    }
    return Boolean(
      finding?.blocking
      || ["P0", "P1", "critical", "high"].includes(finding?.severity)
    );
  });
}

export function assertCapabilityEvidence(bindings = [], evidenceItems = [], options = {}) {
  const validated = validateCapabilityEvidenceForBindings(
    bindings,
    evidenceItems,
    options
  );
  const submitted = new Set(validated.map((item) => item.capability_id));
  return {
    required: bindings
      .filter((binding) => binding.required)
      .map((binding) => binding.capability_id),
    submitted: [...submitted],
    missing: bindings
      .filter((binding) => binding.required)
      .map((binding) => binding.capability_id)
      .filter((capabilityId) => !submitted.has(capabilityId))
  };
}
