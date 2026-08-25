# Apex Forge R1 效果验证报告

日期：2026-08-25

## 结论

当前结论为：

- **Quick：PASS_PILOT**
- **普通 bug-fix：PASS_PILOT**
- **Governed：NO_GO**
- **整体性价比提升：NOT_PROVEN**

R1 已证明轻任务路径可以在不降低本轮质量指标的前提下降低耗时和
token；但 Governed 路径仍存在明显的长尾成本和闭环不稳定性，不能作为默认路径。

## 测试边界

- 模型：`gpt-5.6-terra`
- reasoning effort：`medium`
- 执行方式：同机严格串行，无并发 benchmark
- 基准仓库：`apex-manager`、`agent-recall`
- 场景：`simple`、`bug-fix`、`review-defect`
- 对照：Apex Forge V1 Skill 与 Apex Forge V2 Plugin Kernel
- 成本字段：`input_tokens + output_tokens`
- `reasoning_tokens` 仅作为 output breakdown，不重复计费
- 未配置公开价格表，因此不声称美元成本

## 结果

### 轻任务与普通 Bug

以下两组来自 Candidate
`cd364ec1dc7003dd3bf3269479319b6f60bda24fa0ec40845e09b87da7ce0c5e`。
之后的代码变化只针对 Governed nested worker 的结构化输出和运行时元数据。

| 场景 | V1 耗时 | Plugin 耗时 | 耗时变化 | V1 Token | Plugin Token | Token 变化 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 92.1 秒 | 69.7 秒 | -24.3% | 197,943 | 80,594 | -59.3% |
| bug-fix | 85.3 秒 | 79.4 秒 | -6.9% | 145,682 | 80,237 | -44.9% |

两组均满足：

- public acceptance PASS
- hidden checks PASS
- scope safety PASS
- false completion 为 false
- Plugin durable closure PASS

两组合计：

- 耗时下降约 `15.9%`
- Token 下降约 `53.2%`

该结果只支持“轻量路径有明显收益”的 Pilot 结论，样本量不足以外推到全部任务。

### 高风险 Review Defect

当前最终 Candidate：
`5b17dac0a3d919dbff9d3cb13416304da4ca0a1c0b51f8ec046a66d2586c381f`

| 指标 | V1 Skill | Plugin Governed |
| --- | ---: | ---: |
| 耗时 | 73.5 秒 | 994.5 秒 |
| Token | 188,968 | 2,709,262 |
| Uncached input | 27,467 | 95,754 |
| Hidden acceptance | 100% | 50% |
| Safety | 100% | 100% |
| Durable closure | 0% | 0% |

相对 V1：

- Governed 耗时约 `13.53x`
- Governed 总 token 约 `14.34x`
- Governed uncached input 约 `3.49x`

Plugin 已生成实现和测试 patch，但未完成 enqueue/merge，最终没有把修复落入项目根。
因此本样本按质量与交付结果判定为失败。

作为稳定性旁证，前一 Candidate 曾在同一场景完成全部 hidden checks 和 durable
closure，但耗时约 `17.5 分钟`、token 约 `480 万`。这说明 Governed 不是完全不能
完成，而是当前成功成本过高且结果不稳定。

## 本轮修复

- prepared source 由 Git object 和实际文件内容重新计算，不能再靠
  `.benchmark-source.json` 自报。
- result provenance 增加 source tree 和 source manifest 绑定。
- hidden task、result、controller、Git 历史和旧 benchmark 报告加入 sandbox
  deny-read。
- Agent 只可写 workspace、隔离 Codex home 和 agent IO，不再可写整个 run root。
- macOS `/var` 与 `/private/var` 路径归一化，确保 deny-read 真正生效。
- benchmark workspace 使用隔离依赖副本，避免通过 `node_modules` symlink 读取
  hidden base source。
- 修正 token 统计，reasoning token 不再与 output token 重复相加。
- 跨 arm 按同一 task 校验 environment fingerprint。
- 增加 provider-compatible structured-output schema，返回后仍执行 canonical
  schema 校验。
- 支持从 Codex JSONL 和 direct stdout 两种形态恢复结构化结果。
- cognitive worker 明确区分“完成风险分析”和“产品无风险”。
- scheduler lock、executor home 等运行时元数据不再被误判为产品源码变化。

## 验证证据

- Clean worktree 全量测试：`644/644 PASS`
- 修复后相关回归：`96/96 PASS`
- 最后新增回归集合：`45/45 PASS`
- 旧全量失败中的 4 个 merge scope、1 个 extension boundary、1 个 supervisor
  cleanup 用例已定向复测：`6/6 PASS`
- Contract：`114 schemas / 1342 validations PASS`
- Strict validate：PASS
- Throughput deterministic benchmark：`11/11 PASS`
- Plugin build、Codex/Claude validation 与本地安装：PASS
- Provider-compatible schema live smoke：PASS
- 磁盘与 deleted-open file 检查：PASS

## 判定

1. 默认入口应继续优先使用 Quick。
2. 普通 bug-fix 可使用 Quick/Disciplined，但需要扩大样本后再确定自动路由阈值。
3. Governed 不应作为默认流程，也不应继续通过增加节点解决问题。
4. Governed 下一步必须把 orchestration 从顶层 Agent 的 CLI 探索迁入确定性
   controller，并设置总模型调用、总 token、重试和 wall-time 熔断。
5. 在 Governed 能稳定完成且成本降到 V1 的 `3x` 以内前，不启动 90-run 正式
   Product Benchmark，也不发布“整体提效”结论。

## 证据位置

- 当前 Governed：
  `benchmarks/plugin-vs-v1/results/5b17dac0a3d919dbff9d3cb13416304da4ca0a1c0b51f8ec046a66d2586c381f/`
- 轻任务与普通 bug-fix：
  `benchmarks/plugin-vs-v1/results/cd364ec1dc7003dd3bf3269479319b6f60bda24fa0ec40845e09b87da7ce0c5e/`
- 历史独立审计：
  `/Users/admin/Documents/AI/Apex-forge/benchmark-runs/quality-cost-audit/INDEPENDENT_AUDIT_REPORT_2026-08-25.md`
