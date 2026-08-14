# Apex Forge V2 Contract 草案 v0

状态：draft
日期：2026-07-28

## Contract 哲学

V2 的 stage 之间通过显式 artifact 沟通，而不是通过隐藏 prompt context 沟通。

每个 stage 必须声明：

- 能读什么；
- 能写什么；
- 接受什么 input contract；
- 产出什么 output contract；
- gate 需要什么 evidence；
- 哪些失败可以自动重试；
- 哪些失败必须请求人类决策。

## 项目级 Contract 层级

V2 contract 分两层：

- 项目级 contract：长期存在，描述项目知识、roadmap、intake、risk、decision、test map。
- run 级 contract：短生命周期，描述某一次 delivery run 的 node 输入、输出、证据和 gate。

Run 级 contract 必须引用项目级 context snapshot，run 结束后必须产出 project update proposal。

## 通用 Run Envelope

```json
{
  "contract_version": "v0",
  "run_id": "run-...",
  "node_id": "node-...",
  "stage": "mandate|context|plan|research|execute|verify|review|integrate|learn",
  "objective": "One primary objective for this node.",
  "scope": {
    "in": [],
    "out": [],
    "deferred": []
  },
  "inputs": [],
  "outputs": [],
  "assumptions": [],
  "evidence_refs": [],
  "risks": [],
  "open_questions": [],
  "gate": {
    "status": "PASS|PARTIAL_PASS|FAIL_REWORK|FAIL_REPLAN|ESCALATE|HALT",
    "reason": "",
    "blocking": []
  },
  "next_edges": [],
  "human_required": false
}
```

## 项目级 Contracts

### ProjectStateContract

目的：记录项目长期状态，而不是一次任务状态。

必需字段：

- project id；
- active milestone；
- active runs；
- intake summary；
- roadmap summary；
- risk summary；
- knowledge version；
- last event id。

Gate：

- 只有 kernel 可以直接更新 ProjectState；其他模块必须通过 event 或 proposal 更新。

### ProjectKnowledgeContract

目的：维护项目共享知识库，作为所有 delivery run 的 context base。

必需字段：

- index；
- module map；
- task-to-file map；
- danger zones；
- conventions；
- test map；
- known issues；
- decisions；
- environment；
- source refs；
- confidence；
- last updated。

Gate：

- 所有事实性条目必须有来源、更新时间和置信度。
- 未验证内容必须显式标注，不能沉淀为项目事实。

### IntakeItemContract

目的：标准化持续进入项目的新需求、bug、review feedback、测试失败和技术债。

必需字段：

- source；
- type；
- title；
- description；
- priority；
- risk；
- affected area；
- evidence refs；
- triage status；
- target milestone；
- linked roadmap nodes。

Gate：

- 未 triage 的 intake item 不能直接进入 execution。

### RoadmapGraphContract

目的：维护项目级工作图，而不是一次任务图。

必需字段：

- milestones；
- backlog nodes；
- active nodes；
- dependencies；
- WIP limits；
- risk flags；
- release train；
- done nodes；
- deferred nodes。

Gate：

- 新 delivery run 必须来自 roadmap/backlog 中已 triage 的 node，除非是紧急修复并记录 bypass 原因。

### LearningProposalContract

目的：把 delivery run 产出的经验转成项目知识库更新提案。

必需字段：

- proposed change；
- target knowledge file；
- source evidence；
- confidence；
- risk of persisting；
- reviewer；
- decision。

Gate：

- 只有通过 governance gate 的 proposal 才能写入 ProjectKnowledgeBase。

## 核心 Gate 语义

- `PASS`：目标达成，证据充分，下游依赖 node 可以继续。
- `PARTIAL_PASS`：有可用输出，但 carry-forward risk 或缺失证据必须显式记录。
- `FAIL_REWORK`：当前 node 应用修正后的方法重试。
- `FAIL_REPLAN`：计划或 graph 错误，应返回 planning。
- `ESCALATE`：需要人类决策、权限、credential 或主观判断。
- `HALT`：路径不安全、破坏性太强或目标无效，停止 graph execution。

## Stage Contracts

### MandateContract

目的：把用户意图转成边界清晰的 project mandate。

必需字段：

- goal；
- success criteria；
- non-goals；
- constraints；
- risk level；
- acceptance owner；
- open questions。

Gate：

- 只有当 goal 和 success criteria 足够具体、可以驱动 planning 时才能 pass。

### ContextContract

目的：提供安全 planning 所需的最小相关 context。

必需字段：

- relevant files and modules；
- dependency boundaries；
- available test commands；
- known danger zones；
- prior decisions；
- unknowns。

Gate：

- 只有当下游 planner 可以不做大范围重新发现就定位可能变更面时才能 pass。

### PlanGraphContract

目的：产出 executable nodes 的 dependency graph。

必需字段：

- nodes；
- edges；
- parallelization policy；
- expected artifacts；
- per-node gate criteria；
- budget；
- fallback policy。

Gate：

- 只有当每个 node 都有一个 primary objective 和 verification path 时才能 pass。

### ResearchFindingContract

目的：从 research worker 产出 evidence-backed findings。

必需字段：

- question；
- conclusion；
- evidence；
- confidence；
- counter-evidence；
- implications for plan or implementation。

Gate：

- 只有当 findings 有来源、且能服务下游决策时才能 pass。

### PatchContract

目的：描述 implementation output。

必需字段：

- diff refs；
- changed files；
- behavior changes；
- migration notes；
- rollback notes；
- local verification attempted；
- known residual risk。

Gate：

- 只有当 patch 可 review，且有 verification story 时才能 pass。

### VerificationContract

目的：记录已执行检查及其 evidence。

必需字段：

- command or probe；
- environment；
- result；
- output reference；
- coverage scope；
- failures；
- skipped checks with reasons。

Gate：

- 只有当 verification 覆盖 node 声明的 success criteria，或清楚记录 residual risk 时才能 pass。

### ReviewContract

目的：判断输出是否可 merge，还是需要 rework。

必需字段：

- blocking findings；
- non-blocking findings；
- requirement fit；
- regression risk；
- security or data risk；
- merge posture。

Gate：

- 只有当 blocking findings 为空，或已经由 human gate 明确接受时才能 pass。

### IntegrationContract

目的：合并、打包或发布 verified result。

必需字段：

- merge source；
- conflict resolution；
- final verification；
- release notes；
- rollback plan；
- observability notes。

Gate：

- 只有当 integrated output 对应风险等级来说足够可复现、可回滚时才能 pass。

### LearningContract

目的：决定哪些经验应保留给未来 run。

必需字段：

- reusable decisions；
- failure patterns；
- test mapping updates；
- context updates；
- contract or workflow changes；
- governance approval status。

Gate：

- 只有当 learned items 有来源、且安全适合持久化时才能 pass。
