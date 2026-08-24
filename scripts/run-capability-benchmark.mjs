#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { arch, platform } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCapabilityContextBudget,
  capabilityRegistry
} from "../src/core/capability-registry.mjs";
import {
  validateCapabilityEvidence,
  validateCapabilityEvidenceForBindings
} from "../src/core/capability-evidence.mjs";
import {
  CAPABILITY_FIXTURES,
  CURRENT_CANDIDATE_DIGEST,
  STALE_CANDIDATE_DIGEST,
  buildEvidenceCases,
  buildRoutingCases
} from "../tests/fixtures/capabilities/matrix-fixtures.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const startedAt = Date.now();
const benchmarkRoot = join(repoRoot, "benchmarks", "capability-absorption");
const matrix = JSON.parse(readFileSync(join(benchmarkRoot, "matrix.json"), "utf8"));
const registry = capabilityRegistry();
const declaredEvidenceRefs = ["src/value.mjs", "fixture verification"];
const evidenceCases = buildEvidenceCases();
const routingCases = buildRoutingCases();
const candidate = candidateBinding();

const semantic = evidenceCases.map((matrixCase) => {
  const binding = bindingFor(matrixCase.capability_id);
  const evidence = evidenceFor(matrixCase.capability_id, binding, matrixCase.valid_output);
  applyGenericDefect(evidence, matrixCase);
  return {
    case_id: matrixCase.case_id,
    capability_id: matrixCase.capability_id,
    kind: matrixCase.kind,
    enabled_accepts: acceptsEnabled(binding, evidence),
    disabled_accepts: acceptsDisabled(evidence)
  };
});

const domain = CAPABILITY_FIXTURES.map((fixture) => {
  const binding = bindingFor(fixture.capabilityId);
  const evidence = evidenceFor(
    fixture.capabilityId,
    binding,
    fixture.validOutput
  );
  applyDomainDefect(evidence);
  return {
    case_id: `${fixture.capabilityId}:domain-hidden`,
    capability_id: fixture.capabilityId,
    enabled_accepts: acceptsEnabled(binding, evidence),
    disabled_accepts: acceptsDisabled(evidence)
  };
});

const valid = CAPABILITY_FIXTURES.map((fixture) => {
  const binding = bindingFor(fixture.capabilityId);
  const evidence = evidenceFor(
    fixture.capabilityId,
    binding,
    fixture.validOutput
  );
  return {
    capability_id: fixture.capabilityId,
    enabled_accepts: acceptsEnabled(binding, evidence),
    disabled_accepts: acceptsDisabled(evidence)
  };
});

const hiddenSemantic = semantic.filter((item) => item.kind !== "valid");
const enabledCaught = hiddenSemantic.filter((item) => !item.enabled_accepts).length;
const disabledCaught = hiddenSemantic.filter((item) => !item.disabled_accepts).length;
const domainCaught = domain.filter((item) => !item.enabled_accepts).length;
const context = contextMetrics();
const gates = {
  capability_count: registry.capabilities.length === matrix.capability_count,
  routing_cases: routingCases.length >= matrix.gates.routing_cases_min,
  evidence_cases: hiddenSemantic.length >= matrix.gates.evidence_cases_min,
  valid_acceptance: valid.every((item) =>
    item.enabled_accepts && item.disabled_accepts
  ),
  semantic_hidden_recall:
    enabledCaught / hiddenSemantic.length >= matrix.gates.hidden_defect_recall,
  domain_hidden_recall:
    domainCaught / domain.length >= matrix.gates.hidden_defect_recall,
  ablation_signal: disabledCaught < enabledCaught,
  false_positive_rate:
    valid.filter((item) => !item.enabled_accepts).length / valid.length
    <= matrix.gates.false_positive_rate,
  using_skill_words:
    context.using_skill_words <= matrix.gates.using_skill_max_words,
  protocol_words:
    context.max_protocol_words <= matrix.gates.protocol_max_words,
  public_skill_count:
    context.public_skill_count === matrix.gates.public_skill_count,
  context_binding_budget: contextBudgetGate(),
  candidate_binding: candidate.required ? candidate.valid : true
};
const result = {
  schema_version: "v0",
  benchmark_id: matrix.benchmark_id,
  generated_at: new Date().toISOString(),
  status: Object.values(gates).every(Boolean) ? "PASS" : "FAIL",
  registry_version: registry.registry_version,
  enforcement_mode: registry.enforcement_mode,
  provenance: {
    release_candidate_digest: candidate.release_candidate_digest,
    capabilities_sha256: treeHash(join(repoRoot, "capabilities")),
    schemas_sha256: treeHash(join(repoRoot, "schemas")),
    registry_sha256: fileHash(join(repoRoot, "capabilities", "registry.json")),
    capability_lock_sha256: fileHash(join(
      repoRoot,
      "capabilities",
      "capability-lock.json"
    )),
    matrix_sha256: fileHash(join(benchmarkRoot, "matrix.json")),
    task_set_digest: sha256(Buffer.from(JSON.stringify({
      routing: routingCases.map((item) => item.case_id),
      evidence: evidenceCases.map((item) => item.case_id),
      domain: CAPABILITY_FIXTURES.map((item) => item.capabilityId)
    }))),
    evaluator: "deterministic-capability-governance-v1",
    model: null,
    provider: null,
    environment_fingerprint: sha256(Buffer.from(JSON.stringify({
      node: process.version,
      platform: platform(),
      arch: arch()
    })))
  },
  counts: {
    capabilities: registry.capabilities.length,
    routing_cases: routingCases.length,
    evidence_cases: evidenceCases.length,
    hidden_semantic_cases: hiddenSemantic.length,
    domain_hidden_cases: domain.length
  },
  ablation: {
    enabled_hidden_caught: enabledCaught,
    disabled_hidden_caught: disabledCaught,
    enabled_domain_hidden_caught: domainCaught,
    valid_false_positives: valid.filter((item) => !item.enabled_accepts).length
  },
  context,
  usage: {
    duration_ms: Date.now() - startedAt,
    input_tokens: null,
    output_tokens: null,
    tool_calls: null
  },
  gates,
  limitations: [
    "This is a deterministic governance ablation, not a live model-quality benchmark.",
    "The historical 90-run product benchmark is bound to an older candidate and cannot prove current token or wall-time savings.",
    "Browser, mobile, performance, migration, and deploy live certification remains separate from bundled behavior validation."
  ]
};

mkdirSync(benchmarkRoot, { recursive: true });
writeFileSync(
  join(benchmarkRoot, "latest-evaluation.json"),
  `${JSON.stringify(result, null, 2)}\n`
);
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;

function bindingFor(capabilityId) {
  const definition = registry.capabilities.find((item) =>
    item.capability_id === capabilityId
  );
  return {
    capability_id: capabilityId,
    capability_version: definition.version,
    mode: "required",
    required: true,
    output_contract: definition.output_contract
  };
}

function candidateBinding() {
  const expected = String(
    process.env.APEX_EXPECT_CANDIDATE_DIGEST || ""
  ).trim();
  const configuredRoot = String(
    process.env.APEX_RELEASE_CANDIDATE_ROOT || ""
  ).trim();
  if (!expected) {
    return {
      required: false,
      valid: true,
      release_candidate_digest: null
    };
  }
  const manifestPath = configuredRoot
    ? join(resolve(configuredRoot), "manifest.json")
    : null;
  if (!manifestPath || !existsSync(manifestPath)) {
    return {
      required: true,
      valid: false,
      release_candidate_digest: null
    };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capabilityHash = treeHash(join(repoRoot, "capabilities"));
  const schemaHash = treeHash(join(repoRoot, "schemas"));
  return {
    required: true,
    valid:
      manifest.release_candidate_digest === expected
      && manifest.content?.capabilities_sha256 === capabilityHash
      && manifest.content?.schemas_sha256 === schemaHash,
    release_candidate_digest: manifest.release_candidate_digest
  };
}

function evidenceFor(capabilityId, binding, output) {
  return {
    schema_version: "v0",
    capability_id: capabilityId,
    capability_version: binding.capability_version,
    invocation_id: `capinv-benchmark-${capabilityId}`,
    objective: `Benchmark ${capabilityId}`,
    source_refs: ["src/value.mjs"],
    claims: [`${capabilityId} produced source-bound evidence`],
    uncertainties: [],
    verification_refs: ["fixture verification"],
    output_contract: binding.output_contract,
    output: structuredClone(output),
    created_at: "2026-08-21T00:00:00.000Z"
  };
}

function acceptsEnabled(binding, evidence) {
  try {
    validateCapabilityEvidenceForBindings([binding], [evidence], {
      enforceRequired: true,
      declaredEvidenceRefs,
      expectedCandidateDigest: CURRENT_CANDIDATE_DIGEST
    });
    return true;
  } catch {
    return false;
  }
}

function acceptsDisabled(evidence) {
  return validateCapabilityEvidence(evidence).valid;
}

function applyGenericDefect(evidence, matrixCase) {
  if (matrixCase.kind === "valid") return;
  if (matrixCase.kind === "missing-required-field") {
    delete evidence.output[matrixCase.required_field];
  } else if (matrixCase.kind === "wrong-version") {
    evidence.capability_version = "999.0.0";
  } else if (matrixCase.kind === "wrong-contract") {
    evidence.output_contract = evidence.output_contract === "engineering-spec-evidence"
      ? "root-cause-evidence"
      : "engineering-spec-evidence";
  } else if (matrixCase.kind === "generic-claim") {
    evidence.claims = ["done"];
  } else if (matrixCase.kind === "undeclared-evidence-ref") {
    evidence.verification_refs = ["artifacts/undeclared-evidence.json"];
  } else if (matrixCase.kind === "contradiction") {
    evidence.claims = ["cache enabled", "not cache enabled"];
  } else if (matrixCase.kind === "stale-candidate") {
    evidence.output.candidate_digest = STALE_CANDIDATE_DIGEST;
  }
}

function applyDomainDefect(evidence) {
  const output = evidence.output;
  const mutations = {
    "engineering-spec": () => { output.acceptance = []; },
    "source-grounding": () => { output.authoritative_sources = []; },
    "architecture-design": () => { output.alternatives = ["single option"]; },
    "systematic-debugging": () => { output.hypotheses = ["single guess"]; },
    "tdd-negative-control": () => {
      output.green_command = "node --test tests/other.test.mjs";
    },
    "incremental-delivery": () => { output.slices = []; },
    "code-review": () => {
      output.findings = [{ severity: "P0", blocking: true }];
      output.merge_posture = "approve";
    },
    "security-audit": () => {
      output.findings = [{ severity: "high", blocking: true }];
      output.merge_posture = "approve";
    },
    "high-risk-review": () => { output.adversarial_cases = []; },
    "test-strategy": () => { output.selected_test_groups = []; },
    "documentation-sync": () => {
      output.updated_docs = [];
      output.intentionally_unchanged = [];
    },
    "frontend-design": () => { output.acceptance = []; },
    "design-to-code": () => { output.component_map = {}; },
    "browser-qa": () => { output.screenshots = []; },
    "mobile-qa": () => { output.cleanup = ""; },
    "performance-validation": () => { output.sample_count = 1; },
    "migration-safety": () => { output.rollback_steps = []; },
    "deploy-release": () => {
      output.candidate_digest = STALE_CANDIDATE_DIGEST;
    },
    "project-audit": () => { output.checks = []; },
    "postmortem": () => { output.control_candidates = []; },
    "simplification": () => { output.consumer_evidence = []; }
  };
  mutations[evidence.capability_id]();
}

function contextMetrics() {
  const usingPath = join(
    repoRoot,
    "workflows",
    "skills",
    "using-apex-forge",
    "SKILL.md"
  );
  const protocolWords = registry.capabilities.map((definition) => ({
    capability_id: definition.capability_id,
    words: wordCount(readFileSync(definition.protocol_path, "utf8"))
  }));
  const publicSkills = readdirSync(
    join(repoRoot, "plugins", "codex", "apex-forge-v2", "skills"),
    { withFileTypes: true }
  ).filter((entry) => entry.isDirectory()).length;
  return {
    using_skill_words: wordCount(readFileSync(usingPath, "utf8")),
    max_protocol_words: Math.max(...protocolWords.map((item) => item.words)),
    protocol_words: protocolWords,
    public_skill_count: publicSkills
  };
}

function contextBudgetGate() {
  try {
    assertCapabilityContextBudget([
      { category: "core" },
      { category: "core" },
      { category: "core" },
      { category: "conditional" },
      { category: "conditional" }
    ]);
    try {
      assertCapabilityContextBudget([
        { category: "conditional" },
        { category: "conditional" },
        { category: "conditional" }
      ]);
      return false;
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

function wordCount(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function treeHash(directory) {
  const hash = createHash("sha256");
  for (const file of listFiles(directory)) {
    hash.update(relative(directory, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function fileHash(path) {
  return sha256(readFileSync(path));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
