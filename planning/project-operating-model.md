# Apex Forge V2 项目级运行模型

日期：2026-07-29

## 核心修正

V2 不应该以“一次开发任务”为中心，而应该以“一个项目长期持续运转”为中心。

单次开发任务只是项目运行中的一个子图：

```text
Project Operating System
  -> Intake Queue
  -> Portfolio / Roadmap Graph
  -> Delivery Run Graph
  -> Verification / Review
  -> Integration
  -> Project Knowledge Update
```

真正的常驻对象不是 `run`，而是 `project`。

## 项目级闭环

一个项目会持续出现新需求、bug、重构、技术债、线上风险、测试反馈和产品判断。V2 应该围绕这些长期循环设计：

### 1. Intake Loop

持续接收输入：

- 用户新需求；
- bug report；
- review feedback；
- 线上告警；
- 测试失败；
- 技术债发现；
- 产品机会；
- 外部依赖变化。

输出：

- `intake-item`；
- triage decision；
- priority；
- risk level；
- target milestone；
- 是否进入 roadmap/backlog。

### 2. Context Fabric Loop

持续维护项目共享知识库：

- 项目结构；
- 模块边界；
- 关键路径；
- danger zones；
- 测试地图；
- 环境约束；
- 历史决策；
- 已知问题；
- 代码约定；
- 最近变化摘要。

目标不是“总结整个项目”，而是让任何新 run 都能从稳定、可信、可引用的 context snapshot 开始。

### 3. Portfolio / Roadmap Loop

持续维护项目层面的工作图：

- roadmap；
- backlog；
- milestones；
- dependency graph；
- WIP limits；
- release train；
- risk register；
- decision log。

它回答的是：

- 现在最值得做什么？
- 哪些任务能并行？
- 哪些任务必须等待依赖？
- 哪些任务应该推迟？
- 哪些风险需要先降下来？

### 4. Delivery Loop

对被选中的工作项派生 delivery run：

```text
Mandate -> Context Snapshot -> Plan Graph -> Execute -> Verify -> Review -> Integrate
```

Delivery run 是短生命周期对象。它完成后必须把结果回写到项目级状态，而不是只结束在一个任务总结里。

### 5. Quality Loop

持续运行质量反馈：

- test strategy；
- regression runs；
- flaky tracking；
- coverage gaps；
- review findings；
- security findings；
- performance baselines；
- eval results。

质量回路会产生新的 intake items，也会更新 test map、known issues 和 danger zones。

### 6. Learning Loop

每次 delivery、失败、返工、review、发布后，都要判断是否更新项目知识库：

- 新约定；
- 新坑点；
- 新测试映射；
- 新模块边界；
- 新风险；
- 失败模式；
- 决策记录。

Learning 必须有 governance gate：不能让 agent 随意把未验证判断写成项目长期事实。

## Project Kernel 的职责

Project Kernel 是常驻项目调度内核，不只是 run scheduler。

它负责：

- 维护 `ProjectState`；
- 维护 `ProjectKnowledgeBase` 的版本和索引；
- 维护 `IntakeQueue`；
- 维护 `PortfolioGraph` / `RoadmapGraph`；
- 派生和调度 `DeliveryRunGraph`；
- 管理 project-wide event log；
- 管理 artifact store；
- 管理 gate、权限、WIP、预算、重试和暂停/恢复；
- 把 delivery 结果回写到 project state；
- 触发 knowledge update、test map update、risk register update。

它不负责：

- 具体代码实现；
- 具体测试方法；
- 具体产品判断；
- 具体 UI；
- 某个 agent 平台的 prompt 细节。

## 项目共享知识库应优先建设

V2 的 Phase 0 应该首先建立项目共享知识库，而不是先做单次 run。

建议目录：

```text
.apex-v2/
  project.json
  events.jsonl
  intake/
  roadmap/
  knowledge/
    index.md
    module-map.md
    task-to-file-map.md
    danger-zones.md
    conventions.md
    test-map.md
    known-issues.md
    decisions.md
    environment.md
    glossary.md
  risks/
  runs/
  artifacts/
  derived/
```

关键原则：

- `knowledge/` 是项目级共享 context，不属于某一次任务。
- `runs/` 是短生命周期执行记录。
- `artifacts/` 是所有 run 和 project graph 的证据来源。
- `derived/` 是可重建视图，不能由 worker 直接写。
- 所有事实性知识都必须有来源、更新时间和置信度。

## 单次 Run 与项目状态的关系

单次 run 启动时：

- 从 `ProjectKnowledgeBase` 取一个 context snapshot；
- 从 `PortfolioGraph` 取任务依赖和优先级；
- 从 `Policy` 取权限和 gate；
- 从 `TestMap` 取建议验证策略。

单次 run 结束时：

- 提交 patch/evidence/review artifacts；
- 更新 roadmap/backlog 状态；
- 更新 risk register；
- 触发 learning proposal；
- 必要时生成新 intake items；
- 由 governance gate 决定是否写入长期 knowledge。

## 新架构一句话

V2 不是“把一个任务做完”的工具，而是“让一个项目长期在 AI agent 协作下持续演进”的项目级操作系统。

