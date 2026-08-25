import { join } from "node:path";
import { bullet, readJson, shortId } from "../lib/common.mjs";
import {
  assertCapabilityContextBudget,
  capabilityRegistry,
  routeCapabilities
} from "./capability-registry.mjs";
import { defaultMethodPackRegistry, resolveMethodPack } from "./method-packs.mjs";
import { SCHEMA_VERSION } from "./store.mjs";

export function buildTaskPlanGraph(root, run, timestamp, inventory) {
  const project = readJson(join(root, "project.json"));
  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  if (!roadmapNode) throw new Error(`找不到 run 对应的 roadmap node：${run.roadmap_node_id}`);

  const intakeItems = readJson(join(root, "intake", "items.json"), []);
  const intake = intakeItems.find((item) => item.id === roadmapNode.source_intake_id);
  if (!intake) throw new Error(`找不到 roadmap 对应的 intake：${roadmapNode.source_intake_id}`);
  const methodPackRegistry = readJson(
    join(root, "policies", "method-packs.json"),
    defaultMethodPackRegistry(timestamp)
  );
  const methodPackResolution = resolveMethodPack(methodPackRegistry, intake, inventory);
  let methodPack = methodPackResolution.pack;
  let methodPackSelectionReason = methodPackResolution.reason;
  const routedCapabilities = routeCapabilities(capabilityRegistry(), intake);

  const planId = shortId("plan");
  const scopes = inferPlanScopes(intake, inventory);
  const verificationCommands = inferVerificationCommands(inventory);
  const declaredVerificationCommands = extractDeclaredVerificationCommands(intake);
  const taskVerificationCommands = declaredVerificationCommands.length > 0
    ? declaredVerificationCommands.slice(0, 5)
    : verificationCommands;
  const runArtifactScope = `.apex-v2/runs/${run.run_id}/workers/`;
  const contextRefs = unique([
    `.apex-v2/intake/items.json`,
    `.apex-v2/roadmap/graph.json`,
    `.apex-v2/runs/${run.run_id}/plan-graph.json`,
    ".apex-v2/knowledge/index.md",
    ".apex-v2/knowledge/task-to-file-map.md",
    ".apex-v2/knowledge/danger-zones.md",
    ".apex-v2/knowledge/test-map.md",
    ...intake.evidence_refs,
    ...scopes.implementation,
    ...scopes.tests
  ]);
  const fullNodes = [
    planNode({
      id: "delivery-context",
      title: "任务上下文与验收边界",
      lane: "analysis",
      parallelGroup: "discovery",
      objective: `围绕“${roadmapNode.title}”核对需求边界、受影响模块、已有决策和可执行验收标准。`,
      dependencies: [],
      readScope: contextRefs,
      writeScope: [],
      deliverables: ["任务上下文摘要", "验收标准", "已知与未知项"],
      requiredEvidence: ["intake 与 roadmap 引用", "相关代码或文档来源", "可验证验收标准"],
      verification: taskVerificationCommands.slice(0, 1),
      mergeStrategy: "只产出 evidence，不直接修改项目代码。",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "medium")
    }),
    planNode({
      id: "delivery-risk",
      title: "风险、回归面与反证分析",
      lane: "analysis",
      parallelGroup: "discovery",
      objective: `独立检查“${roadmapNode.title}”的失败模式、回归面、冲突风险和需要升级的人类 gate。`,
      dependencies: [],
      readScope: contextRefs,
      writeScope: [],
      deliverables: ["风险清单", "反证与替代方案", "回归检查范围"],
      requiredEvidence: ["danger-zone 引用", "失败路径", "风险处置建议"],
      verification: taskVerificationCommands.slice(0, 1),
      mergeStrategy: "与 context 分析并行，输出独立 evidence card。",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "medium")
    }),
    planNode({
      id: "delivery-design",
      title: "任务级实施方案与切片",
      lane: "planning",
      parallelGroup: "planning",
      objective: `基于上下文和风险证据，为“${roadmapNode.title}”形成最小可交付切片、依赖顺序和回滚策略。`,
      dependencies: ["delivery-context", "delivery-risk"],
      readScope: contextRefs,
      writeScope: [],
      deliverables: ["实施切片", "依赖与并行策略", "回滚方案"],
      requiredEvidence: ["上下文 evidence", "风险 evidence", "每个切片的验证路径"],
      verification: taskVerificationCommands.slice(0, 2),
      mergeStrategy: "方案先于代码写入；发现范围冲突时返回 planning。",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "high")
    }),
    planNode({
      id: "delivery-implementation",
      title: "主实现切片",
      lane: "implementation",
      parallelGroup: "build",
      objective: `在明确 write_scope 内实现“${roadmapNode.title}”的最小行为变化，避免无关重构。`,
      dependencies: ["delivery-design"],
      readScope: unique([...contextRefs, ...scopes.implementation]),
      writeScope: scopes.implementation,
      deliverables: ["可审查 patch bundle", "行为变化说明", "残余风险"],
      requiredEvidence: ["changed_files", "patch artifact", "局部验证结果"],
      verification: taskVerificationCommands,
      mergeStrategy: "worker 只提交 patch bundle；由 coordinator 串行合并。",
      executionClass: "workspace_patch",
      requiredCapabilities: ["structured_output", "workspace_write", "tool_use"],
      preferredMode: "interactive",
      executionHints: { estimated_duration_minutes: 20 },
      outputContract: "patch",
      risk: normalizedRisk(intake.risk, "high")
    }),
    planNode({
      id: "delivery-tests",
      title: "测试与失败路径切片",
      lane: "quality",
      parallelGroup: "build",
      objective: `为“${roadmapNode.title}”补充成功路径、失败路径和关键回归测试，并保持与主实现写入范围隔离。`,
      dependencies: ["delivery-design"],
      readScope: unique([...contextRefs, ...scopes.implementation, ...scopes.tests]),
      writeScope: scopes.tests,
      deliverables: ["自动化测试 patch", "失败路径证明", "覆盖范围说明"],
      requiredEvidence: ["新增或更新测试", "测试命令输出", "失败路径断言"],
      verification: taskVerificationCommands,
      mergeStrategy: "可与主实现并行；write_scope 重叠时必须拆分或串行。",
      executionClass: "workspace_patch",
      requiredCapabilities: ["structured_output", "workspace_write", "tool_use"],
      preferredMode: "interactive",
      executionHints: { estimated_duration_minutes: 20 },
      outputContract: "patch",
      risk: normalizedRisk(intake.risk, "medium")
    }),
    planNode({
      id: "delivery-verification",
      title: "独立验证与证据汇总",
      lane: "verification",
      parallelGroup: "verification",
      objective: `按项目真实命令验证“${roadmapNode.title}”的实现和测试，记录覆盖范围、失败日志及跳过项。`,
      dependencies: ["delivery-implementation", "delivery-tests"],
      readScope: unique([...scopes.implementation, ...scopes.tests, "package.json"]),
      writeScope: [`${runArtifactScope}verification/`],
      deliverables: ["verification report", "命令输出证据", "残余风险"],
      requiredEvidence: ["命令 exit code", "输出尾部", "覆盖与跳过说明"],
      verification: taskVerificationCommands,
      mergeStrategy: "验证节点只汇总证据，不替代 implementation patch。",
      adapter: "shell",
      executionClass: "deterministic_check",
      requiredCapabilities: [],
      preferredMode: "deterministic",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "high")
    }),
    planNode({
      id: "delivery-review",
      title: "交付就绪与阻塞项修复",
      lane: "review",
      parallelGroup: "readiness",
      objective: `复核“${roadmapNode.title}”是否满足需求、证据和回滚要求；只允许修复明确的阻塞项。`,
      dependencies: ["delivery-verification"],
      readScope: unique([...contextRefs, ...scopes.implementation, ...scopes.tests]),
      writeScope: scopes.implementation,
      deliverables: ["review findings", "阻塞项修复 patch 或 PASS 决策", "merge posture"],
      requiredEvidence: ["需求符合性", "blocking findings", "merge posture"],
      verification: taskVerificationCommands,
      mergeStrategy: "只处理 review 阻塞项；新增范围必须返回 intake 或 replan。",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "high")
    })
  ];

  const quickNodes = buildQuickPlanNodes({
    roadmapNode,
    intake,
    scopes,
    verificationCommands: taskVerificationCommands,
    contextRefs,
    runArtifactScope
  });
  const availableNodes = {
    quickNodes,
    fullNodes,
    roadmapNode,
    scopes
  };
  let capabilityApplication;
  try {
    capabilityApplication = bindMethodPackCapabilities(
      methodPack,
      availableNodes,
      routedCapabilities
    );
  } catch (error) {
    if (
      methodPack.workflow !== "quick"
      || !isCapabilityPlanEscalationError(error)
    ) {
      throw error;
    }
    const governed = methodPackRegistry.packs.find((pack) =>
      pack.enabled !== false && pack.workflow === "governed"
    );
    if (!governed) {
      throw new Error(
        `${error.message}；Quick 自动升级失败：Method Pack registry 缺少 governed pack`
      );
    }
    methodPack = governed;
    methodPackSelectionReason = [
      `auto_escalated_from=${methodPackResolution.pack.id}`,
      error.message
    ].join("; ");
    capabilityApplication = bindMethodPackCapabilities(
      methodPack,
      availableNodes,
      routedCapabilities
    );
  }
  const profile = methodPack.workflow === "quick" ? "quick" : "full";
  const nodes = capabilityApplication.nodes.map((node) =>
    withThroughputMetadata(node, methodPack.workflow)
  );
  const barriers = buildExecutionBarriers(methodPack.workflow, nodes);
  const parallelLanes = buildParallelLanes(methodPack.workflow);
  const mergeOrder = parallelLanes.map((lane) => lane.id);
  const edges = nodes.flatMap((node) =>
    node.dependencies.map((dependency) => edge(dependency, node.id, node.id === "delivery-verification" ? "verifies" : "blocks"))
  );

  return {
    schema_version: SCHEMA_VERSION,
    plan_id: planId,
    run_id: run.run_id,
    roadmap_node_id: run.roadmap_node_id,
    source_intake_id: intake.id,
    source_intake_type: intake.type,
    source_title: roadmapNode.title,
    affected_area: intake.affected_area,
    generated_at: timestamp,
    profile,
    execution_model: "barrier-v1",
    barriers,
    method_pack: {
      id: methodPack.id,
      version: methodPack.version,
      workflow: methodPack.workflow,
      selection_reason: methodPackSelectionReason,
      quality_gates: methodPack.quality_gates
    },
    capability_plan: capabilityApplication.capability_plan,
    strategy: strategyForMethodPack(methodPack, intake, roadmapNode.title),
    planning_basis: [
      `.apex-v2/intake/items.json#${intake.id}`,
      `.apex-v2/roadmap/graph.json#${roadmapNode.id}`,
      `.apex-v2/policies/method-packs.json#${methodPack.id}`,
      `capabilities/registry.json@${routedCapabilities.registry_version}`,
      `.apex-v2/knowledge/manifest.json@${run.context_snapshot.knowledge_version}`,
      ...intake.evidence_refs
    ],
    quality_bar: [
      "每个节点只有一个 primary objective，并声明读写范围、证据和验证路径。",
      "同一 parallel_group 的 write_scope 必须互斥；重叠时禁止并行。",
      "所有 PASS 必须引用当前 run 的 artifact evidence。",
      "实现保持最小切片，禁止把无关重构混入交付。",
      "Method Pack 可以减少机械节点，但不能移除 verification、review 或 candidate binding。",
      "Required Capability 必须产出对应 typed evidence，不能以普通 summary 替代。",
      "只有全部 PlanGraph 节点完成后，execute 才能 PASS。"
    ],
    nodes,
    edges,
    parallel_lanes: parallelLanes,
    merge_policy: {
      coordinator_required: true,
      worker_output: "patch_bundle_and_artifacts_only",
      direct_worker_write_to_derived: false,
      merge_order: mergeOrder
    },
    conflict_policy: {
      detect_by: ["write_scope_overlap", "same_file_patch", "same_text_patch", "schema_version_change"],
      same_parallel_group_write_overlap: "block_or_split",
      resolution: "coordinator_serial_merge_with_conflict_report",
      human_gate_when: ["schema_breaking_change", "security_sensitive_change", "unresolved_patch_conflict"]
    },
    verification_policy: {
      required_commands: taskVerificationCommands,
      schema_check: declaredVerificationCommands.length === 0
        && methodPack.workflow !== "quick"
        && inventory.schemaFiles.length > 0
        ? "node src/apex-v2.mjs contracts validate --project ."
        : null,
      evidence_level: "PASS requires command evidence linked to the current run"
    },
    evidence_policy: {
      artifact_required_for_pass: true,
      accepted_artifact_types: ["plan", "evidence", "test", "review", "patch", "decision"],
      source_refs_required: true
    },
    project_knowledge_version: project.knowledge_version,
    project_name: project.project_name
  };
}

function bindMethodPackCapabilities(methodPack, availableNodes, routedCapabilities) {
  const selectedNodes = selectMethodPackNodes(
    methodPack.workflow,
    availableNodes
  ).map((node) => ({
    ...node,
    method_pack_id: methodPack.id
  }));
  return applyCapabilityBindings(selectedNodes, routedCapabilities);
}

function isCapabilityPlanEscalationError(error) {
  return /Capability (?:context budget exceeded|execution class unavailable)/i
    .test(String(error?.message || error));
}

export function applyCapabilityBindings(nodes, routedCapabilities) {
  const nextNodes = nodes.map((node) => ({
    ...node,
    required_evidence: [...(node.required_evidence || [])],
    capability_bindings: [],
    capability_enforcement: routedCapabilities.enforcement_mode
  }));
  const selected = [
    ...(routedCapabilities.required || []),
    ...(routedCapabilities.optional || []),
    ...(routedCapabilities.advisory || [])
  ];
  for (const capability of selected) {
    const node = selectCapabilityNode(capability, nextNodes);
    if (!node) {
      throw new Error(
        `Capability 无可用 PlanGraph 节点：${capability.capability_id} -> ${capability.target_node_id}`
      );
    }
    node.capability_bindings.push(persistedCapabilityBinding({
      ...capability,
      target_node_id: node.id
    }));
    node.required_capabilities = unique([
      ...(node.required_capabilities || []),
      ...(capability.required_host_capabilities || [])
    ]);
    if (capability.required) {
      node.required_evidence.push(
        `capability:${capability.capability_id}:${capability.output_contract}`
      );
    }
  }
  for (const node of nextNodes) {
    node.capability_bindings.sort((left, right) =>
      right.priority - left.priority
      || left.capability_id.localeCompare(right.capability_id)
    );
    assertCapabilityContextBudget(node.capability_bindings);
    node.required_evidence = unique(node.required_evidence);
  }
  return {
    nodes: nextNodes,
    capability_plan: {
      registry_version: routedCapabilities.registry_version,
      enforcement_mode: routedCapabilities.enforcement_mode,
      router_mode: routedCapabilities.router_mode || "enabled",
      required: (routedCapabilities.required || []).map(persistedCapabilityBinding),
      optional: (routedCapabilities.optional || []).map(persistedCapabilityBinding),
      advisory: (routedCapabilities.advisory || []).map(persistedCapabilityBinding)
    }
  };
}

function selectCapabilityNode(capability, nodes) {
  const targetId = resolveCapabilityTarget(
    capability.target_node_id,
    nodes
  );
  const targetIndex = nodes.findIndex((node) => node.id === targetId);
  const ordered = [
    ...nodes.slice(targetIndex),
    ...nodes.slice(0, targetIndex).reverse()
  ].filter(Boolean);
  const preferredCandidates = capability.execution_class === "deterministic_check"
    ? ordered.filter((node) => node.execution_class === "deterministic_check")
    : capability.execution_class === "workspace_patch"
      ? ordered.filter((node) => node.execution_class === "workspace_patch")
      : ordered;
  const candidates = preferredCandidates.length > 0
    ? [
        ...preferredCandidates,
        ...ordered.filter((node) => !preferredCandidates.includes(node))
      ]
    : ordered;
  for (const node of candidates) {
    try {
      assertCapabilityContextBudget([
        ...(node.capability_bindings || []),
        capability
      ]);
      return node;
    } catch {}
  }
  throw new Error(
    `Capability context budget exceeded：${capability.capability_id} `
    + `无法在 ${candidates.map((node) => node.id).join(",")} 中拆分；必须 replan`
  );
}

function persistedCapabilityBinding(capability) {
  return {
    capability_id: capability.capability_id,
    capability_version: capability.capability_version,
    category: capability.category,
    mode: capability.mode,
    required: capability.required,
    priority: capability.priority,
    target_node_id: capability.target_node_id,
    execution_class: capability.execution_class,
    required_host_capabilities: capability.required_host_capabilities,
    input_contract: capability.input_contract,
    output_contract: capability.output_contract,
    protocol_ref: capability.protocol_ref,
    availability: capability.availability,
    certification: capability.certification
  };
}

function resolveCapabilityTarget(targetNodeId, nodes) {
  if (nodes.some((node) => node.id === targetNodeId)) return targetNodeId;
  if (
    ["delivery-context", "delivery-risk", "delivery-design", "delivery-verification"]
      .includes(targetNodeId)
    && nodes.some((node) => node.id === "delivery-implementation")
  ) {
    return "delivery-implementation";
  }
  if (nodes.some((node) => node.id === "delivery-review")) {
    return "delivery-review";
  }
  return nodes[0]?.id || null;
}

function buildExecutionBarriers(workflow, nodes) {
  const groups = workflow === "quick"
    ? [
        ["delivery-candidate", []],
        ["delivery-readiness", ["delivery-candidate"]]
      ]
    : [
        ["delivery-plan", []],
        ["delivery-candidate", ["delivery-plan"]],
        ["delivery-readiness", ["delivery-candidate"]]
      ];
  return groups.map(([id, dependencies]) => ({
    id,
    dependencies,
    node_ids: nodes
      .filter((node) => node.barrier_id === id)
      .map((node) => node.id)
  })).filter((barrier) => barrier.node_ids.length > 0);
}

function withThroughputMetadata(node, workflow) {
  const barrierId = barrierForNode(node.id);
  const modelTier = modelTierForNode(node, workflow);
  const mainAgentRequired = node.id === "delivery-design"
    || (node.id === "delivery-review" && modelTier === "strong");
  const delegatedByDefault = delegationDefaultForNode(node, workflow)
    && !mainAgentRequired;
  return {
    ...node,
    barrier_id: barrierId,
    dispatch_kind: node.execution_class === "deterministic_check"
      ? "kernel"
      : delegatedByDefault
        ? "subagent"
        : "coordinator",
    model_tier: modelTier,
    fallback_model_tier: fallbackModelTier(modelTier),
    delegation: {
      eligible: ["cognitive", "workspace_patch"].includes(node.execution_class),
      default: delegatedByDefault,
      parallel: delegatedByDefault
        && ["delivery-plan", "delivery-candidate"].includes(barrierId),
      main_agent_required: mainAgentRequired
    }
  };
}

function barrierForNode(nodeId) {
  if (["delivery-context", "delivery-risk", "delivery-design"].includes(nodeId)) {
    return "delivery-plan";
  }
  if (
    [
      "delivery-implementation",
      "delivery-tests",
      "delivery-verification"
    ].includes(nodeId)
  ) {
    return "delivery-candidate";
  }
  return "delivery-readiness";
}

function modelTierForNode(node, workflow) {
  if (node.execution_class === "deterministic_check") return "deterministic";
  const strongCapabilities = new Set([
    "security-audit",
    "migration-safety",
    "high-risk-review",
    "deploy-release"
  ]);
  if (
    node.risk === "critical"
    || (node.capability_bindings || []).some((binding) =>
      strongCapabilities.has(binding.capability_id)
    )
    || (workflow === "governed" && node.id === "delivery-review")
  ) {
    return "strong";
  }
  if (["delivery-context", "delivery-risk", "delivery-tests"].includes(node.id)) {
    return "cheap";
  }
  if (node.id === "delivery-review") return "cheap";
  return "standard";
}

function delegationDefaultForNode(node, workflow) {
  if (workflow === "quick") return false;
  return [
    "delivery-context",
    "delivery-risk",
    "delivery-implementation",
    "delivery-tests",
    "delivery-review"
  ].includes(node.id);
}

function fallbackModelTier(modelTier) {
  if (modelTier === "cheap") return "standard";
  if (modelTier === "standard") return "strong";
  return null;
}

function buildParallelLanes(workflow) {
  if (workflow === "quick") {
    return [
      { id: "build", purpose: "单一 ActionWorkspace 同时完成实现与测试，减少简单任务往返。", node_ids: ["delivery-implementation"] },
      { id: "readiness", purpose: "复核需求符合性与 merge posture。", node_ids: ["delivery-review"] }
    ];
  }
  if (workflow === "disciplined") {
    return [
      { id: "planning", purpose: "在一个设计节点内汇总上下文、风险和测试切片。", node_ids: ["delivery-design"] },
      { id: "build", purpose: "单一 ActionWorkspace 按 TDD 完成实现与测试。", node_ids: ["delivery-implementation"] },
      { id: "verification", purpose: "独立执行真实项目验证并固化证据。", node_ids: ["delivery-verification"] },
      { id: "readiness", purpose: "复核需求符合性与 merge posture。", node_ids: ["delivery-review"] }
    ];
  }
  if (workflow === "phase_context") {
    return [
      { id: "discovery", purpose: "为当前 phase 固化最小上下文和验收边界。", node_ids: ["delivery-context"] },
      { id: "planning", purpose: "基于 phase context 形成实施与回滚切片。", node_ids: ["delivery-design"] },
      { id: "build", purpose: "单一 ActionWorkspace 按计划完成实现与测试。", node_ids: ["delivery-implementation"] },
      { id: "verification", purpose: "独立执行真实项目验证并固化证据。", node_ids: ["delivery-verification"] },
      { id: "readiness", purpose: "复核需求符合性与 merge posture。", node_ids: ["delivery-review"] }
    ];
  }
  return [
        { id: "discovery", purpose: "并行核对上下文与风险，避免单一路径自证。", node_ids: ["delivery-context", "delivery-risk"] },
        { id: "planning", purpose: "汇总证据并形成任务级实施切片。", node_ids: ["delivery-design"] },
        { id: "build", purpose: "主实现与测试在写入范围互斥时并行。", node_ids: ["delivery-implementation", "delivery-tests"] },
        { id: "verification", purpose: "独立执行真实项目验证并固化证据。", node_ids: ["delivery-verification"] },
        { id: "readiness", purpose: "复核需求符合性并只修复明确阻塞项。", node_ids: ["delivery-review"] }
  ];
}

function selectMethodPackNodes(workflow, input) {
  if (workflow === "quick") return input.quickNodes;
  if (workflow === "governed") return input.fullNodes;
  const context = clonePlanNode(input.fullNodes, "delivery-context");
  const design = clonePlanNode(input.fullNodes, "delivery-design");
  const implementation = clonePlanNode(input.fullNodes, "delivery-implementation");
  const verification = clonePlanNode(input.fullNodes, "delivery-verification");
  const review = clonePlanNode(input.fullNodes, "delivery-review");

  design.dependencies = workflow === "phase_context" ? ["delivery-context"] : [];
  design.objective = workflow === "phase_context"
    ? `基于当前 phase context，为“${input.roadmapNode.title}”形成最小可交付切片、测试策略和回滚方案。`
    : `在单一设计节点内核对“${input.roadmapNode.title}”的上下文、风险、最小切片、测试策略和回滚方案。`;
  implementation.title = "测试先行的实现切片";
  implementation.dependencies = ["delivery-design"];
  implementation.write_scope = unique([
    ...input.scopes.implementation,
    ...input.scopes.tests
  ]);
  implementation.deliverables = [
    "实现与测试 patch bundle",
    "失败路径与公开验收结果",
    "残余风险"
  ];
  implementation.required_evidence = [
    "changed_files",
    "patch artifact",
    "测试命令输出"
  ];
  implementation.objective = `在一个隔离 ActionWorkspace 内按测试先行方式完成“${input.roadmapNode.title}”的最小实现与回归测试。`;
  verification.dependencies = ["delivery-implementation"];
  review.dependencies = ["delivery-verification"];
  return workflow === "phase_context"
    ? [context, design, implementation, verification, review]
    : [design, implementation, verification, review];
}

function clonePlanNode(nodes, id) {
  const node = nodes.find((candidate) => candidate.id === id);
  return {
    ...node,
    dependencies: [...node.dependencies],
    read_scope: [...node.read_scope],
    write_scope: [...node.write_scope],
    deliverables: [...node.deliverables],
    required_evidence: [...node.required_evidence],
    verification: [...node.verification],
    required_capabilities: [...node.required_capabilities],
    execution_hints: { ...node.execution_hints }
  };
}

function strategyForMethodPack(pack, intake, title) {
  if (pack.workflow === "quick") {
    return `针对“${title}”使用 quick Method Pack：单一隔离 patch 同时完成实现与测试，再做独立语义评审。`;
  }
  if (pack.workflow === "disciplined") {
    return `针对“${title}”使用 disciplined-tdd Method Pack：合并重复上下文往返，保留设计、测试先行实现、独立验证和评审。`;
  }
  if (pack.workflow === "phase_context") {
    return `针对“${title}”使用 phase-context Method Pack：只加载当前阶段上下文，再完成设计、实现、验证和评审。`;
  }
  return strategyForIntake(intake, title);
}

export function validatePlanGraph(plan) {
  const errors = [];
  const ids = new Set();
  const lanes = new Map((plan.parallel_lanes || []).map((lane) => [lane.id, lane]));
  const laneMembership = new Map();
  const barriers = new Map((plan.barriers || []).map((barrier) => [
    barrier.id,
    barrier
  ]));
  const barrierMembership = new Map();

  const minimumNodes = {
    quick: 2,
    disciplined: 4,
    phase_context: 5,
    governed: 7
  }[plan.method_pack?.workflow] || (plan.profile === "quick" ? 2 : 5);
  if (!Array.isArray(plan.nodes) || plan.nodes.length < minimumNodes) {
    errors.push(`plan graph 至少需要 ${minimumNodes} 个节点`);
    return validationResult(plan, errors);
  }

  for (const node of plan.nodes) {
    if (ids.has(node.id)) errors.push(`plan node id 重复：${node.id}`);
    ids.add(node.id);
    if (!node.objective) errors.push(`${node.id} 缺少 objective`);
    if (
      !Array.isArray(node.write_scope)
      || (node.execution_class !== "cognitive" && node.write_scope.length === 0)
    ) {
      errors.push(`${node.id} 缺少 write_scope`);
    }
    if (!Array.isArray(node.required_evidence) || node.required_evidence.length === 0) errors.push(`${node.id} 缺少 required_evidence`);
    if (!Array.isArray(node.verification) || node.verification.length === 0) errors.push(`${node.id} 缺少 verification`);
    if (node.adapter != null && (typeof node.adapter !== "string" || !node.adapter)) errors.push(`${node.id} 的 adapter 无效：${node.adapter}`);
    if (node.execution_class != null && !["cognitive", "workspace_patch", "deterministic_check", "human_decision"].includes(node.execution_class)) {
      errors.push(`${node.id} 的 execution_class 无效：${node.execution_class}`);
    }
    if (node.preferred_mode != null && !["interactive", "factory", "deterministic", "human"].includes(node.preferred_mode)) {
      errors.push(`${node.id} 的 preferred_mode 无效：${node.preferred_mode}`);
    }
    if (node.required_capabilities != null && !Array.isArray(node.required_capabilities)) {
      errors.push(`${node.id} 的 required_capabilities 必须是数组`);
    }
    if (plan.method_pack && node.method_pack_id !== plan.method_pack.id) {
      errors.push(`${node.id} 的 method_pack_id 与 plan 不一致`);
    }
    if (plan.execution_model === "barrier-v1") {
      if (!node.barrier_id || !barriers.has(node.barrier_id)) {
        errors.push(`${node.id} 的 barrier_id 无效：${node.barrier_id || "(空)"}`);
      }
      if (!node.model_tier) errors.push(`${node.id} 缺少 model_tier`);
      if (!node.delegation) errors.push(`${node.id} 缺少 delegation`);
    }
    const capabilityIds = new Set();
    for (const capability of node.capability_bindings || []) {
      if (capabilityIds.has(capability.capability_id)) {
        errors.push(`${node.id} 的 capability 重复：${capability.capability_id}`);
      }
      capabilityIds.add(capability.capability_id);
      if (
        capability.required
        && !node.required_evidence.includes(
          `capability:${capability.capability_id}:${capability.output_contract}`
        )
      ) {
        errors.push(`${node.id} 缺少 required capability evidence：${capability.capability_id}`);
      }
    }
    if (node.output_contract != null && !["evidence", "patch", "decision"].includes(node.output_contract)) errors.push(`${node.id} 的 output_contract 无效：${node.output_contract}`);
    if (!lanes.has(node.parallel_group)) errors.push(`${node.id} 的 parallel_group 未在 parallel_lanes 中声明：${node.parallel_group}`);
  }

  for (const node of plan.nodes) {
    for (const dependency of node.dependencies || []) {
      if (!ids.has(dependency)) errors.push(`${node.id} 依赖不存在：${dependency}`);
      if (dependency === node.id) errors.push(`${node.id} 不能依赖自身`);
    }
  }

  for (const edgeItem of plan.edges || []) {
    if (!ids.has(edgeItem.from)) errors.push(`edge.from 不存在：${edgeItem.from}`);
    if (!ids.has(edgeItem.to)) errors.push(`edge.to 不存在：${edgeItem.to}`);
  }

  for (const lane of plan.parallel_lanes || []) {
    for (const nodeId of lane.node_ids) {
      if (!ids.has(nodeId)) {
        errors.push(`lane ${lane.id} 引用不存在节点：${nodeId}`);
        continue;
      }
      laneMembership.set(nodeId, (laneMembership.get(nodeId) || 0) + 1);
    }
    const laneNodes = plan.nodes.filter((node) => lane.node_ids.includes(node.id));
    for (let left = 0; left < laneNodes.length; left += 1) {
      for (let right = left + 1; right < laneNodes.length; right += 1) {
        for (const leftScope of laneNodes[left].write_scope) {
          for (const rightScope of laneNodes[right].write_scope) {
            if (scopesOverlap(leftScope, rightScope)) {
              errors.push(`parallel lane ${lane.id} 存在 write_scope 冲突：${leftScope} 与 ${rightScope}`);
            }
          }
        }
      }
    }
  }

  for (const node of plan.nodes) {
    const membership = laneMembership.get(node.id) || 0;
    if (membership !== 1) errors.push(`${node.id} 必须且只能属于一个 parallel lane，当前 ${membership}`);
  }

  if (plan.execution_model === "barrier-v1") {
    for (const barrier of plan.barriers || []) {
      for (const dependency of barrier.dependencies || []) {
        if (!barriers.has(dependency)) {
          errors.push(`barrier ${barrier.id} 依赖不存在：${dependency}`);
        }
        if (dependency === barrier.id) {
          errors.push(`barrier ${barrier.id} 不能依赖自身`);
        }
      }
      for (const nodeId of barrier.node_ids || []) {
        if (!ids.has(nodeId)) {
          errors.push(`barrier ${barrier.id} 引用不存在节点：${nodeId}`);
          continue;
        }
        barrierMembership.set(
          nodeId,
          (barrierMembership.get(nodeId) || 0) + 1
        );
      }
    }
    for (const node of plan.nodes) {
      const membership = barrierMembership.get(node.id) || 0;
      if (membership !== 1) {
        errors.push(`${node.id} 必须且只能属于一个 barrier，当前 ${membership}`);
      }
      if (
        node.barrier_id
        && !barriers.get(node.barrier_id)?.node_ids.includes(node.id)
      ) {
        errors.push(`${node.id} 未登记在 barrier ${node.barrier_id}`);
      }
    }
  }

  errors.push(...findDependencyCycles(plan.nodes));
  return validationResult(plan, errors);
}

function buildQuickPlanNodes({
  roadmapNode,
  intake,
  scopes,
  verificationCommands,
  contextRefs,
  runArtifactScope
}) {
  const writeScope = unique([...scopes.implementation, ...scopes.tests]);
  return [
    planNode({
      id: "delivery-implementation",
      title: "快速实现与测试切片",
      lane: "implementation",
      parallelGroup: "build",
      objective: `在单一 ActionWorkspace 内完成“${roadmapNode.title}”的最小实现、聚焦测试和公开验收命令。`,
      dependencies: [],
      readScope: unique([...contextRefs, ...writeScope]),
      writeScope,
      deliverables: ["实现与测试 patch bundle", "公开验收结果", "残余风险"],
      requiredEvidence: ["changed_files", "patch artifact", "测试命令输出"],
      verification: verificationCommands,
      mergeStrategy: "简单任务只允许一个隔离 patch，避免实现与测试双 worker 往返。",
      executionClass: "workspace_patch",
      requiredCapabilities: ["structured_output", "workspace_write", "tool_use"],
      preferredMode: "interactive",
      executionHints: { estimated_duration_minutes: 8 },
      outputContract: "patch",
      risk: normalizedRisk(intake.risk, "medium")
    }),
    planNode({
      id: "delivery-review",
      title: "快速语义评审",
      lane: "review",
      parallelGroup: "readiness",
      objective: `复核“${roadmapNode.title}”的需求映射、ActionWorkspace 验收证据与 merge posture。`,
      dependencies: ["delivery-implementation"],
      readScope: unique([...contextRefs, ...writeScope]),
      writeScope: scopes.implementation,
      deliverables: ["review findings", "residual risks", "merge posture"],
      requiredEvidence: ["需求符合性", "ActionWorkspace public acceptance", "merge posture"],
      verification: verificationCommands,
      mergeStrategy: "只允许修复明确阻塞项；新增范围返回 full route。",
      executionClass: "cognitive",
      requiredCapabilities: ["structured_output"],
      preferredMode: "interactive",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "medium")
    })
  ];
}

export function inferQuickVerificationCommands(intake, fallbackCommands) {
  const selected = extractDeclaredVerificationCommands(intake);
  return selected.length > 0 ? selected.slice(0, 5) : fallbackCommands;
}

export function extractDeclaredVerificationCommands(intake) {
  const typed = (intake.acceptance_commands || [])
    .map((value) => String(value).trim())
    .filter(isVerificationCommand);
  const refs = (intake.evidence_refs || [])
    .map((value) => String(value).trim())
    .filter(isVerificationCommand);
  if (typed.length > 0) return unique([...typed, ...refs]);
  const description = String(intake.description || "");
  const declared = description.match(
    /public acceptance(?: command)?s?\s*:\s*([^\n]+)/i
  )?.[1]
    ?.split(/\s*;\s*/)
    .map((value) => value.trim())
    .filter(isVerificationCommand) || [];
  return unique([...refs, ...declared]);
}

function isVerificationCommand(value) {
  return /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*(?:npm|pnpm|yarn|bun|node|npx|pytest|python\s+-m\s+pytest|cargo|go\s+test|make|test\b)/i
    .test(String(value || "").trim());
}

export function renderPlanGraphMarkdown(plan) {
  return `# Plan Graph

plan_id: ${plan.plan_id}
run_id: ${plan.run_id}
roadmap_node_id: ${plan.roadmap_node_id}
source_intake_id: ${plan.source_intake_id || "unknown"}
source_title: ${plan.source_title || "unknown"}
method_pack: ${plan.method_pack?.id || "legacy"}
generated_at: ${plan.generated_at}

## 策略

${plan.strategy}

## Planning Basis

${bullet(plan.planning_basis || [])}

## Quality Bar

${bullet(plan.quality_bar)}

## 并行 Lane

${plan.parallel_lanes.map((lane) => `### ${lane.id}

${lane.purpose}

节点：${lane.node_ids.join(", ")}
`).join("\n")}

## 节点

${plan.nodes.map((node) => `### ${node.id}：${node.title}

- lane: ${node.lane}
- parallel_group: ${node.parallel_group}
- objective: ${node.objective}
- dependencies: ${node.dependencies.join(", ") || "无"}
- read_scope: ${node.read_scope.join(", ")}
- write_scope: ${node.write_scope.join(", ")}
- required_evidence: ${node.required_evidence.join(", ")}
- verification: ${node.verification.join(" && ")}
- adapter: ${node.adapter || "policy-selected"}
- method_pack_id: ${node.method_pack_id || "legacy"}
- capability_bindings: ${(node.capability_bindings || []).map((item) => `${item.capability_id}@${item.capability_version}`).join(", ") || "无"}
- execution_class: ${node.execution_class || "legacy"}
- preferred_mode: ${node.preferred_mode || "legacy"}
- execution_hints: ${JSON.stringify(node.execution_hints || {})}
- required_capabilities: ${(node.required_capabilities || []).join(", ") || "无"}
- output_contract: ${node.output_contract}
- risk: ${node.risk}
- merge_strategy: ${node.merge_strategy}
`).join("\n")}

## Merge Policy

\`\`\`json
${JSON.stringify(plan.merge_policy, null, 2)}
\`\`\`

## Conflict Policy

\`\`\`json
${JSON.stringify(plan.conflict_policy, null, 2)}
\`\`\`
`;
}

function inferPlanScopes(intake, inventory) {
  const explicit = parseAffectedArea(intake.affected_area, inventory.files);
  const explicitTests = explicit.filter(isTestScope);
  const explicitImplementation = explicit.filter((scope) => !isTestScope(scope) && !scope.startsWith(".apex-v2/"));
  const sourceRoots = unique(inventory.sourceFiles.map(scopeRoot));
  const fallbackImplementation = unique([
    ...sourceRoots,
    ...inventory.schemaFiles.map(scopeRoot),
    ...(inventory.packageJson ? ["package.json"] : [])
  ]);
  const fallbackTests = unique(inventory.testFiles.length > 0 ? inventory.testFiles.map(scopeRoot) : ["tests/"]);

  return {
    implementation: explicitImplementation.length > 0 ? explicitImplementation : fallbackImplementation,
    tests: explicitTests.length > 0 ? explicitTests : fallbackTests
  };
}

function parseAffectedArea(value, files) {
  const raw = String(value || "").trim();
  if (!raw || ["unknown", "n/a", "none"].includes(raw.toLowerCase())) return [];

  const available = new Set(files);
  return unique(raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).map((item) => {
    if (item.includes("*") || item.endsWith("/")) return item;
    if (available.has(item)) return item;
    if (files.some((file) => file.startsWith(`${item}/`))) return `${item}/`;
    return item;
  }));
}

function inferVerificationCommands(inventory) {
  const commands = [];
  const scripts = inventory.scripts || {};
  if (scripts.test) commands.push("npm test");
  for (const name of ["typecheck", "lint", "build", "validate"]) {
    if (scripts[name]) commands.push(`npm run ${name}`);
  }
  const jsEntry = inventory.sourceFiles.find((file) => /\.(mjs|cjs|js)$/.test(file));
  if (jsEntry) commands.push(`node --check ${jsEntry}`);
  if (commands.length === 0) commands.push("test -d .");
  return unique(commands).slice(0, 5);
}

function strategyForIntake(intake, title) {
  if (["bug", "test_failure"].includes(intake.type)) {
    return `针对“${title}”先复现失败并锁定根因，再并行实现最小修复与回归测试，最后独立验证。`;
  }
  if (["risk", "review_feedback", "tech_debt"].includes(intake.type)) {
    return `针对“${title}”先做影响面与反证分析，再以最小切片降低风险，禁止用无关重构掩盖问题。`;
  }
  return `针对“${title}”先明确验收边界和风险，再并行推进最小实现与测试，最后以独立证据决定是否可交付。`;
}

function planNode(input) {
  return {
    id: input.id,
    title: input.title,
    lane: input.lane,
    objective: input.objective,
    parallel_group: input.parallelGroup,
    dependencies: input.dependencies,
    read_scope: unique(input.readScope),
    write_scope: unique(input.writeScope),
    deliverables: input.deliverables,
    required_evidence: input.requiredEvidence,
    verification: unique(input.verification),
    merge_strategy: input.mergeStrategy,
    adapter: input.adapter,
    execution_class: input.executionClass,
    required_capabilities: unique(input.requiredCapabilities || []),
    preferred_mode: input.preferredMode,
    execution_hints: {
      estimated_duration_minutes: Number(input.executionHints?.estimated_duration_minutes || 10),
      requires_isolation: Boolean(input.executionHints?.requires_isolation),
      requires_resume: Boolean(input.executionHints?.requires_resume),
      background: Boolean(input.executionHints?.background),
      requires_parallel_execution: Boolean(input.executionHints?.requires_parallel_execution)
    },
    output_contract: input.outputContract,
    risk: input.risk
  };
}

function edge(from, to, type) {
  return { from, to, type };
}

function normalizedRisk(value, fallback) {
  return ["low", "medium", "high", "critical"].includes(value) ? value : fallback;
}

function isTestScope(scope) {
  return scope.startsWith("test/")
    || scope.startsWith("tests/")
    || scope.includes(".test.")
    || scope.includes(".spec.");
}

function scopeRoot(file) {
  const separator = file.indexOf("/");
  return separator === -1 ? file : `${file.slice(0, separator)}/`;
}

function scopesOverlap(left, right) {
  if (left === right) return true;
  const leftPrefix = directoryPrefix(left);
  const rightPrefix = directoryPrefix(right);
  if (leftPrefix && right.startsWith(leftPrefix)) return true;
  if (rightPrefix && left.startsWith(rightPrefix)) return true;
  return false;
}

function directoryPrefix(scope) {
  if (scope.endsWith("/*")) return scope.slice(0, -1);
  if (scope.endsWith("/")) return scope;
  return null;
}

function findDependencyCycles(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const errors = [];

  function visit(id, path) {
    if (visiting.has(id)) {
      errors.push(`plan graph 存在 dependency cycle：${[...path, id].join(" -> ")}`);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies || []) {
      visit(dependency, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const node of nodes) visit(node.id, []);
  return unique(errors);
}

function validationResult(plan, errors) {
  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    errors,
    node_count: Array.isArray(plan.nodes) ? plan.nodes.length : 0,
    edge_count: Array.isArray(plan.edges) ? plan.edges.length : 0,
    lane_count: Array.isArray(plan.parallel_lanes) ? plan.parallel_lanes.length : 0
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
