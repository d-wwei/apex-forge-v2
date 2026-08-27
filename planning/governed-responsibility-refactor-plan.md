# Apex Forge Governed Responsibility Refactor 计划

日期：2026-08-27

## 1. 结论

Governed 的三段 Barrier 设计保留：

```text
delivery-plan
→ delivery-candidate
→ delivery-readiness
```

需要重构的不是三段交付边界，而是 Barrier 内部的职责粒度和 Agent/Kernel 分工。
当前实现把七项研发职责固化为七个 PlanGraph 节点，并要求 Agent 为同一次判断重复
生成 semantic evidence 和多份 Capability Evidence，造成模型调用、上下文和状态
往返过多。

目标是把 Governed 从“固定七节点重流程”改为：

```text
三段 Barrier
+ 三个默认 Agent 判断
+ 按风险增加的可选 Challenger/Test Worker
+ Kernel 自动完成的控制与门禁
```

## 2. 设计原则

1. 研发职责可以保留，但不等于每项职责必须成为独立 Agent 节点。
2. Agent 只负责需要语义理解、取舍、创造和独立判断的工作。
3. Kernel 负责事实投影、状态迁移、调度、验证、门禁、权限和副作用。
4. 同一 Candidate 的测试只执行一次权威 staged verification。
5. Semantic Review 必须发生在 candidate-bound verification 之后。
6. Capability 是节点内的审查维度，不默认增加新的 Agent、状态机或重复输出。
7. Governed 只用于 critical、不可逆、生产敏感、恢复敏感或真实并行任务。
8. 任何优化必须先通过 hidden acceptance、scope safety 和 durable closure。

## 3. 目标 Graph

### 3.1 Plan Barrier

默认结构：

```text
Kernel ContextPack
→ delivery-plan Agent
→ Plan Artifact
```

`delivery-plan` 合并当前的：

- `delivery-context`
- `delivery-design`
- 常规风险与回滚分析
- engineering spec
- architecture decision
- test strategy

仅在以下条件成立时增加独立 `risk-challenger`：

- `risk=critical`
- 不可逆数据迁移
- 生产权限、认证、资金或交易副作用
- 多仓库或多服务同时写入
- 恢复路径或回滚策略存在实质不确定性

### 3.2 Candidate Barrier

默认结构：

```text
delivery-implementation Agent
→ Kernel Candidate Assembly
→ Kernel Staged Verification
```

默认由同一个 Implementation Agent 同时修改实现和聚焦测试，避免两个 Agent 分别基于
旧代码工作。

仅在以下条件成立时拆出 `delivery-tests`：

- 实现和测试 write scope 明确互斥
- 测试切片能够独立设计
- 预计并行收益大于 Agent 启动与合并开销
- 至少一个切片预计超过 10 分钟

删除内层 `delivery-verification` worker。权威验证只由外层 Kernel staged
verification 执行。

### 3.3 Readiness Barrier

目标结构：

```text
Verified Candidate
→ independent delivery-review Agent
→ Kernel Approval / Merge / Closure
```

Review Agent：

- 只读，不拥有生产代码 write scope
- 必须读取 verification report
- 必须绑定 candidate digest
- 输出一份统一的 Review Artifact
- blocking finding 返回 Implementation，而不是由 reviewer 直接修代码

`security-audit`、`high-risk-review`、`code-review` 不再要求三份重复 JSON，
而是统一 Review Artifact 中的三个可选 section。

## 4. Agent 与 Kernel 分工

| 工作 | Agent | Kernel |
| --- | --- | --- |
| 需求歧义与验收解释 | 负责 | 提供 intake/context |
| 方案、取舍、回滚设计 | 负责 | 保存证据与 Decision |
| 实现与聚焦测试 | 负责 | Workspace、scope、patch capture |
| 独立风险挑战 | 条件触发 | 判断是否触发 |
| 独立语义 Review | 负责 | Candidate 绑定与门禁 |
| 状态机、依赖解锁 | 不负责 | 负责 |
| claim、lease、fencing | 不负责 | 负责 |
| Worker 调度和重试 | 不负责 | 负责 |
| Candidate assembly | 不负责 | 负责 |
| 测试命令执行 | 不负责 | 负责 |
| Verification report | 不负责 | 负责 |
| Approval、merge、closure | 不负责 | 负责 |
| Evidence receipt 和日志 | 提供语义内容 | 生成、索引、校验 |
| Learning queue | 提议高价值学习 | 去重、排队、应用 |

## 5. P0 改动

### P0-1 删除重复 Verification

当前问题：

- 内层 `delivery-verification` 使用 shell 在项目根执行命令。
- 此时 implementation/test patch 尚未合入项目根。
- 外层 verification 之后又在 staged candidate 上重复执行。

改动：

- Governed PlanGraph 不再生成 `delivery-verification` worker。
- `execute` 在 implementation/test patch 已进入 merge queue 后完成。
- 外层 `verify` 成为唯一权威 staged verification。
- 删除 Governed 七节点最低数量约束，改为职责和 Gate 约束。

验收：

- 每个 Candidate 的 required command 只执行一轮权威验证。
- Verification workspace 必须包含所有 queued patch。
- 旧代码测试 PASS 不能让新 Candidate 获得 PASS。

### P0-2 调整 Semantic Review 顺序

当前问题：

- 内层 `delivery-review` 必须完成后，外层 verification 才开始。
- Review workflow 声称读取 verification report，但报告此时尚不存在。

改动：

- Review action 只在外层 verification PASS 后创建。
- Review action payload 直接包含 candidate digest、verification ref、patch refs 和风险。
- Reviewer write scope 强制为空。
- blocking review 生成 structured rework request，重新打开 Candidate Barrier。

验收：

- Review Artifact 和 Verification Report 绑定相同 candidate digest。
- Reviewer 无法修改项目文件。
- Candidate 改变后旧 review 自动失效。

### P0-3 建立确定性 Controller 热路径

Agent 不再决定或拼接以下流程命令：

- advance
- dispatch
- run-agents
- collect-results
- complete-execute
- verify
- review
- integrate
- learn

新增单一 controller 行为：

```text
drain()
→ 恢复 lease
→ 运行可执行的 Kernel transition
→ 返回唯一 NextAction
→ 等待 Agent Result
→ 继续 drain
```

Plugin 对 Agent 只暴露：

```json
{
  "action_type": "plan | implement | risk_challenge | review | decision",
  "objective": "...",
  "workspace": "...",
  "context_refs": [],
  "required_output": "...",
  "budget": {}
}
```

Agent 不再读取 CLI help、猜命令或判断下一步运行哪个生命周期参数。

验收：

- 主 Agent 在开始产品工作前最多执行一次 bootstrap/claim。
- Agent 不需要直接调用 raw Kernel CLI。
- 同一状态重复 drain 幂等。

### P0-4 修正 Capability 与执行类型

当前问题：

- Cognitive `test-strategy` 被绑定到 deterministic verification worker。
- Shell 无法生成 required cognitive evidence。

改动：

- test strategy 并入 `delivery-plan` Agent。
- deterministic node 只能绑定 deterministic capability。
- Contract validation 拒绝 Capability execution class 与 node execution class 不兼容。

验收：

- `enforce` 模式下不存在天然无法提交的 Capability Evidence。
- 不允许 cognitive capability 静默落到 shell worker。

## 6. P1 改动

### P1-1 合并 Context、Risk 和 Design

默认只保留一个 `delivery-plan` Agent。

Kernel 自动准备：

- Intake 摘要
- affected files
- acceptance commands
- ProjectKnowledge refs
- static danger-zone matches
- permission/sensitive path facts
- Git delivery facts

Agent 只补充：

- 歧义
- 方案取舍
- 失败路径
- 回滚
- 实施切片
- 测试策略

### P1-2 动态拆分 Implementation/Test

增加 Split Benefit Evaluator：

```text
parallel benefit
= max(serial estimate - parallel estimate, 0)
- worker startup cost
- context duplication cost
- merge/conflict risk
```

只有收益为正才创建独立 Test Worker。

### P1-3 统一 Evidence Artifact

每个 Agent action 只返回一个 typed artifact：

- Plan Artifact
- Patch Artifact
- Risk Challenge Artifact
- Review Artifact

Capability 输出成为 artifact section。Kernel 根据 section 生成 Capability Receipt，
不要求 Agent 重写通用 objective、source refs、claims 和 verification refs。

### P1-4 模型分级

| 工作 | 默认模型 |
| --- | --- |
| Plan | standard |
| Risk Challenger | cheap；critical 可升级 strong |
| Implementation | standard |
| Test Worker | cheap |
| Review | standard |
| Critical Review / conflict | strong |
| Verification / merge / closure | deterministic |

取消 Governed Review 无条件 strong。

## 7. P2 改动

### P2-1 收紧 Governed 路由

以下信号不再单独触发 Governed：

- 标题仅包含 security/auth
- 普通两文件安全 Bug
- 普通 review feedback
- 仅需要并行但无共享写入风险

这些任务使用 `disciplined-tdd + conditional capability`。

Governed 默认触发条件：

- `risk=critical`
- 不可逆 migration
- production destructive operation
- 资金、交易、支付
- 权限或认证协议变更
- 多仓库写入
- 中断恢复和长期后台执行
- 明确要求 separation of duties

### P2-2 Learning 去噪

当前固定 Learning proposal 改为：

- 没有新规则则不生成 proposal
- 与既有知识相同则去重
- 只有跨任务可复用、证据充分的内容才进入治理队列
- Learning 永远不增加新的同步 Agent 节点

## 8. 目标节点数量

| 场景 | Agent 节点 | 程序 Gate |
| --- | ---: | ---: |
| 普通 Governed | 3：plan、implementation、review | verification、approval、merge、closure |
| Critical Governed | 4：plan、risk challenger、implementation、review | verification、approval、merge、closure |
| 大型并行 Governed | 4-5：增加 test 或独立实现切片 | verification、approval、merge、closure |

不得再以 `governed == 7 nodes` 作为 schema 或测试不变量。

## 9. 实施切片

### Slice A：Graph 与状态迁移

涉及：

- `src/core/plan-graph.mjs`
- `src/core/method-packs.mjs`
- `src/apex-v2.mjs`
- PlanGraph schemas
- migration

产出：

- Governed V2 graph
- old PlanGraph compatibility reader
- review-after-verification transition

### Slice B：Controller 与 Plugin Host

涉及：

- `src/apex-v2.mjs`
- `src/commands/host.mjs`
- Plugin workflow references
- Host action/result contracts

产出：

- `drain/next-action`
- 自动 transition
- Agent 不可见的 Kernel choreography

### Slice C：Unified Evidence

涉及：

- capability registry
- semantic/capability evidence contracts
- worker prompt
- Host submit

产出：

- unified Plan/Review Artifact
- derived Capability Receipt
- execution-class compatibility Gate

### Slice D：Routing 与模型策略

涉及：

- Method Pack selection
- model routing
- split-benefit evaluator
- cost governor

产出：

- 收紧 Governed
- 条件拆分
- Review 模型动态升级

### Slice E：Benchmark 与迁移验证

涉及：

- deterministic throughput fixtures
- Raw/V1/V2 Product Benchmark
- old run replay/reconcile
- Plugin package/install

## 10. 兼容与迁移

1. 旧 7-node PlanGraph 继续可读取和恢复。
2. 已 active 的旧 run 不自动改图，继续按原计划完成或显式 replan。
3. 新 run 默认生成 Governed V2。
4. PlanGraph schema 增加 graph version，不依赖节点数量猜版本。
5. 历史 Capability Evidence 继续有效；新 Artifact 使用 receipt adapter 投影到旧查询接口。
6. Candidate、approval、event replay 和 reconcile 权威语义不变。

## 11. 验证矩阵

### 结构验证

- 普通 Governed 默认 3 Agent 节点。
- Critical Governed 默认 4 Agent 节点。
- Review 一定晚于 staged verification。
- 每个 Candidate 只执行一次权威 verification。
- Reviewer write scope 为空。
- Cognitive capability 不得绑定 deterministic node。

### 故障验证

- Plan Agent 失败只重试 Plan。
- Optional Risk Challenger 失败不会丢失 Plan evidence。
- Test Worker 失败不重跑 Implementation。
- Candidate 变化使 verification/review 失效。
- Controller 中断后从同一 NextAction 恢复。
- 重复 drain 不重复调用 Agent。

### 产品效果验证

硬 Gate：

- public acceptance = 100%
- hidden acceptance = 100%
- scope safety = 100%
- durable closure = 100%
- false completion = 0

Governed 目标：

- wall time <= 10 分钟
- total tokens <= 600k
- 成本 <= 同任务 V1 3x
- 至少三个不同任务连续通过

## 12. 停止与回滚

任一情况停止实验并保留旧 Governed：

- hidden acceptance 下降
- candidate-bound review 被削弱
- migration/replay 不一致
- critical path 失去独立 reviewer
- Controller 产生重复 Agent 调用
- 三轮实验没有质量有效的成本改善

每个 Slice 独立提交、独立验证。不得在同一实验同时修改 Graph、模型、Prompt 和
Benchmark evaluator。

## 13. 完成定义

工程完成：

- Governed V2 Graph、Controller、Unified Evidence、routing 和 migration 全部落地。
- 完整测试、contracts、strict validate、reconcile、plugin validation 全部 PASS。
- 旧 7-node run 可继续恢复。

效果完成：

- 三个不同 Governed 任务连续满足全部质量 Gate。
- wall time、Token 和相对 V1 成本达到目标。
- 正式 Raw/V1/V2 benchmark 绑定同一 Candidate 和 evaluator。

在效果完成前，结论保持：

```text
Governed Responsibility Refactor: IMPLEMENTED / NOT_PROVEN
```
