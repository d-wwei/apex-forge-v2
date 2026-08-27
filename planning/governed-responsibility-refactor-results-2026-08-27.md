# Governed Responsibility Refactor 验证结果

日期：2026-08-27

## 结论

本轮完成 Governed Responsibility Refactor 的工程实现：

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
- critical 场景增加独立 Risk Challenger；大型、明确要求并行且写域互斥时
  才拆出 Test Worker。
- Host、Factory Worker 和 Shell Worker 均生成统一 Evidence Artifact；
  Capability Receipt 由 Kernel 派生，旧 evidence 文件继续作为兼容投影。
- Browser/Mobile/Performance/Deploy 等环境能力必须调用真实 provider command；
  仅声明 provider 或普通测试通过不能生成 Capability Receipt。
- blocking Review 生成 durable rework request、淘汰旧 patch，并重新打开
  Candidate/Verification；新 candidate 必须重新 Review。
- 无 `learning:` 明确信号时不再固定生成三条模板 Learning proposal；
  相同规则跨 run 去重。
- Product Benchmark controller 支持独立 `--task-set`、可选 mode、安全
  `--run-root` 和 candidate/base/mode 四重 identity。
- 新 canary 使用 `raw-agent / v1-skill / plugin-kernel`，不再用 CLI Kernel
  冒充裸 Agent。

## 工程验证

- 全量测试：`688/688 PASS`
- 吞吐与 scheduler 回归：`12/12 PASS`
- Provider 结构化输出回归：`6/6 PASS`
- Benchmark controller/evaluator/provenance 回归：`44/44 PASS`
- Plugin package/native lifecycle：`12/12 PASS`
- 新增 Governed V2 durable closure 测试：
  - Review 不会在 verification 前创建
  - execute 不等待 Review
  - verification 与 review candidate digest 一致
  - merge、learning 和 `active_runs=[]` 完整关闭
- Review BLOCK/CONDITIONAL 会生成 durable rework request，旧 patch 标记
  `dropped`，重新验证后的新 reviewer 不复用旧 evidence。
- Unified Evidence 同时覆盖 Host 和 Factory Worker；旧格式仍可读取，新格式由
  Kernel 生成 attempt-specific legacy projection 与 Capability Receipt。
- Benchmark subset/controller identity/isolated artifact path 回归通过。
- 独立复审确认此前发现的 rework、Receipt、Provider schema 和 benchmark
  隔离问题均已关闭。
- Contract 临时项目校验：`PASS`，118 个 schema，12 个持久 contract
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

## 待真实 Benchmark 证明

真实模型的 wall time、input/output token 和 hidden acceptance 仍需新的隔离
Product Benchmark。历史 benchmark 不能用于证明当前 candidate；在完成
candidate freeze、无并发预检和 usage capture 前，以下结论保持 `NOT_PROVEN`：

- wall time 是否达到 `<= 10 分钟`
- total tokens 是否达到 `<= 600k`
- 相对 V1 成本是否达到 `<= 3x`
- 三个不同真实任务是否连续达到 100% hidden acceptance 和 durable closure

工程实现完成不等于效果目标完成。只有新的三任务 Raw/V1/V2 隔离 Product
Benchmark 通过后，才能把上述 `NOT_PROVEN` 改为 `PASS`。
