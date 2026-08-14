# Apex Forge V2 规划建议

日期：2026-07-28

## 核心建议

Apex Forge V2 应该建设为：项目级 contract-driven orchestration kernel + 项目共享知识库 + 可替换 discipline modules。

不要把旧版 Apex Forge 重建成更大的 dashboard workflow。V2 的 durable source of truth 应该是本地 artifacts、schemas、event logs、graph state 和 verification evidence。Dashboard、CLI、PR comments、chat 都只是这套状态上的控制面或观察面。

## 北极星目标

Apex Forge V2 不是“一次开发任务执行器”，而是一个项目长期持续运转的半自动化研发操作系统。

项目级主循环是：

```text
Intake -> Triage -> Roadmap Graph -> Delivery Runs -> Quality Feedback -> Learning -> Knowledge Update
```

单次 delivery run 只是其中一个子图：

```text
Mandate -> Context -> Plan Graph -> Research -> Execute -> Verify -> Review -> Integrate -> Learn
```

每个 stage 高内聚，只负责自己的目标和证据。Stage 之间低耦合，通过 typed artifacts 交换信息，而不是依赖隐藏聊天上下文。

每个 stage 内部可以 loop，但必须向 graph 暴露有限的 gate result。每个 delivery run 结束后，必须把结果回写到项目级 ProjectState、RoadmapGraph、RiskRegister 和 ProjectKnowledgeBase。

## 架构

### 1. Project Orchestration Kernel

负责：

- project lifecycle；
- ProjectState；
- IntakeQueue；
- PortfolioGraph / RoadmapGraph；
- DeliveryRunGraph lifecycle；
- project-wide graph state；
- checkpoint 和 resume；
- project-wide event log；
- node scheduling；
- retry 和 escalation policy；
- budget 和 concurrency；
- permission gates；
- WIP limits；
- learning proposal 和 governance gate；
- delivery 结果回写到项目级状态。

不负责：

- product methodology；
- coding methodology；
- testing methodology；
- UI/dashboard state；
- provider-specific prompt format。

### 2. Contract Registry

负责：

- artifact envelope versions；
- stage input/output schemas；
- gate semantics；
- adapter compatibility；
- contract version migration rules。

### 3. Context Fabric

Context Fabric 是项目级常驻模块，不是某个任务阶段。

它组合并维护：

- repo maps；
- CodeGraph 或同类结构索引；
- docs；
- test map；
- git history；
- previous decisions；
- danger zones；
- environment facts。

输出应小而准、有来源，并且能按任务生成 context snapshot。避免巨型全仓库摘要。

建议项目共享知识库包含：

- `knowledge/index.md`；
- `knowledge/module-map.md`；
- `knowledge/task-to-file-map.md`；
- `knowledge/danger-zones.md`；
- `knowledge/conventions.md`；
- `knowledge/test-map.md`；
- `knowledge/known-issues.md`；
- `knowledge/decisions.md`；
- `knowledge/environment.md`；
- `knowledge/glossary.md`。

### 4. Discipline Modules

第一批建议模块：

- `product`：mandate、requirement summary、decision memo、acceptance criteria。
- `code`：repo map、implementation plan、patch bundle、danger-zone scan。
- `test`：test strategy、isolated run directories、evidence merge、known issue handling。
- `review`：requirement fit、code review、risk review、adversarial checks。
- `release`：integration、PR、changelog、rollback、observability。
- `learn`：带 governance gate 的 durable knowledge update。

### 5. Adapter Layer

Adapters 把 V2 contracts 翻译成具体 runtime execution：

- Codex local 或 cloud task；
- Claude Code；
- Gemini；
- shell script；
- MCP tool；
- CI job；
- human approval。

Adapters 不能重新定义 workflow semantics。

## 可复用模式

来自旧版 Apex Forge：

- protocol-orchestrator framing；
- brainstorm / plan / execute / review / ship / compound 的意图分离；
- TDD iron law；
- evidence grading；
- verification gates；
- event sourcing；
- task state machine；
- adapter registry 与 worktree isolation；
- result contract 与 multi-agent orchestration experiments。

来自 Better Work：

- 薄父协议；
- 条件化 round/wave escalation；
- durable `TASK/PLAN/STATE/HANDOFF` 风格状态；
- “没有 evidence，就说明 loop 还没闭合”。

来自 Better Test：

- worker run isolation；
- JSON results；
- coordinator merge；
- conflict log；
- derived views 保护，避免 worker 直接写聚合态。

来自 GSD：

- discuss / plan / execute / verify / ship loop；
- 按依赖做 wave execution；
- 每个 worker 使用 fresh context；
- atomic task commits。

来自 High-Agency / Loop：

- 先调查，再提问；
- 重复失败后必须换方法；
- verification-first closeout；
- autonomous iteration 需要严格 completion signal。

来自 Apex Manager：

- manager / worker split；
- task claim / complete / block；
- artifact submission；
- terminal-first messaging；
- file-inspectable local state。

## 旧版迁移策略

不要整体移植旧 pipeline。应抽取并标准化已经指向 V2 的部分：

- `EventStore`：保留 append-only event sourcing，但让 graph events 成为一等对象。
- `TaskGraph`：用 node types 和 explicit edges 替代固定 stages。
- `RunState`：只保留一个 kernel-owned state object，避免 CLI/dashboard/git-derived 混合真相。
- `ArtifactStore`：为 outputs、evidence、reviews、gates 建 typed contracts。
- `GateResult`：用于 node transitions 的共享有限状态。
- `AgentAdapter`：把 Claude/Codex/Gemini/shell/human 差异移出 core。

旧 stages 映射为 node templates：

- `brainstorm` -> `mandate` 或 `clarify`；
- `plan` -> `plan_graph`；
- `execute` -> `execute_round`；
- `review` -> `review_gate`；
- `ship` -> `integrate_release`；
- `compound` -> `learn`。

旧 dashboard 改成 graph state 与 events 上的 observer/control surface。

## 需要避免的反模式

- 一个 super prompt 同时包含 product、code、test、review、release、governance。
- Dashboard 成为 runtime state owner。
- Markdown-only machine interfaces。
- provider-specific concepts 进入 core architecture。
- 多个 implementation agents 写同一个 namespace。
- 只在最后才测试，把 verification 当作尾部动作。
- 让用户重复转述 repo、文件、屏幕、历史、artifact 中已经可发现的 context。
- 让旧 symlink 或 install state 成为 V2 假设。
- 把 Claude hook semantics 或 dashboard-derived stage inference 带进 kernel。

## Human-In-The-Loop 模型

人类介入应是 policy-based，而不是临时打断：

- `Mandate Gate`：确认目标、范围、成功标准。
- `Risk Gate`：批准生产、数据、安全、外部 API、破坏性或不可逆操作。
- `Plan Gate`：批准大型 multi-worker graph 或高成本执行。
- `Ambiguity Gate`：当证据不足且继续执行会制造明显返工时，请人类决策。
- `Acceptance Gate`：接受最终产品行为或 PR。
- `Governance Gate`：批准写入长期 memory、修改全局 workflow 或升级 contract version。

不要因为系统能自行推断或验证的例行细节打扰人。

## MVP Scope

### MVP-0：Project Workspace And Shared Knowledge

交付物：

- `v2/` workspace；
- 项目级 `.apex-v2/` layout 草案；
- ProjectKnowledgeBase contract；
- knowledge index、module map、danger zones、test map、decisions 模板；
- IntakeQueue contract；
- RoadmapGraph contract；
- universal artifact envelope；
- gate result schema；
- initial stage contracts；
- source inventory 和 planning notes；
- legacy V1 asset inventory 和 migration map。

### MVP-1：Project Kernel Skeleton

目标：

- 先跑起来一个项目级常驻 kernel，而不是只跑单次任务。

交付物：

- `ProjectState`；
- `ProjectEventStore`；
- `IntakeQueue`；
- `RoadmapGraph`；
- `ArtifactStore`；
- `ProjectKnowledgeBase` 版本索引；
- dashboard/CLI 只读 project state 的基本接口。

### MVP-2：Manual Delivery Run Graph

目标：

- 手动执行一条 graph：`mandate -> context -> plan -> execute -> verify -> review`。

交付物：

- run directory layout；
- node state files；
- event log；
- manual commands 或 templates；
- 从 state resume。
- run 结束后回写 ProjectState、RoadmapGraph 和 learning proposal。

### MVP-3：Context Fabric Automation

目标：

- 让 planning 具备 repo awareness，减少用户重复搬运上下文。

交付物：

- context index；
- module map；
- danger zones；
- test map；
- task-to-file hints；
- sourced unknowns。

### MVP-4：Read-Only Parallel Research

目标：

- 在允许并行写代码前，先安全使用 subagents。

交付物：

- research worker contract；
- evidence card schema；
- coordinator merge；
- conflict 与 confidence scoring。

### MVP-5：Isolated Execution Workers

目标：

- 在隔离 worktrees/sandboxes 中执行 implementation。

交付物：

- worker run directories；
- patch contract；
- verification contract；
- review contract；
- merge posture。

### MVP-6：Durable Automation And Project Learning

目标：

- 支持 long-running loops 和 partial-pass carry-forward。

交付物：

- retry policy；
- escalation policy；
- event-sourced resume；
- node-level eval metrics；
- governance-controlled learning。

## 第一个实现决策

先做 files 和 schemas，不先做 web app。

推荐第一版目录形态：

```text
v2/
  core/
  contracts/
  schemas/
  templates/
  orchestrators/
  disciplines/
    product/
    code/
    test/
    review/
    release/
    learn/
  adapters/
    codex/
    claude/
    shell/
    human/
  research/
  planning/
  examples/
```

这个结构能让 runtime 独立于任何单一 agent、UI 或 command system。
