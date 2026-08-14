# 资料盘点

日期：2026-07-28

本文记录 V2 规划启动时，本地实际可用的资料、路径和约束。

## 本地工作区发现

- 当前 V2 工作区：`/Users/admin/Documents/AI/Apex-forge/v2`。
- 初始临时规划工作区是：`/Users/admin/Documents/AI/agent better work/apex-forge/v2`，后来整体迁移到 `/Users/admin/Documents/AI/Apex-forge/` 下。
- 初始临时 `apex-forge` 目录不是 git 仓库，当时只包含新建的 `v2/` 目录。
- Codex skill 注册表中的 Apex Forge 安装位是一个过期 symlink：
  - `/Users/admin/.codex/skills/apex-forge`
  - 指向 `/Users/admin/Documents/AI/agent better work/reference/apex-forge/skill`
  - 目标目录不存在。
- `reference/README.md` 仍然提到 `reference/apex-forge/`，描述为 “brainstorm/plan/review/execute framework and hard gates”，但对应目录不存在。
- 旧版 Apex Forge 主体后来在这里找到：
  - `/Users/admin/Documents/AI/Apex-forge/apex-forge`
  - 这是 V1 迁移分析的真实来源。

## 可用本地参考

旧版 Apex Forge：

- `/Users/admin/Documents/AI/Apex-forge/apex-forge/README.md`
- `/Users/admin/Documents/AI/Apex-forge/apex-forge/workflow/PIPELINE.md`
- `/Users/admin/Documents/AI/Apex-forge/apex-forge/docs/project-overview.md`
- `/Users/admin/Documents/AI/Apex-forge/apex-forge/src/state/event-log.ts`
- `/Users/admin/Documents/AI/Apex-forge/apex-forge/src/orchestrator.ts`
- `/Users/admin/Documents/AI/Apex-forge/apex-forge/src/adapters/`

Better Work 系列：

- `/Users/admin/Documents/AI/agent better work/better-work-series/README.md`
- `/Users/admin/Documents/AI/agent better work/better-work-series/better-work/codex/better-work/SKILL.md`
- `/Users/admin/Documents/AI/agent better work/better-work-series/better-work/subskills/round-based-execution.md`
- `/Users/admin/Documents/AI/agent better work/better-work-series/better-work/subskills/wave-based-delivery.md`
- `/Users/admin/Documents/AI/agent better work/better-work-series/better-code/SKILL.md`
- `/Users/admin/Documents/AI/agent better work/better-work-series/better-test/SKILL.md`
- `/Users/admin/Documents/AI/agent better work/better-work-series/better-product-plan/SKILL.md`

Apex Manager：

- `/Users/admin/.codex/skills/apex-manager/SKILL.md`
- `/Users/admin/.codex/skills/apex-manager/docs/roadmaps/apex-manager-v2-phase0-phase1-execution-spec.md`

其他参考系统：

- `/Users/admin/Documents/AI/agent better work/reference/get-shit-done/README.md`
- `/Users/admin/Documents/AI/agent better work/reference/pua/codex/high-agency/SKILL.md`
- `/Users/admin/Documents/AI/agent better work/reference/pua/skills/loop/SKILL.md`
- `/Users/admin/Documents/AI/agent better work/reference/iteration-reflector/SKILL.md`

## 外部调研来源

- OpenAI Codex：云端 coding agent、并行任务、隔离环境。
  - https://openai.com/index/introducing-codex/
  - https://openai.com/codex/
- LangGraph：graph runtime、durable execution、persistence、human-in-the-loop。
  - https://docs.langchain.com/oss/python/langgraph/overview
  - https://docs.langchain.com/oss/python/langgraph/interrupts
  - https://docs.langchain.com/oss/python/langgraph/persistence
- SWE-agent 与 SWE-bench：
  - https://arxiv.org/abs/2405.15793
  - https://www.swebench.com/verified.html
- subagent 调研中提到的 agent workflow 与 eval 资料：
  - https://www.anthropic.com/engineering/building-effective-agents
  - https://code.claude.com/docs/en/best-practices
  - https://developers.openai.com/api/docs/guides/agent-evals
  - https://modelcontextprotocol.io/specification/2025-06-18/server/tools

## 基于证据得到的约束

- V2 必须自包含；可以参考真实旧版仓库，但不能依赖过期 symlink 或旧安装态。
- Dashboard 不能成为流程真相来源；真相应来自 kernel state、schema、event log 和 artifact。
- 平台 adapter 必须薄；Claude slash command、Codex `AGENTS.md`、Cursor rules、MCP tools、shell runner 都应适配同一套核心 contract。
- subagent 工作必须按 run/artifact namespace 隔离，并由 coordinator 合并。
- 长任务必须能从 durable state 恢复，不能依赖聊天上下文记忆。

