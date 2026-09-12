# 模块 07 · 01 · Agent Loop / ReAct · step-2 并行 Act

> step-2 状态：**✅ 已锁定**（2026-09-10）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。学习者主动锁定后冻结。

## 端口

`50050`

## 跑入口

```bash
cd apps && yarn app:07-01-agent-loop-react-step-2
```

浏览器：[http://127.0.0.1:50050/](http://127.0.0.1:50050/)

## 数据流

```text
浏览器输入框 → fetch POST /api/agent-run { query }
       │
       ▼
koa bodyParser → routes/agent.ts Zod 校验
       │
       ▼
取 llm 客户端 → snapshotTodos() 当 todosBefore
       │
       │  while (round < MAX_ROUNDS=6)
       │    ├─ Reason：openai.chat.completions.create({ messages, tools })
       │    │   └─ assistant_message
       │    ├─ ① push assistant_message 进 messages
       │    ├─ tool_calls 为空 → 最终答案（变体 J） → break
       │    ├─ ② Act【step-2 增量】：Promise.all(toolCalls.map(...))
       │    │   每个 call 各自 try/catch + 模拟 50~250ms 外部 API 耗时
       │    │   完成顺序 ≠ toolCalls 数组顺序（按 handler 完成时机）
       │    │   整圈 tool 阶段耗时 = max(各 tool_call)，不是 sum
       │    └─ ③ Observe：把 tool 消息按 role:'tool', tool_call_id 追加进 messages
       │
       ▼
返回 { trajectory, finalAnswer, stoppedReason, rounds, finalMessages, todosBefore, todosAfter, diff }
       │
       ▼
React 按圈渲染：每圈一张卡 + 最终答案绿卡 + 并行对照卡片（变体 E）+ 数据前后对照三栏
```

服务端日志（`logs/YYYY-MM-DD.log`）每圈写：调用循环开始/结束 + 调用模型开始/结束 + 每个 tool_call 调函数结束（含并行汇总：`parallelMaxToolMs` vs `parallelSumToolMs` vs `savedMs`）。

## 当前能做什么

- 输入框默认「一次性把逾期购物待办都标完成」→ 点「跑 Agent」→ 真调 LLM 跑一整轮 Loop
- **期望看到 ≥ 2 圈**：第 1 圈 `list_todos` → 第 2 圈 `assistant.tool_calls.length = 4`（**变体 E 并行**）→ 4 个 complete_todo **同时**执行（每个 handler 模拟 50~250ms 延时）→ 整圈 tool 耗时 ≈ 最慢那个（不是相加）
- 轨迹区按圈展开：每圈显示 Reason（assistant 摘要 + tool_calls 或正文）/ Act+Observe（每个 tool_result 原文 + 是否成功）/ 圈耗时
- **并行对照卡片**（变体 E）：max(各 tool_call) vs sum(各 tool_call) + 节省 ms + handler 列表；让学习者肉眼看到「Promise.all vs for await」的差距
- 跑完可展开「完整 messages」看到 Loop 把 assistant+tool 一圈一圈追加进了什么
- 类 A 错误：发空字符串 → 400 黄字（Zod 校验）
- 类 B 错误：点「演示后端 5xx」→ 502 红字（教学用端点）
- 缺 Key 时主按钮 disabled，页脚 `密钥 ❌`

## step-2 教学点

- **本条「Agent Loop / ReAct」变体 E 并行 Act**：
  - 同一圈多个 tool_call：`Promise.all(toolCalls.map(...))` 同时启动
  - 整圈 tool 耗时 = `max(各 tool_call)`（不是 sum）—— 这是并行 vs 串行的本质差距
  - tool_result 塞回 messages 顺序 = 完成顺序 ≠ toolCalls 数组顺序（OpenAI 协议靠 tool_call_id 引用，顺序无关）
  - 每个 handler 模拟 50~250ms 延时让差异肉眼可见（生产里 handler 都是 100ms+ 的网络/DB/API 调用）
- **不在 step-2**：
  - 变体 G 失败 Observe 后继续（观察通道；step-1 雏形，step-3 专门做）
  - 变体 K 最大轮次作主教学点（仍仅兜底）
  - 变体 L 超时 / 变体 M 用户取消
  - 并行里某 handler 抛错 → Promise.all 立刻 reject 后怎么兜底（生产级 Promise.allSettled 演示 → 留给模块 19 可靠性）

## 对应学习沉淀

[docs/学习模块/07-手写Agent/01-Agent-Loop-ReAct.md](../../../docs/学习模块/07-手写Agent/01-Agent-Loop-ReAct.md)

## 下一步

- 学习者主动锁定 step-2 后 → 双方决定 step-3 加什么（按 §5.3.14）：
  - 变体 G 失败 Observe 后继续：故意把城市打成错别字 / 让 list 给空数组 → 看模型下一圈是否改参
  - 变体 K/L/M 主教学点：MAX_ROUNDS 调到很小跑「一直搜」型 query；或加 AbortSignal；或加用户取消按钮
  - 锁前 §5.3.2 6 项里缺的按需补（健康检查已含 / env-info 已含 / 两类错误 / loading 状态 / 自解释）
