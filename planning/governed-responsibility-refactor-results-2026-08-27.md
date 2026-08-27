# Governed Responsibility Refactor 验证结果

日期：2026-08-27

## 结论

本轮完成 Governed 热路径重构的 P0：

- 默认 Governed 从旧七节点切换为三个 Agent 判断节点：
  `delivery-design -> delivery-implementation -> delivery-review`。
- 保留 `governed-v1`，历史七节点 run 可继续读取和恢复。
- `execute` 只等待 Plan/Candidate 阶段；Kernel staged verification PASS 后
  才创建只读 Review Agent。
- Review evidence、verification report 和 merge 使用同一 candidate digest。
- 新增 `project drain`，由 Kernel 自动完成 collect、unlock、verify、review、
  integrate、learn 和 closure，只向 Agent 返回一个 `next_action`。
- cognitive Capability 不再允许绑定 deterministic shell；`test-strategy`
  在 Governed V2 中归入 Plan Agent。
- Review 默认使用 standard 模型，critical/security/migration 等能力才升级 strong。
- 自动 Governed 路由不再被普通 `security`、`auth` 或“恢复”字样误触发。

## 工程验证

- 全量测试：`665/665 PASS`
- 吞吐与 scheduler 回归：`12/12 PASS`
- Method Pack/Capability 聚焦测试：`15/15 PASS`
- 新增 Governed V2 durable closure 测试：
  - Review 不会在 verification 前创建
  - execute 不等待 Review
  - verification 与 review candidate digest 一致
  - merge、learning 和 `active_runs=[]` 完整关闭
- Contract 临时项目校验：`PASS`，114 个 schema，12 个持久 contract
- Strict project validate：`PASS`
- Project reconcile：`CONSISTENT`

## 已验证效果

相同 Governed 任务的默认 Agent 调用面从 6 个降为 3 个，减少 50%：

```text
旧：context + risk + design + implementation + tests + review
新：plan + implementation + review
```

PlanGraph 节点从 7 个降为 3 个，减少 57.1%。重复 verification worker 被删除，
权威测试只在 staged candidate 上由 Kernel 执行一次。插件不再要求 Agent 手工编排
多条 lifecycle CLI。

以上证明了调用面和流程往返的确定性下降，并保持现有工程质量门禁。

## 尚未证明

真实模型的 wall time、input/output token 和 hidden acceptance 仍需新的隔离
Product Benchmark。历史 benchmark 不能用于证明当前 candidate；在完成
candidate freeze、无并发预检和 usage capture 前，以下结论保持 `NOT_PROVEN`：

- wall time 是否达到 `<= 10 分钟`
- total tokens 是否达到 `<= 600k`
- 相对 V1 成本是否达到 `<= 3x`
- 三个不同真实任务是否连续达到 100% hidden acceptance 和 durable closure

## 后续项

以下属于 P1/P2，不阻塞本轮 P0 合并，但不能宣称已完成：

- Unified Evidence Artifact 与派生 Capability Receipt
- 基于收益模型的独立 Test Worker 动态拆分
- critical 场景的独立 Risk Challenger
- Learning proposal 语义去重
- 三任务 Raw/V1/V2 隔离 Product Benchmark
