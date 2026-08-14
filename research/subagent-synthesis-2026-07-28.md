# Subagent 调研综合

日期：2026-07-28

## 共同结论

所有已返回的 subagent 结果都指向同一方向：

> Apex Forge V2 应该是 contract-driven graph of loops，而不是固定 prompt pipeline。

编排层应该管理 graph state、contract、gate、权限、证据、重试和恢复；具体领域工作应该放在可替换的 stage、discipline 或 adapter 中。

## 旧版 Apex Forge 审计

旧版实现位于 `/Users/admin/Documents/AI/Apex-forge/apex-forge`。

值得保留的资产：

- protocol orchestrator 定位；
- 显式 pipeline contract；
- brainstorm / plan / execute / review / ship / compound 的阶段意图分离；
- TDD 与 evidence grading；
- verification gate；
- event sourcing；
- task state machine；
- orchestrator、adapter registry、worktree isolation、result contract。

不应继承的问题：

- 固定 pipeline 成为唯一 runtime 模型；
- dashboard 和 Hub 过度接近 runtime truth；
- Claude hook、plugin 环境变量进入核心路径；
- Markdown stage 文件混入 bash 和状态副作用；
- 自动安装 latest HEAD companion skills；
- dashboard 自行推导 stage truth；
- 默认启用阻断型 hooks。

迁移含义：

> 旧版 stage 应转成 graph node type；旧版 dashboard 应降级为 observer。先抽取 kernel 概念，再通过 contract 重新引入旧版阶段纪律。

## Better Work 审计

可复用资产：

- `better-work`：薄执行姿态、闭环纪律、失败升级、轻量任务状态、条件化 round/wave 模块。
- `better-code`：项目本地 Context Fabric，包含 shared index、module map、conventions、danger zones、progress。
- `better-test`：最强的多 agent artifact 模式，包括 tester 注册、run 隔离、`results.json`、strategy plan、L2 audit、merge coordinator、conflict log、derived-view protection。
- `better-product-plan`：产品 intake、requirement summary、decision memo、roadmap mapping、metrics、checklist、open questions。

设计经验：

- 先 context，后 control。
- 父协议要薄。
- 复杂度按需叠加：简单任务、round、wave、wave + round。
- gate status 结构化：`PASS`、`PARTIAL_PASS`、`FAIL_REWORK`、`FAIL_REPLAN`、`ESCALATE`、`HALT`。
- Markdown 适合给人读；关键机器接口需要 JSON/YAML schema。

不要照搬：

- Claude-specific slash command 或 `@file` 假设。
- better-test 中金融、daemon、交易场景的强绑定规则。
- Markdown-only 的机器接口。
- 每个 gate 都要求用户确认。
- 无 ownership 和 merge policy 的共享文件写入。

## 目标架构草案

推荐 V2 形态：

- `Orchestration Kernel`：graph、state、checkpoint、event log、budget、permission、concurrency、retry。
- `Contract Registry`：stage schema、artifact envelope、gate schema、版本兼容。
- `Context Fabric`：repo map、CodeGraph、docs、history、tests、environment。
- `Stages`：mandate、context mapping、planning graph、research、execution、verification、review、integration、learning。
- `Adapters`：Codex、Claude、Gemini、local shell、MCP、human node、CI。
- `Human Control Surface`：CLI/TUI/dashboard/PR comments 只是视图和控制面，不拥有状态。

每个 node 内部运行自己的 loop：

```text
Plan -> Act -> Observe -> Judge -> Update
```

graph edge 只消费 typed gate outcome。

## 现代 coding-agent 调研

现代 agentic coding 正在转向：

- 在隔离环境中委派 repo task；
- 并行 worker 产出可 review 的 diff；
- graph orchestration 支持 persistence 和 interrupt；
- trace 与 eval 驱动质量判断；
- 在高风险或主观判断处引入人类审批。

V2 应吸收 vibe coding 的有益部分：低摩擦意图输入和快速迭代。V2 必须拒绝其高风险部分：无证据接受生成代码。

## 本地安装态发现

`agent better work/reference` 下的旧 Apex Forge reference 在当前 workspace 中不可恢复：

- `reference/README.md` 提到 `reference/apex-forge/`。
- `/Users/admin/.codex/skills/apex-forge` 指向这个缺失路径。
- 初始临时 `apex-forge` 规划目录本质上是一个新工作区。

但真实旧版仓库存在于 `/Users/admin/Documents/AI/Apex-forge/apex-forge`。V2 应避免依赖旧安装态，同时把真实旧版仓库作为迁移来源。

