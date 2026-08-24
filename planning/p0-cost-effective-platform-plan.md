# Apex Forge V2 P0 性价比升级计划

日期：2026-08-20

## 目标

在不降低现有 candidate、verification、review、approval、reconcile 和
release Gate 的前提下，把 Apex Forge 从“固定重治理流程”升级为“按风险选择方法、
按真实执行需求选择运行模式、按预算及时止损”的研发平台。

P0 目标：

- 提供可插拔 Method Pack，内置 `quick`、`disciplined-tdd`、
  `phase-context`、`governed`。
- 支持 native、OpenSpec、Spec Kit 输入归一化，不重建第三套 Spec authority。
- 建立 Repo、Branch、Component、PR 和 checkout owner 的 typed delivery model。
- Factory 只由 critical risk、隔离、恢复、后台和真实并行需求触发，不再由“任务看起来
  很复杂”或固定时长单独触发。
- 每条 execution route 记录 wall time、token、tool call、turn 预算；预计超限时在执行前
  fail closed，实际超限时不得形成 PASS。
- 相对 V2 当前复杂任务基线，正式目标为 token 降低 50%、wall time 降低 40%，质量
  Gate 不下降。

## 设计边界

### Method Pack

Method Pack 只描述研发方法，不拥有第二份 ProjectState：

| Pack | 用途 | PlanGraph |
|---|---|---|
| `quick` | 低中风险、少文件、验收明确 | 实现测试合并 + 独立语义评审 |
| `disciplined-tdd` | 默认复杂研发 | 设计 + 实现测试 + 独立验证 + 评审 |
| `phase-context` | 需要阶段上下文或显式 GSD 风格推进 | 上下文 + 设计 + 实现测试 + 验证 + 评审 |
| `governed` | critical、安全、恢复、迁移和高副作用任务 | 保留完整 7 节点治理 |

项目可在 `.apex-v2/policies/method-packs.json` 增加 pack；Kernel 只接受已知 workflow，
防止插件注入任意执行代码。外部框架只借鉴方法概念，不复制未确认许可证的源码。

### Cost Governor

Cost Governor 属于 Execution Policy。Method Pack 决定“怎么研发”，Cost Governor 决定
“这条 route 最多花多少”：

- 计划阶段：预计 wall time 超预算时阻止创建 worker，要求 replan、拆分或显式换 pack。
- 执行阶段：timeout 取全局预算和 route 预算的较小值。
- 结果阶段：adapter 提供 token/tool/turn usage 时执行 hard check；usage 缺失必须记录为
  `unknown`，不能伪造节省结论。
- Factory 触发与 Cost 超限分离。成本超限不自动升级成更昂贵的 Factory。

### Spec Adapter

Adapter 只做输入归一化：

`native/OpenSpec/Spec Kit -> normalized intake -> Roadmap -> PlanGraph`

原 Spec 文件保持 authority；Intake 记录 format、source path、checksum 和 evidence refs。
导入路径必须位于项目根内。

### Git Delivery

Delivery model 记录：

- Repository 与 protected branches
- Branch/current HEAD
- Component path scope
- Pull Request identity/status
- Checkout path 与 owner

foreign owner、protected branch 写入和超出 component scope 的 staged files 必须 fail closed。
Worker 仍不得自行 commit、merge 或 push。

## 实施切片

1. 新增 Method Pack registry、schema、selection 和四档 PlanGraph。
2. 新增 route Cost Governor、预算 schema、preflight 和结果 usage Gate。
3. 新增 Spec Adapter 与 `intake import-spec`。
4. 新增 Git Delivery model、checkout claim/release/guard，并接入 worktree sandbox。
5. 更新 init、migration、contracts、help、插件 runtime schemas。
6. 跑聚焦测试、全量测试、contracts、strict validate、reconcile、插件 build/validate、
   candidate freeze/validate。

## 验收

### 机械开销验收

- `quick` 为 2 节点。
- 默认复杂任务从 7 节点降为 4 节点，减少 42.9%。
- `phase-context` 为 5 节点。
- 只有 `governed` 保留 7 节点。
- 每个 worker 的 `execution-route.json` 包含 `method_pack_id`、`cost_budget`、
  `budget_status`。
- Factory 不再由 duration 单独触发。
- critical、isolation、resume、background、parallel 仍触发 Factory。
- 所有旧质量 Gate 和完整测试保持 PASS。

### Product Benchmark 验收

以下结论必须来自同一 release candidate、同一任务集、同一 provider/model、同一环境指纹
的正式同质 benchmark：

- 复杂任务 median input+output tokens 相对当前 V2 基线降低至少 50%。
- 复杂任务 median wall time 相对当前 V2 基线降低至少 40%。
- hidden acceptance、durable closure、review defect detection 和 recovery score 不下降。
- 任一 usage 缺失、candidate 漂移或任务不等价时，结论保持 `NOT_PROVEN`。

## 完成定义

代码、schema、迁移、CLI、插件资产和完整回归全部通过，可标记“P0 工程实现完成”。
只有 Product Benchmark 同时满足成本与质量阈值，才可标记“P0 性价比目标达成”。

## 执行结果

截至 2026-08-20：

- P0 工程实现：`COMPLETE`。
- `quick/disciplined-tdd/phase-context/governed` 实际节点数：`2/4/5/7`。
- Spec Adapter：native、OpenSpec、Spec Kit 已接入 durable intake。
- Git Delivery：Repo、Branch、Component、PR、checkout claim/release 和 worktree owner 已接入。
- Cost Governor：route preflight、timeout cap、usage evaluation 和 persisted route budget 已接入。
- 主实现完整自动化回归：`281/281 PASS`。
- Release source selector symlink 边界回归：`4/4 PASS`。
- Contract/Project Gate：`58 schemas`、`1,258 contracts`、strict validate PASS、
  reconcile `CONSISTENT`。
- Codex/Claude 插件包、原生 lifecycle 和安装态：PASS；最终本地版本
  `0.2.0-rc.1+codex.20260820120948`。
- 隔离 clean-snapshot candidate freeze 与 candidate validation：PASS。
- 复杂任务 token -50%、wall time -40%：`NOT_PROVEN`。必须基于新的 release candidate
  重跑正式同质 Product Benchmark，不以节点减少推导真实 token 或耗时。
