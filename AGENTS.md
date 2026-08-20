<!-- BETTER-WORK:BEGIN -->
# Apex Forge V2

Apex Forge V2 是 Node.js ESM CLI/Agent orchestration platform。开始工作前读取：

- `.better-work/shared/index.md`
- `.better-work/code/protocol.md`

关键入口：

- Host workspace：`src/commands/host.mjs`
- Candidate pipeline：`src/commands/integration.mjs`
- Transactions：`src/core/project-transaction.mjs`
- Contracts：`src/core/contracts.mjs` 与 `schemas/`
- 最终计划：`planning/plugin-upgrade-plan.md`

当前发布状态：`BLOCKED_FOR_RELEASE`；Phase A 完成前不得把 live-workspace
Interactive patch 作为安全默认能力。

# Code Protocol

- 改文件前查 `.better-work/code/danger-zones.md`
- 用新模式前查 `.better-work/code/conventions.md`
- 高风险迁移先写 failing adversarial test
- 完成前跑相关测试、contracts、strict validate
- 没有 durable evidence 的工作不得标记 COMPLETE
<!-- BETTER-WORK:END -->
