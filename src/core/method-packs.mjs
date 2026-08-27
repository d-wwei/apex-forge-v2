const SUPPORTED_WORKFLOWS = new Set([
  "quick",
  "disciplined",
  "phase_context",
  "governed",
  "governed_v2"
]);

export function defaultMethodPackRegistry(timestamp) {
  return {
    schema_version: "v0",
    updated_at: timestamp,
    default_pack_id: "disciplined-tdd",
    packs: [
      methodPack(
        "quick",
        "1.0.0",
        "Low-overhead implementation and review for bounded low-risk changes.",
        "quick",
        ["focused_verification", "semantic_review"]
      ),
      methodPack(
        "disciplined-tdd",
        "1.0.0",
        "Default test-first delivery with design, implementation, independent verification, and review.",
        "disciplined",
        ["test_first", "independent_verification", "semantic_review"]
      ),
      methodPack(
        "phase-context",
        "1.0.0",
        "Phase-scoped context and delivery for explicit milestone-oriented work.",
        "phase_context",
        ["phase_context", "independent_verification", "semantic_review"]
      ),
      methodPack(
        "governed",
        "2.0.0",
        "Three-barrier governed workflow with Agent judgment and Kernel-owned gates.",
        "governed_v2",
        ["conditional_risk", "candidate_verification", "semantic_review"]
      ),
      methodPack(
        "governed-v1",
        "1.0.0",
        "Legacy seven-node governed workflow for persisted run compatibility.",
        "governed",
        ["independent_risk", "separated_build", "independent_verification", "semantic_review"]
      )
    ]
  };
}

export function resolveMethodPack(registry, intake, inventory = { files: [] }) {
  assertRegistry(registry);
  const enabled = registry.packs.filter((pack) => pack.enabled !== false);
  const explicitId = String(intake.method_pack_id || "").trim();
  if (explicitId) {
    const pack = enabled.find((candidate) => candidate.id === explicitId);
    if (!pack) throw new Error(`找不到 Method Pack：${explicitId}`);
    assertSupportedWorkflow(pack);
    return { pack, reason: `explicit=${explicitId}` };
  }

  const governed = enabled.find((pack) => pack.id === "governed");
  if (requiresGovernedPack(intake)) {
    if (!governed) throw new Error("Method Pack registry 缺少 governed pack");
    return { pack: governed, reason: governedReason(intake) };
  }

  const quick = enabled.find((pack) => pack.id === "quick");
  if (quick && isQuickEligible(intake, inventory)) {
    return { pack: quick, reason: "bounded_low_risk_change" };
  }

  const fallback = enabled.find((pack) => pack.id === registry.default_pack_id);
  if (!fallback) throw new Error(`默认 Method Pack 不可用：${registry.default_pack_id}`);
  assertSupportedWorkflow(fallback);
  return { pack: fallback, reason: `default=${fallback.id}` };
}

function methodPack(id, version, description, workflow, qualityGates) {
  return {
    id,
    version,
    description,
    workflow,
    enabled: true,
    quality_gates: qualityGates
  };
}

function assertRegistry(registry) {
  if (!registry || !Array.isArray(registry.packs) || !registry.default_pack_id) {
    throw new Error("Method Pack registry 无效");
  }
  const ids = new Set();
  for (const pack of registry.packs) {
    if (!pack?.id || ids.has(pack.id)) throw new Error(`Method Pack id 无效或重复：${pack?.id || "(空)"}`);
    ids.add(pack.id);
    assertSupportedWorkflow(pack);
  }
}

function assertSupportedWorkflow(pack) {
  if (!SUPPORTED_WORKFLOWS.has(pack.workflow)) {
    throw new Error(`Method Pack workflow 不受支持：${pack.id}=${pack.workflow}`);
  }
}

function requiresGovernedPack(intake) {
  if (intake.risk === "critical") return true;
  if (intake.type === "risk" && intake.risk === "high") return true;
  return /(irreversible|destructive production|production destructive|funds?|trading|payment|auth(?:entication|orization)? protocol|permission protocol|multi[- ]repo(?:sitory)? write|long[- ]running recovery|interrupted resume|resume after interruption|separation of duties|不可逆|生产破坏|资金|交易|支付|鉴权协议|权限协议|多仓库写入|长期恢复|中断后恢复|职责分离)/i
    .test(`${intake.title || ""}\n${intake.description || ""}`);
}

function governedReason(intake) {
  if (intake.risk === "critical") return "risk=critical";
  return "governance_signal";
}

function isQuickEligible(intake, inventory) {
  if (!["low", "medium"].includes(intake.risk || "medium")) return false;
  if (intake.triage?.status !== "accepted") return false;
  const scopes = parseAffectedArea(intake.affected_area, inventory.files || [])
    .filter((scope) => !scope.startsWith(".apex-v2/"));
  if (scopes.length === 0 || scopes.length > 4) return false;
  if (scopes.some((scope) => scope.endsWith("/") || scope.includes("*"))) return false;
  return !/(parallel|interrupted|resume|recovery|review[- ]defect|security defect|two independent|并行|中断|恢复|安全缺陷)/i
    .test(`${intake.title || ""}\n${intake.description || ""}`);
}

function parseAffectedArea(value, files) {
  const raw = String(value || "").trim();
  if (!raw || ["unknown", "n/a", "none"].includes(raw.toLowerCase())) return [];
  const available = new Set(files);
  return Array.from(new Set(raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).map((item) => {
    if (item.includes("*") || item.endsWith("/")) return item;
    if (available.has(item)) return item;
    if (files.some((file) => file.startsWith(`${item}/`))) return `${item}/`;
    return item;
  })));
}
