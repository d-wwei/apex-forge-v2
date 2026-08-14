export function renderKnowledgeIndex(inventory, version, timestamp) {
  return `# 项目知识入口

版本：${version}
更新时间：${timestamp}

## 已验证事实

- 源码入口：\`src/apex-v2.mjs\`
- 测试入口：\`npm test\`
- 测试文件：${inline(inventory.testFiles)}
- Schema 数量：${inventory.schemaFiles.length}

## 快速入口

- \`node src/apex-v2.mjs --help\`
- \`node src/apex-v2.mjs validate --project . --strict-knowledge\`

## 关键来源

${list(inventory.sourceRefs.slice(0, 40))}
`;
}

export function renderModuleMap(inventory) {
  return `# 模块地图

## 运行内核

${list(inventory.sourceFiles.map((file) => `\`${file}\``))}

## 机器契约

${list(inventory.schemaFiles.map((file) => `\`${file}\``))}

## 测试

${list(inventory.testFiles.map((file) => `\`${file}\``))}

## 文档

${list([...inventory.planningDocs, ...inventory.contractDocs, ...inventory.researchDocs].map((file) => `\`${file}\``))}
`;
}

export function renderTaskToFileMap(inventory) {
  return `# 任务到文件映射

| 任务 | 主要文件 | 验证 |
|---|---|---|
| CLI/Project state | \`src/apex-v2.mjs\`, \`src/core/store.mjs\` | \`npm test\` |
| PlanGraph | \`src/core/plan-graph.mjs\` | plan graph tests |
| Worker/Agent | \`src/core/worker.mjs\`, \`src/core/agent-execution.mjs\`, \`src/adapters/\` | agent and concurrent worker tests |
| Contract | \`src/core/contracts.mjs\`, \`schemas/\` | \`contracts validate\` |
| Observability | \`src/core/metrics.mjs\`, \`src/core/heartbeat.mjs\`, \`src/core/notifications.mjs\` | heartbeat/rolling tests |

测试文件：${inline(inventory.testFiles)}
`;
}

export function renderDangerZones(inventory) {
  return `# Danger Zones

- \`.apex-v2/\`：项目事实来源，只能通过 kernel-owned 写路径更新。
- \`src/core/store.mjs\`：原子写入、event ordering 和 project lock。
- \`src/core/governance.mjs\`：Approval V1、预算与 capability。
- \`src/core/agent-execution.mjs\`：sandbox 和 write-scope 边界。
- \`schemas/\`：持久化兼容性边界。

## 检查命令

- \`npm test\`
- \`node src/apex-v2.mjs contracts validate --project .\`
- \`node src/apex-v2.mjs project reconcile --project .\`

## 来源

${list(["src/apex-v2.mjs", ...inventory.sourceFiles, ...inventory.schemaFiles].slice(0, 60))}
`;
}

export function renderConventions(inventory) {
  return `# 项目约定

- Node.js ESM，CLI 输出机器可读 JSON，错误走 stderr。
- 状态写入必须使用 atomic helpers 和 project lock。
- 新命令必须覆盖成功、失败和并发/恢复路径。
- Agent 只能在 capability sandbox 和 write scope 内执行。
- PASS 必须引用 artifact evidence。

## Package scripts

${list(Object.entries(inventory.scripts).map(([name, command]) => `\`${name}\`: \`${command}\``))}
`;
}

export function renderTestMap(inventory) {
  return `# 测试地图

- \`npm test\`：完整回归。
- \`node --check src/apex-v2.mjs\`：CLI 语法。
- \`node src/apex-v2.mjs contracts validate --project .\`：权威 contract。
- \`node src/apex-v2.mjs validate --project . --strict-knowledge\`：项目与 Context Fabric。

## 测试文件

${list(inventory.testFiles.map((file) => `\`${file}\``))}
`;
}

export function renderKnownIssues() {
  return `# 已知问题

## 已验证

- 权威 JSON 已由 Contract Registry 覆盖，archived sandbox 副本不参与当前 contract。
- Context Fabric 提供文件索引、任务路由、freshness metadata 和 stale marker。
- Agent adapter 支持 fallback、resume、capability sandbox 和进程树 timeout。
- Event replay 与 materialized ProjectState 会交叉校验。
- Rolling metrics、heartbeat、notification delivery 和 Approval V1 已启用。

## 未验证线索

- CLI command domains 仍在持续拆分，入口文件尚未达到最终行数预算。
`;
}

export function renderDecisions() {
  return `# 决策记录

- 项目级 Project Kernel 是真相 owner。
- Stage 通过 typed artifacts 和 finite gates 协作。
- 权威状态写入必须原子化并可由 events 重放校验。
- Coding agents 必须使用 OS capability sandbox。
- 审计必须执行当前测试，不接受 manifest 自认证。
`;
}

export function renderEnvironment(inventory) {
  const dependencies = Object.entries(inventory.packageJson?.dependencies || {})
    .map(([name, version]) => `\`${name}@${version}\``);
  return `# 环境事实

- Runtime：Node.js ESM
- Package：\`${inventory.packageJson?.name || "unknown"}@${inventory.packageJson?.version || "unknown"}\`
- 生产依赖：${dependencies.join(", ") || "无"}
- 状态目录：\`.apex-v2/\`
- Scheduler：heartbeat daemon / launchd installer
`;
}

export function renderGlossary() {
  return `# 术语表

- Project Kernel：项目级调度与状态内核。
- Context Fabric：有来源和 freshness 的项目知识。
- DeliveryRun：roadmap 派生的短生命周期交付图。
- Artifact Evidence：gate 的可审计证据。
- Capability Sandbox：限制文件、secret、network 和进程生命周期的执行边界。
- Derived View：可从 events/artifacts 重建的非权威视图。
`;
}

export function withKnowledgeMetadata(content, generatedAt, staleAfter, sourceRefs) {
  return `<!-- apex-knowledge-metadata
generated_at: ${generatedAt}
stale_after: ${staleAfter}
confidence: 0.9
freshness: current-until-stale_after
source_refs:
${sourceRefs.slice(0, 40).map((ref) => `  - ${ref}`).join("\n")}
-->

${content}`;
}

function list(items) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无。";
}

function inline(items) {
  return items.length ? items.map((item) => `\`${item}\``).join(", ") : "暂无";
}
