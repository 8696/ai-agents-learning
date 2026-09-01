# Demo · 429 / Rate Limit · 分类重试 + 退避 + jitter + 上限

对应小节：[docs/学习模块/02-LLM-API开发/04-Rate-Limit.md](../../../docs/学习模块/02-LLM-API开发/04-Rate-Limit.md)

## 怎么跑

```bash
cd apps
yarn install                                                # 第一次或新加依赖时
yarn app:02-04-rate-limit                                  # mock 5 个场景 + 真 API 单次
BURST=1 yarn app:02-04-rate-limit                          # 上面 + 并发 20 真请求撞 429
```

启动后做三件事：
1. **CLI 时间线**：终端打印 5 个 mock 场景 + 真 API 单次（如果 `apps/.env` 里有 Key）。
2. **浏览器页面**：打开 `http://127.0.0.1:5176/`，点按钮跑同样场景（端口由 `PORT` 环境变量覆盖）。
3. **真 API**：⑥ 单次默认跑；⑦ 并发 20 在 `BURST=1` 时 CLI 才跑，浏览器里按钮可直接点（按需烧 token）。

按 Ctrl+C 退出。

> **mock 部分不调云端 API**；⑥⑦ 需要 `apps/.env` 里有 `MINIMAX_API_KEY`。
> ⑥ 单次 ≈ 0.001 元；⑦ 并发 20 ≈ 0.02 元（按 `completion_tokens` 计）。

## 端点对照

### Mock 端点（零成本，确定性）

| 端点 | 行为 | 看什么 | 本条要能讲清 → 落点 |
| --- | --- | --- | --- |
| `GET /api/easy` | 前 2 次 429 + `Retry-After: 0.5`，第 3 次 200 | 听 `Retry-After` → 至少等 500ms → 第 3 次成功 | 退避动机（4.1） / Retry-After（4.2） |
| `GET /api/chaos` | 30% 429 / 20% 500 / 50% 200，每次随机 | 连跑 6 次 → 6 组 waitBefore 数值带随机偏移 | Jitter 防 thundering herd（4.4） |
| `GET /api/auth` | 永远 401 | 只有 1 行 attempt，立刻抛 `NonRetryableError` | 不可重试分类（4.5） |
| `GET /api/forever` | 永远 429 + `Retry-After: 0.3` | 4 行 attempt → 抛 `RetryExhaustedError` | maxAttempts 上限（4.8） |
| `GET /api/ok` | 永远 200 | 1 行 attempt，waitBefore=0 | 成功路径不重试（4.1 / 4.3） |

### 真 API 端点（需 `apps/.env` 里有 `MINIMAX_API_KEY`）

| 端点 | 行为 | 看什么 | 成本 |
| --- | --- | --- | --- |
| `GET /api/real` | 单次真调 MiniMax，套 retry | 真网络耗时（~100~500ms vs mock 的 1ms）/ 真错误结构 / 偶发 retry | ~0.001 元 |
| `GET /api/real-burst?concurrency=20` | 并发 N 个真请求，每个独立套 retry；统计成功/失败/状态码分布 | **真 429 + 真 Retry-After 头** | ~0.02 元（默认 CLI 不跑，浏览器按钮 / `BURST=1` 才跑） |

## CLI 输出示例（截一段）

```
▶ ① /api/easy     （前 2 次 429 + Retry-After → 第 3 次 200）
  ┌─ attempt ─ status ─ waitBefore ─ Retry-After ─ duration ─ body
  │ #1      429       0ms        500ms      8ms       {"error":"rate_limit_exceeded"…
  │ #2      429       510ms      500ms      6ms       {"error":"rate_limit_exceeded"…
  │ #3      200       502ms      —          7ms       (无 body)
  └─
  ✅ 最终成功：{"id":"chatcmpl-easy","content":"你好，我是 mock LLM（easy）",…}
```

## 浏览器页面看什么

| 按钮 | 看什么 |
| --- | --- |
| ① easy | attempt 1 / 2 = 429（黄），attempt 3 = 200（绿）；waitBefore ≥ 500ms（因为 Retry-After: 0.5） |
| ② chaos × 6 | 6 次连跑，**对比每行的 waitBefore**——jitter 让每次的等待时长带随机偏移；同一 attempt 序号也会不一样 |
| ③ auth | 只 1 行 attempt，401（蓝），立刻 `NonRetryableError` |
| ④ forever | 4 行全 429（黄），最终 `RetryExhaustedError`（红） |
| ⑤ ok | 1 行 200（绿），waitBefore=0 |
| ⑥ 真 API 单次 | 调一次 MiniMax；通常直接 200 + 真实耗时；偶发网络抖动看到 retry |
| ⑦ 真 API 并发 20 | 看真 429 + 真 Retry-After 头；每次消耗 token（按需点） |

## 关键代码

- `retry.ts`：`retryWithBackoff(fn, opts)` 主入口；`NonRetryableError` / `RetryExhaustedError` 两类错误；每次 attempt 写入 `AttemptRecord`。
- `index.ts`：mock server 5 个端点 + `/api/proxy` 套 retry + CLI 跑 6 个场景 + 浏览器页面入口。
- `public/index.html`：5 个按钮 + 时间线表（颜色按状态码分）。

## 概念 / 取舍 / 踩坑

在 [04-Rate-Limit.md](../../../docs/学习模块/02-LLM-API开发/04-Rate-Limit.md)。
