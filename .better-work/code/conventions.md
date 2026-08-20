# Coding Conventions

## 持久 JSON 必须走原子写入口

✓ 正确：

```js
// src/core/run-state.mjs
writeJson(join(root, "runs", run.run_id, "run.json"), run);
```

✗ 错误：

```js
writeFileSync(path, JSON.stringify(run));
```

为什么：`writeJson()` 会触发 contract validator，并通过临时文件、fsync、rename 原子提交；直接写会绕过这些保证。（source: `src/lib/common.mjs:39-73`, `src/core/contracts.mjs`）

## Patch path 先验证再 join

✓ 正确：

```js
// src/core/worker.mjs
assertSafeRelativePath(operation.path);
const target = join(projectDir, operation.path);
```

✗ 错误：

```js
const target = join(projectDir, untrustedPath);
```

为什么：未经验证的绝对路径、`..` 或 NUL 可越出项目根或破坏其他文件。（source: `src/lib/common.mjs:93-97`, `src/core/worker.mjs:156-181`）

## 状态变化必须同时留下 event

✓ 正确：

```js
const event = appendEvent(root, "worker.created", "apex-v2", payload);
updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
```

✗ 错误：

```js
writeJson(workerPath, worker);
return worker;
```

为什么：没有 event 的 authority 变化无法 replay、审计或 reconcile。（source: `src/core/worker.mjs:47-58`, `src/core/store.mjs`）

## Event 时间必须服从锁内落盘顺序

✓ 正确：获取 project lock 后再生成 event ID/timestamp，并以当前
`ProjectState.updated_at` 为下界生成严格递增时间。

✗ 错误：在等待 project lock 之前调用 `now()`，随后把旧 timestamp 的 event
追加到其他进程新 event 之后。

为什么：文件追加虽然原子，但 timestamp 逆序会触发 `non-monotonic-event-time`，
使 replay/reconcile `INVALID` 并产生 false completion。（source:
`src/core/store.mjs`, `src/core/reconcile.mjs`,
`tests/store-atomicity.test.mjs`）

## Cognitive 与 deterministic completion 分离

✓ 正确：

```js
if (worker.execution_class !== "deterministic_check") {
  throw new Error("shell adapter 只允许 deterministic_check");
}
```

✗ 错误：

```js
if (commandExitCode === 0) worker.status = "evidence_submitted";
```

为什么：shell PASS 不能证明 context、risk、design 或 review 的语义质量。（source: `src/core/worker.mjs`, `planning/plugin-upgrade-plan.md`）

## 新能力先扩 contract，再扩实现

✓ 正确：先更新 code contract/JSON Schema/fixtures，再实现 command 和 persistence。

✗ 错误：只在 CLI handler 添加字段，依赖 migration 在读取时猜测。

为什么：Apex Forge 的持久对象必须跨 CLI、Plugin、Host 和 Worker 保持同一语义。（source: `src/core/contracts.mjs`, `schemas/`, `tests/contract-authority.test.mjs`）

## Verification 到 Merge 必须绑定 Candidate Digest

✓ 正确：verification、review、approval、integration report 使用同一
`candidate_digest`，merge 前重新计算并比较。

✗ 错误：只比较 patch ID、queue status 或历史 PASS。

为什么：patch 内容、queue 顺序、resolution、verification policy 或 base source
任一变化都必须让旧证据失效。（source: `src/core/candidate.mjs`,
`src/commands/integration.mjs`, `tests/candidate-integrity.test.mjs`）

## Hidden benchmark checks 必须留在 controller 外侧

✓ 正确：Agent 只收到 public task/acceptance；controller 在 Agent 退出后独立运行
hidden checks，并保存 raw logs 与 artifact hashes。

✗ 错误：把 `hidden_checks` 写入 task workspace、prompt 或 Plugin evidence。

为什么：泄漏 hidden checks 会把产品验证退化成针对答案写代码；no-op task 也必须先经
clean/injected preflight 证明。（source: `scripts/preflight-benchmark-tasks.mjs`,
`src/benchmark/result-evaluator.mjs`）

## Benchmark 结果必须重新验证内容身份

✓ 正确：results manifest 绑定 candidate/task-set 与 result SHA256；每条 result
记录所有 process attempts 的 artifact refs/hashes，Product Gate 重新读取并校验。

✗ 错误：只验证 result JSON schema，或相信 `artifact_hashes` 字段存在就代表原始
日志没有变化。

为什么：结果、日志或恢复 attempt 在生成后被修改，会制造不可复现的 Product PASS。
（source: `src/benchmark/result-provenance.mjs`,
`scripts/product-benchmark-controller.mjs`,
`tests/benchmark-result-provenance.test.mjs`）

## Release candidate 只按内容寻址

✓ 正确：在独立 clean snapshot 中构建，固定 build timestamp，绑定 source/runtime/
schema/plugin/policy/matrix/task hashes。

✗ 错误：用当前 dirty 标记、文件路径或生成时间作为 candidate 身份。

为什么：benchmark 与 release 必须能重建同一 digest，且本地 `source_path` 不得污染
portable matrix hash。（source: `src/release/candidate-bundle.mjs`,
`scripts/build-codex-plugin.mjs`）
