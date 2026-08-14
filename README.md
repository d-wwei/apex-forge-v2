# Apex Forge V2

Apex Forge V2 的独立规划与研发工作区。

V2 不再复刻旧版固定流水线，而是以 **项目级 contract-driven graph of loops** 为核心：

- 项目本身是长期运行对象，不是一次任务；
- 每个新需求、bug、测试反馈、review 反馈都会进入项目级 intake loop；
- 项目共享知识库优先建设，作为所有后续 run 的 context base；
- 每个 delivery run 只是项目 graph 派生出的短生命周期子图；
- 编排层只管理 graph、状态、权限、预算、重试、暂停/恢复和审计；
- dashboard、CLI、PR 评论、聊天窗口都只是控制面或观察面，不拥有流程真相；
- Claude、Codex、Gemini、shell、MCP、人工审批都只是 adapter。

## 工作区结构

- `research/`：并行调研、旧版审计、本地资料盘点和综合结论。
- `planning/`：V2 架构建议、路线图和阶段规划。
- `contracts/`：阶段间接口、gate 语义和 artifact contract。
- `schemas/`：机器可读的 JSON schema。
- `templates/`：人工可读的 run/node 模板。
- `src/core/`：Project Kernel 的状态、artifact、worker、intake/roadmap 和 task-aware PlanGraph 模块。
- `orchestrators/`：预留给 graph runner 与 coordinator。
- `disciplines/`：产品、代码、测试、评审、发布、学习等领域模块。
- `adapters/`：Codex、Claude、shell、MCP、CI、人工节点等适配层。
- `examples/`：预留给样例 V2 run。

## 当前文档

- `planning/v2-planning-recommendation.md`
- `planning/project-operating-model.md`
- `planning/roadmap.md`
- `contracts/stage-contracts-v0.md`
- `research/source-inventory.md`
- `research/subagent-synthesis-2026-07-28.md`
- `research/legacy-apex-forge-audit.md`

## 当前可运行能力

V2 已经是一个可运行的项目级自动调度内核原型：`src/apex-v2.mjs`。

能力清单的机器可读来源是 `capabilities.json`。

它支持：

- 项目级 `.apex-v2/` 状态、事件、artifact、knowledge、roadmap、runs；
- 持续 intake / triage / roadmap；
- 基于 intake 类型、affected area、项目文件清单和知识快照生成任务感知 PlanGraph；
- `project tick` 自动 promote、run create、规划推进、worker dispatch、worker adapter、result collection、verify、review、integrate、learn；
- `execute` 只有在全部 PlanGraph 节点都有成功 worker 结果后才能通过，避免首批 worker 完成即提前收口；
- verification 会在隔离临时 workspace 中物化 merge queue patch，再运行项目验证命令；没有 operations 的 patch 不能冒充已验证变更；
- ProjectKnowledgeBase 刷新和 governance learning 写回；
- worker sandbox / worktree fallback / Codex、Claude、Gemini、shell、human adapters；
- Codex coding-agent adapter：结构化 prompt、完整 scratch/worktree、写范围审计、自动 patch bundle 和 merge queue；
- blocked worker 可通过 `worker retry` 清理 sandbox 后重试，并保留历次 adapter evidence；
- `project reconcile` 校验 event log 完整性，并从 run/roadmap/knowledge artifacts 检测或修复 ProjectState 漂移；
- retry policy 按 adapter 限制尝试次数，仅自动恢复 timeout、execution、contract 等可重试失败；
- Contract Registry 使用 JSON Schema draft 2020-12 在落盘前校验 ProjectState、run、worker、artifact、patch、report 和 policy；
- PARTIAL_PASS 必须生成结构化 carry-forward；未处理风险会暂停 run，只有 evidence resolve 或 human accept 后才能关闭；
- execution policy 限制 patch 文件数/字节、agent 超时和并发；critical 或敏感路径 merge 必须经过内容指纹 approval；
- carry-forward 和 merge conflict 自动回流 Risk Register；`project metrics --record` 持久化交付、执行、质量和风险指标；
- adapter registry 检测 Codex、Claude、Gemini，并按 execution policy 的显式 fallback order 选择可用 runtime；
- retryable adapter failure 可通过 `worker fallback` 或 `project tick --fallback-agents` 切换 runtime；scope violation 不允许换模型绕过；
- verification/review 失败自动回流 Risk Register；`worker results --record` 汇总多 adapter attempts 和最终交付证据；
- Claude/Gemini session_id 持久化到 worker/result，blocked worker 可通过 `worker resume` 在全新 sandbox 延续会话；
- adapter capability 基线发生变化时必须经过 diff fingerprint approval，禁止直接覆盖基线绕过 drift gate；
- `worker adapters --smoke --live --record` 真实验证三种 runtime 的 structured output/session；失败 report 会阻止新 run；
- 当存在待调度任务且 live smoke 过期时，`project tick` 按 quality policy 自动刷新；无待办时不调用外部 adapter；
- live smoke 或自动刷新失败会按严重度和去重窗口进入 `.apex-v2/notifications/outbox.json`，可通过 `notification list/acknowledge` 治理；
- 每次 baseline 或 smoke 记录都会追加 adapter observation；`worker adapters --history` 汇总版本、能力、可用性和 smoke 趋势，且不改变受审批的 capability baseline；
- metrics snapshot 按风险、verification failure、adapter failure rate 和 cycle regression 评估质量；FAIL 时暂停创建新 run；
- patch bundle，支持 `write_text` 和 `replace_text`；
- operation 级冲突检测、merge queue、merge resolve、merge apply；
- verification report、review report、integration report、learning report、audit report；
- `project audit --create-intake` 把能力缺口回流为 intake。

常用命令：

```bash
node src/apex-v2.mjs init --project . --name "Apex Forge V2"
node src/apex-v2.mjs status --project .
node src/apex-v2.mjs validate --project .
node src/apex-v2.mjs intake add --project . --type feature --title "新需求"
node src/apex-v2.mjs intake triage --project . --id <intake-id> --decision accepted --target-milestone MVP
node src/apex-v2.mjs roadmap promote --project . --intake-id <intake-id>
node src/apex-v2.mjs run create --project . --roadmap-id <roadmap-id>
node src/apex-v2.mjs project tick --project . --advance --dispatch --run-workers --collect-results --complete-execute --verify --review
node src/apex-v2.mjs project tick --project . --run-agents --agent-limit 1
node src/apex-v2.mjs project reconcile --project .
node src/apex-v2.mjs project reconcile --project . --apply
node src/apex-v2.mjs worker adapters --project . --history
node src/apex-v2.mjs notification list --project . --status queued
node src/apex-v2.mjs contracts validate --project .
node src/apex-v2.mjs contracts migrate --project . --apply
node src/apex-v2.mjs project audit --project . --create-intake
```

验证命令：

```bash
npm test
node src/apex-v2.mjs contracts validate --project .
node src/apex-v2.mjs validate --project .
```

## Dogfood 状态

当前 V2 工作区自身已经初始化为一个 `.apex-v2/` 项目。

已记录的根目标：

- intake：`把 Apex Forge V2 做成项目级半自动化产研工厂`
- roadmap：已提升为项目级 roadmap 节点
- delivery run：已派生出第一条 planned run，并引用项目共享知识库作为 context snapshot
