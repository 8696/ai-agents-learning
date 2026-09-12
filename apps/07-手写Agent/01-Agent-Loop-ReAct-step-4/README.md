# 模块 07 · 01 · Agent Loop / ReAct · step-4 用户取消

> step-4 状态：**✅ 已锁定**（2026-09-10）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。学习者主动锁定后冻结。

## 端口

`50052`

## 跑入口

```bash
cd apps && yarn app:07-01-agent-loop-react-step-4
```

浏览器：[http://127.0.0.1:50052/](http://127.0.0.1:50052/)

## 数据流

```text
浏览器输入框 → fetch POST /api/agent-run { query: "一次性把逾期购物待办都标完成" }
       │
       ▼
202 + { runId, startedAt, query }   ← 后端立刻返，不阻塞 HTTP 连接
       │
       │  后端同时：registerRun(runId, controller) + 存 todosBefore
       │    → 异步启动 runAgentLoop({ signal: controller.signal, ... })
       │       while (round < MAX_ROUNDS && !signal.aborted)
       │         ├─ 圈 1 Reason：模型要 list_todos → Act+Observe → 写 messages
       │         ├─ 圈 2 Reason：模型要 4 个 complete_todo 并行 → Promise.all → tool_results
       │         └─ 若此时浏览器点「🚫 取消」→ routes/cancel.ts controller.abort()
       │             └→ 下一次 LLM 调用抛 AbortError → while break → stoppedReason="cancelled"
       │
       ▼
浏览器轮询 GET /api/agent-run/:runId （每 800ms 一次）
       │
       ├─ 202 + { status: "running", elapsedMs }           ← 继续轮询
       ├─ 200 + { status: "done", trajectory, ... }        ← 自然完成（final_answer / max_rounds）
       ├─ 200 + { status: "cancelled", trajectory, ... }   ← 用户取消（变体 M）
       └─ 502 + { error: "upstream_failed", ... }          ← 真后端错误
```

服务端日志（`logs/YYYY-MM-DD.log`）每轮写：调用循环开始/结束 + 调用模型开始/结束 + 「用户取消」日志 + 后台 loop 收尾（finishRun / errorRun）。

## 当前能做什么

- 输入框默认「一次性把逾期购物待办都标完成」→ 点「跑 Agent」→ 真调 LLM 跑一整轮 Loop
- **立刻看到状态**：右上角状态徽标变黄 `🔄 Loop 跑中`，下方显示 runId + 已用时
- **点「🚫 取消」按钮**：发 POST /api/cancel/:runId → 后端 AbortController.abort() → 下一次 LLM 调用抛 AbortError → loop break
- **期望看到**：
  - 状态徽标变紫 `🚫 已取消 · 用户取消（变体 M）`
  - trajectory 完整保留到取消前的最后一圈（**关键**：被取消那一圈标红边框）
  - stoppedReason = `cancelled`（不是 max_rounds / final_answer / error）
  - 数据前后对照三栏：取消时若 Act 已完成部分 → diff 列出「已发出没回滚」的条数；若在圈 1 取消 → diff 为空
- **不取消**：loop 自然走完，stoppedReason = `final_answer`，状态徽标变绿 `✅ 最终答案`
- 类 A 错误：发空字符串 → 400 黄字（Zod 校验）
- 类 B 错误：点「演示后端 5xx」→ 502 红字（教学用端点）
- 缺 Key 时主按钮 disabled，页脚 `密钥 ❌`

## step-4 教学点（变体 M 用户取消）

- **物理动作**：AbortController.abort() 让下一次 LLM 调用立刻抛 AbortError（OpenAI SDK 透传 signal）
- **设计关键**：
  - POST /api/agent-run 立刻返 202 + runId（**不阻塞** HTTP 连接）→ 浏览器才能「独立」发取消请求
  - GET /api/agent-run/:runId 轮询拿结果（**不**用 SSE / WebSocket → 复杂度可控）
  - 「取消」是**独立**的一笔请求（POST /api/cancel/:runId）→ 跟主请求解耦
- **Loop 改动（lib/flow/loop.ts）**：
  - 加 `signal?: AbortSignal` 入参
  - while 起点检测 `signal?.aborted` → break + `stoppedReason = "cancelled"`
  - `openai.chat.completions.create(request, { signal })` 透传
  - catch AbortError 区分于真后端错误（502）—— AbortError 不冒出去，让 loop 收尾
  - cancelled 时 finalAnswer 用清晰文案 `（用户已取消 · 未给出最终答案）`，不写「未收敛」
- **关键边界（变体 M 的妥协）**：
  - **已发出的 tool handler 不感知 signal**（变体 M 不演示「已发出也能取消」）
  - 让那一圈 Act 跑完（MD 例子 5 「知识库已发出则在轨迹写『用户取消』」）
  - trajectory 仍完整保留能看见「跑到哪圈被取消」
- **对照其他停止条件**：
  - 变体 J 最终答案：绿 `✅`，stoppedReason = `final_answer`
  - 变体 K MAX_ROUNDS：兜底黄 `⚠`，stoppedReason = `max_rounds`（本 step 不指望触发）
  - **变体 M 用户取消**：紫 `🚫`，stoppedReason = `cancelled`（本 step 主教学点）

## 对应学习沉淀

[docs/学习模块/07-手写Agent/01-Agent-Loop-ReAct.md](../../../docs/学习模块/07-手写Agent/01-Agent-Loop-ReAct.md)

## 下一步

- 学习者主动锁定 step-4 后 → 双方决定 step-5 加什么（按 §5.3.14）：
  - 变体 K MAX_ROUNDS 当主教学点：`MAX_ROUNDS=2` 跑「再查一次」型 query，看 round 打到 2 就停
  - 变体 L 超时：`Promise.race` + handler `await sleep(5000)`，看墙钟到点 Loop 中断
  - 变体 M 增强：tool handler 也透传 signal（已发出的 Promise.all 也能取消）
  - 失败 handler **真的 throw** 看 500 通道 + 错误信息能不能进 messages 模型改参（对照 step-3 的「返回结构化错误」）
- 锁前 §5.3.2 6 项里缺的按需补（健康检查已含 / env-info 已含 / 两类错误 / loading 状态 / 自解释）