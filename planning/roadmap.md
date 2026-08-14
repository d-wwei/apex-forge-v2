# Apex Forge V2 路线图

日期：2026-07-28

## Phase 0：Project Workspace And Shared Knowledge

目标：让 V2 先成为项目级常驻工作区，而不是单次任务执行目录。

任务：

- 定义 `.apex-v2/` 项目级目录结构。
- 定义 ProjectKnowledgeBase。
- 创建 knowledge index、module map、danger zones、test map、known issues、decisions、environment 模板。
- 定义 IntakeQueue contract。
- 定义 RoadmapGraph / PortfolioGraph contract。
- 定义 universal artifact envelope。
- 定义 gate result schema。
- 定义 delivery run directory layout。
- 定义 node state 与 event log format。
- 创建 mandate、context、plan graph、verification、review、handoff 模板。
- 盘点 `/Users/admin/Documents/AI/Apex-forge/apex-forge` 中可迁移的旧版 kernel 候选资产。
- 把旧版 stages 映射为 V2 graph node types。

退出 gate：

- 人类只看项目级 `.apex-v2/`，就能理解项目当前目标、backlog、roadmap、风险、知识库、正在运行的 delivery runs。
- 人类只看 run directory，就能理解 objective、current node、evidence、risks 和 next edge，不需要读聊天历史。
- V2 不再依赖过期 symlink、dashboard inference 或 provider-specific hook semantics。

## Phase 1：Project Kernel Skeleton

目标：跑通一个项目级常驻 kernel。

任务：

- 实现或模板化 `project init`。
- 维护 `ProjectState`。
- 维护 project-wide `events.jsonl`。
- 维护 `IntakeQueue`。
- 维护 `RoadmapGraph`。
- 维护 `ArtifactStore`。
- 维护 ProjectKnowledgeBase 版本索引。

退出 gate：

- 可以持续新增 intake items、triage、进入 roadmap，并派生 delivery run。

## Phase 2：Manual Delivery Run Graph

目标：用 durable state 手动跑通一个单线程 V2 workflow。

任务：

- 实现或模板化 `run init`。
- 实现或模板化 `node start`、`node complete`、`node fail`、`node escalate`。
- 把 node outputs 保存为 typed artifacts。
- 支持从 `run-state.json` resume。
- run 完成后回写 ProjectState、RoadmapGraph 和 learning proposal。

退出 gate：

- 一个真实 coding task 可以经过 mandate、context、plan、execute、verify、review，且所有输出都在 artifacts 中可检查。

## Phase 3：Context Fabric Automation

目标：减少反复人工搬运上下文，让 planning 具备 repo awareness。

任务：

- 构建 context index。
- 构建 module map。
- 捕获 test map 与 danger zones。
- 在可用时集成 CodeGraph。
- 增加 sourced unknowns 与 stale-context markers。

退出 gate：

- 对已映射区域，新 agent 接手 node 后，用不超过两次搜索就能定位相关文件和测试。
- Delivery run 能从 ProjectKnowledgeBase 获取 context snapshot。

## Phase 4：Parallel Research

目标：先加入安全并行能力，再允许并行写代码。

任务：

- 定义 research worker contract。
- 定义 evidence card schema。
- 增加 coordinator merge template。
- 增加 confidence 与 counter-evidence 字段。
- 增加 conflict log。

退出 gate：

- 多个只读 subagent 可以产出 findings，并合并成单一 decision artifact，不污染主线程上下文。

## Phase 5：Isolated Execution

目标：允许 implementation workers，但避免共享 checkout 冲突。

任务：

- 定义 worker run namespace。
- 定义 patch bundle contract。
- 定义 verification artifact contract。
- 定义 review artifact contract。
- 增加 merge posture 与 conflict policy。

退出 gate：

- 两个独立 implementation nodes 可以在隔离 worktree/sandbox 中运行，并返回可 review 的 patch bundles。

## Phase 6：Automation And Project Learning

目标：让项目级 graph 具备 durable automation 和受治理的自我改进能力。

任务：

- 增加 event log replay。
- 增加 retry 与 escalation policies。
- 增加 partial-pass carry-forward。
- 增加 node-level eval metrics。
- 增加带 governance gate 的 learning contract。
- 把 delivery 输出转成 ProjectKnowledgeBase update proposal。

退出 gate：

- 暂停或失败的 graph 可以从 state 恢复。
- durable learning 只有在有来源证据并通过审批后才会持久化。
