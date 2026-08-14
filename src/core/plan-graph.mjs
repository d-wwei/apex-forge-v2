import { join } from "node:path";
import { bullet, readJson, shortId } from "../lib/common.mjs";
import { SCHEMA_VERSION } from "./store.mjs";

export function buildTaskPlanGraph(root, run, timestamp, inventory) {
  const project = readJson(join(root, "project.json"));
  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  if (!roadmapNode) throw new Error(`找不到 run 对应的 roadmap node：${run.roadmap_node_id}`);

  const intakeItems = readJson(join(root, "intake", "items.json"), []);
  const intake = intakeItems.find((item) => item.id === roadmapNode.source_intake_id);
  if (!intake) throw new Error(`找不到 roadmap 对应的 intake：${roadmapNode.source_intake_id}`);

  const planId = shortId("plan");
  const scopes = inferPlanScopes(intake, inventory);
  const verificationCommands = inferVerificationCommands(inventory);
  const runArtifactScope = `.apex-v2/runs/${run.run_id}/workers/`;
  const contextRefs = unique([
    ".apex-v2/knowledge/index.md",
    ".apex-v2/knowledge/task-to-file-map.md",
    ".apex-v2/knowledge/danger-zones.md",
    ".apex-v2/knowledge/test-map.md",
    ...intake.evidence_refs,
    ...scopes.implementation,
    ...scopes.tests
  ]);
  const nodes = [
    planNode({
      id: "delivery-context",
      title: "任务上下文与验收边界",
      lane: "analysis",
      parallelGroup: "discovery",
      objective: `围绕“${roadmapNode.title}”核对需求边界、受影响模块、已有决策和可执行验收标准。`,
      dependencies: [],
      readScope: contextRefs,
      writeScope: [`${runArtifactScope}context/`],
      deliverables: ["任务上下文摘要", "验收标准", "已知与未知项"],
      requiredEvidence: ["intake 与 roadmap 引用", "相关代码或文档来源", "可验证验收标准"],
      verification: verificationCommands.slice(0, 1),
      mergeStrategy: "只产出 evidence，不直接修改项目代码。",
      adapter: "shell",
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
      writeScope: [`${runArtifactScope}risk/`],
      deliverables: ["风险清单", "反证与替代方案", "回归检查范围"],
      requiredEvidence: ["danger-zone 引用", "失败路径", "风险处置建议"],
      verification: verificationCommands.slice(0, 1),
      mergeStrategy: "与 context 分析并行，输出独立 evidence card。",
      adapter: "shell",
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
      writeScope: [`${runArtifactScope}design/`],
      deliverables: ["实施切片", "依赖与并行策略", "回滚方案"],
      requiredEvidence: ["上下文 evidence", "风险 evidence", "每个切片的验证路径"],
      verification: verificationCommands.slice(0, 2),
      mergeStrategy: "方案先于代码写入；发现范围冲突时返回 planning。",
      adapter: "shell",
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
      verification: verificationCommands,
      mergeStrategy: "worker 只提交 patch bundle；由 coordinator 串行合并。",
      adapter: "codex",
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
      verification: verificationCommands,
      mergeStrategy: "可与主实现并行；write_scope 重叠时必须拆分或串行。",
      adapter: "codex",
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
      verification: verificationCommands,
      mergeStrategy: "验证节点只汇总证据，不替代 implementation patch。",
      adapter: "shell",
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
      verification: verificationCommands,
      mergeStrategy: "只处理 review 阻塞项；新增范围必须返回 intake 或 replan。",
      adapter: "shell",
      outputContract: "evidence",
      risk: normalizedRisk(intake.risk, "high")
    })
  ];

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
    strategy: strategyForIntake(intake, roadmapNode.title),
    planning_basis: [
      `.apex-v2/intake/items.json#${intake.id}`,
      `.apex-v2/roadmap/graph.json#${roadmapNode.id}`,
      `.apex-v2/knowledge/manifest.json@${run.context_snapshot.knowledge_version}`,
      ...intake.evidence_refs
    ],
    quality_bar: [
      "每个节点只有一个 primary objective，并声明读写范围、证据和验证路径。",
      "同一 parallel_group 的 write_scope 必须互斥；重叠时禁止并行。",
      "所有 PASS 必须引用当前 run 的 artifact evidence。",
      "实现保持最小切片，禁止把无关重构混入交付。",
      "只有全部 PlanGraph 节点完成后，execute 才能 PASS。"
    ],
    nodes,
    edges,
    parallel_lanes: [
      { id: "discovery", purpose: "并行核对上下文与风险，避免单一路径自证。", node_ids: ["delivery-context", "delivery-risk"] },
      { id: "planning", purpose: "汇总证据并形成任务级实施切片。", node_ids: ["delivery-design"] },
      { id: "build", purpose: "主实现与测试在写入范围互斥时并行。", node_ids: ["delivery-implementation", "delivery-tests"] },
      { id: "verification", purpose: "独立执行真实项目验证并固化证据。", node_ids: ["delivery-verification"] },
      { id: "readiness", purpose: "复核需求符合性并只修复明确阻塞项。", node_ids: ["delivery-review"] }
    ],
    merge_policy: {
      coordinator_required: true,
      worker_output: "patch_bundle_and_artifacts_only",
      direct_worker_write_to_derived: false,
      merge_order: ["discovery", "planning", "build", "verification", "readiness"]
    },
    conflict_policy: {
      detect_by: ["write_scope_overlap", "same_file_patch", "same_text_patch", "schema_version_change"],
      same_parallel_group_write_overlap: "block_or_split",
      resolution: "coordinator_serial_merge_with_conflict_report",
      human_gate_when: ["schema_breaking_change", "security_sensitive_change", "unresolved_patch_conflict"]
    },
    verification_policy: {
      required_commands: verificationCommands,
      schema_check: inventory.schemaFiles.length > 0
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

export function validatePlanGraph(plan) {
  const errors = [];
  const ids = new Set();
  const lanes = new Map((plan.parallel_lanes || []).map((lane) => [lane.id, lane]));
  const laneMembership = new Map();

  if (!Array.isArray(plan.nodes) || plan.nodes.length < 5) {
    errors.push("plan graph 至少需要 5 个节点");
    return validationResult(plan, errors);
  }

  for (const node of plan.nodes) {
    if (ids.has(node.id)) errors.push(`plan node id 重复：${node.id}`);
    ids.add(node.id);
    if (!node.objective) errors.push(`${node.id} 缺少 objective`);
    if (!Array.isArray(node.write_scope) || node.write_scope.length === 0) errors.push(`${node.id} 缺少 write_scope`);
    if (!Array.isArray(node.required_evidence) || node.required_evidence.length === 0) errors.push(`${node.id} 缺少 required_evidence`);
    if (!Array.isArray(node.verification) || node.verification.length === 0) errors.push(`${node.id} 缺少 verification`);
    if (node.adapter != null && !["shell", "codex", "claude", "gemini", "human"].includes(node.adapter)) errors.push(`${node.id} 的 adapter 无效：${node.adapter}`);
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

  errors.push(...findDependencyCycles(plan.nodes));
  return validationResult(plan, errors);
}

export function renderPlanGraphMarkdown(plan) {
  return `# Plan Graph

plan_id: ${plan.plan_id}
run_id: ${plan.run_id}
roadmap_node_id: ${plan.roadmap_node_id}
source_intake_id: ${plan.source_intake_id || "unknown"}
source_title: ${plan.source_title || "unknown"}
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
- adapter: ${node.adapter}
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
