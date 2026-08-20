# Code Protocol

## 改动前自检
- 改文件前查 `.better-work/code/danger-zones.md`；涉及条目时执行其检查命令
- 用新模式前查 `.better-work/code/conventions.md`；重构前搜索所有引用方
- 高风险状态迁移先写 failing adversarial test，再写实现

## 完成前自检
- 跑相关测试、contracts、strict validate，并报告真实结果
- 修改持久状态、event、candidate 或 workspace 行为时补 failure/interruption 测试
- 改动影响 danger zones / conventions 时同步更新知识文件
- 没有 durable evidence 的工作不得标记 COMPLETE
