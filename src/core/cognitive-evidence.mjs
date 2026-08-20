const GENERIC_CLAIMS = new Set([
  "done",
  "completed",
  "complete",
  "looks good",
  "ok",
  "pass",
  "implemented",
  "已完成",
  "完成",
  "通过",
  "没问题"
]);
const NEGATIVE_PREFIX = /^(?:not|no|never|cannot|can't|不|未|无)\s*/i;
const BLOCKING_FINDING = /^(?:\[?P[01]\]?|blocking|blocker|critical)\s*[:：-]/i;

export function cognitiveEvidenceSemanticIssues(evidence) {
  const issues = [];
  const objective = normalize(evidence.objective);
  const claims = (evidence.claims || []).map((claim) => ({
    original: claim,
    normalized: normalize(claim)
  }));
  const seenClaims = new Set();
  const polarity = new Map();

  for (const claim of claims) {
    if (claim.normalized === objective) {
      issues.push("claim copied the objective verbatim");
    }
    if (GENERIC_CLAIMS.has(claim.normalized)) {
      issues.push(`generic claim is not evidence: ${claim.original}`);
    }
    if (seenClaims.has(claim.normalized)) {
      issues.push(`duplicate claim: ${claim.original}`);
    }
    seenClaims.add(claim.normalized);

    const negative = NEGATIVE_PREFIX.test(claim.normalized);
    const key = claim.normalized.replace(NEGATIVE_PREFIX, "");
    if (!key) continue;
    if (!polarity.has(key)) polarity.set(key, new Set());
    polarity.get(key).add(negative ? "negative" : "positive");
  }
  for (const [key, values] of polarity) {
    if (values.size > 1) issues.push(`contradictory claims: ${key}`);
  }

  const sourceRefs = new Set(evidence.source_refs || []);
  const criterionStatuses = new Map();
  for (const mapping of evidence.acceptance_mapping || []) {
    if (!sourceRefs.has(mapping.evidence_ref)) {
      issues.push(
        `acceptance mapping references undeclared source: ${mapping.evidence_ref}`
      );
    }
    const criterion = normalize(mapping.criterion);
    if (!criterionStatuses.has(criterion)) criterionStatuses.set(criterion, new Set());
    criterionStatuses.get(criterion).add(mapping.status);
  }
  for (const [criterion, statuses] of criterionStatuses) {
    if (statuses.size > 1) {
      issues.push(`conflicting acceptance statuses: ${criterion}`);
    }
  }

  if (
    evidence.evidence_type === "review"
    && evidence.merge_posture === "approve"
    && [...(evidence.findings || []), ...(evidence.residual_risks || [])]
      .some((finding) => BLOCKING_FINDING.test(String(finding).trim()))
  ) {
    issues.push("review cannot approve with a blocking finding or residual risk");
  }
  return [...new Set(issues)];
}

export function assertCognitiveEvidenceSemantics(evidence) {
  const issues = cognitiveEvidenceSemanticIssues(evidence);
  if (issues.length > 0) {
    throw new Error(`cognitive evidence semantic conflict: ${issues.join("; ")}`);
  }
  return evidence;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[。！？!?.,;；:：]+$/g, "")
    .replace(/\s+/g, " ");
}
