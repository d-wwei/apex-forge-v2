# 旧版 Apex Forge 审计

日期：2026-07-28
来源路径：`/Users/admin/Documents/AI/Apex-forge/apex-forge`

## 旧版定位

旧版 Apex Forge 把自己定义为 protocol orchestrator，而不是框架。

核心 pipeline 是：

```text
brainstorm -> plan -> execute -> review -> ship -> compound
```

旧版把专业领域能力交给 companion skills，Apex Forge 自身负责执行纪律：

- complexity routing；
- phase gates；
- TDD；
- evidence grading；
- verification gates；
- escalation ladders；
- skill dispatch。

## 阶段地图

### Session Init

启动会话上下文、telemetry id、上游 artifact 扫描和环境快照。

### Ideate

在需求明确前，通过并行视角生成想法、做 adversarial filter，并排序候选方向。

### Brainstorm

硬 gate：requirements 被明确批准前，禁止写代码或开始实现。

输出：

- `docs/brainstorms/{name}-requirements.md`

### Plan

要求已有 approved requirements，并产出精确文件路径、测试路径、任务拆解、依赖顺序和决策理由。

输出：

- `docs/plans/{name}-plan.md`

### Execute

通过任务分级、worktree isolation、TDD、任务派发和每个任务两阶段 review 来实现代码。

输出：

- source changes；
- tests；
- execution log。

### Review

执行多 persona review，并根据 diff 动态激活 security、correctness、spec compliance、frontend、SQL 等检查。

### Ship

负责最终 verification、diff、version、changelog、commit、push 和 PR。

### Compound

完成后提取可复用知识。

## 可迁移实现资产

可作为 V2 输入的资产：

- `src/` 中的 TypeScript CLI。
- `src/dashboard.ts` 和 `frontend/` 中的 Dashboard 与 Hub。
- `src/state/` 中的状态管理。
- `src/state/event-log.ts` 中的 event sourcing。
- `src/orchestrator.ts` 和 `src/adapters/` 中的 orchestrator 与 adapter registry。
- `src/mcp/` 中的 MCP server 与 Browse tools。
- workflow/roles 与 stage docs 中的 worktree 和 worker 概念。

## 主要耦合问题

### Dashboard 耦合

旧版把 dashboard 启动和 dashboard 推导的阶段状态放进 runtime 体验。V2 中 dashboard 应只观察 kernel state。

### Claude Hook 耦合

旧版 hooks 假设 Claude-specific events 和环境变量，例如 session hooks、plugin roots、project directories。V2 必须把这些下沉到 adapters。

### Stage 与 Protocol 耦合

Markdown stage docs 内含可执行 bash preamble 和状态 helper 调用。V2 应拆开 protocol text、machine contract 和 runtime side effects。

### 安装态耦合

Companion skills 会被自动安装或更新，且经常来自 latest HEAD。V2 应通过 registry pin 版本、声明模块依赖并治理升级。

### 状态真相分裂

CLI state、event logs、dashboard inference、git state 和 artifact files 都参与“当前状态”的判断。V2 需要一个 kernel-owned source of truth。

### 默认阻断型 Hooks

Git hooks 和 phase gates 有价值，但不应默认成为硬依赖。V2 应让它们由 policy 控制。

## 应保留

- 执行纪律和 evidence grading。
- TDD 与 verification gates。
- 阶段意图分离：brainstorm 决定 what，plan 决定 how，execute 才改代码。
- Review/Ship interlock。
- Event sourcing。
- Task state machine。
- Orchestrator、adapter registry、worktree isolation、result contracts。
- Companion skill 思路，但应改成 versioned modules，而不是 hard dependency。

## 应隔离

- Dashboard/PWA。
- Chrome extension。
- Browse MCP。
- Claude hooks。
- Git hooks。
- Consensus experiments。
- Web-first UI assumptions。

## 应废弃或降级

- always-on dashboard gate。
- Markdown 文件内嵌 runtime commands。
- 自动安装 latest-HEAD companion skills。
- dashboard 自己推导 stage truth。
- 默认 pre-commit blocking。
- 固定 pipeline 作为唯一执行路径。

## 迁移建议

V2 应先抽取一个小 kernel：

```text
EventStore
TaskGraph
RunState
ArtifactStore
GateResult
AgentAdapter
```

再把旧 stage 表达为 graph node type：

```text
clarify
plan
execute
review
verify
repair
ship
learn
```

每个 node 都应声明：

- input artifacts；
- output artifacts；
- gate；
- retry policy；
- allowed adapters；
- write namespace；
- human approval policy。

