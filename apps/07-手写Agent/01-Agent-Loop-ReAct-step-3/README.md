# 模块 07 · 01 · Agent Loop / ReAct · step-3 失败 Observe 后继续

> step-3 状态：**✅ 已锁定**（2026-09-10）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。学习者主动锁定后冻结。

## 端口

`50051`

## 跑入口

```bash
cd apps && yarn app:07-01-agent-loop-react-step-3
```

浏览器：[http://127.0.0.1:50051/](http://127.0.0.1:50051/)

## 数据流

```text
浏览器输入框 → fetch POST /api/agent-run { query: "把 todo-999 标完成" }
       │
       ▼
koa bodyParser → routes/agent.ts Zod 校验
       │
       ▼
取 llm 客户端 → snapshotTodos() 当 todosBefore
       │
       │  while (round < MAX_ROUNDS=6)
       │    ├─ 圈 1 Reason：模型要 complete_todo(id="todo-999")
       │    │   └─ Act：handler 查 STORE 找不到 → 返回 {ok:false, error:"not_found"}
       │    │   └─ Observe：错误结构化进 messages（**变体 G 关键**：不 throw，Loop 不死）
       │    ├─ 圈 2 Reason：模型看见 not_found → 改参 list_todos(tag="购物") 找真 id
       │    │   └─ Act：返回 4 条逾期购物 todo
       │    │   └─ Observe：进 messages
       │    ├─ 圈 3 Reason：模型用真 id → complete_todo(id="todo-001")
       │    │   └─ Act：返回 {ok:true, todo: {...done:true}}
       │    │   └─ Observe：进 messages
       │    ├─ 圈 4 Reason：tool_calls 空 → 最终答案 → break
       │
       ▼
返回 { trajectory, finalAnswer, stoppedReason, todosBefore, todosAfter, diff }
       │
       ▼
React 渲染：trajectory 按圈 + 失败 Observe 卡片（failedCount + 首末失败 round）+ 数据前后对照三栏
```

服务端日志（`logs/YYYY-MM-DD.log`）每圈写：调用循环开始/结束 + 调用模型开始/结束 + 失败 tool_call 调函数结束（标「失败」· ok:false）。

## 当前能做什么

- 输入框默认「把 todo-999 标完成」→ 点「跑 Agent」→ 真调 LLM 跑一整轮 Loop
- **期望看到 3~4 圈**：第 1 圈 complete_todo(todo-999) **失败 Observe**（红底 `{ok:false, error:"not_found"}`） → 第 2 圈模型改参（list_todos / 换 id） → 第 3 圈 complete_todo 成功 → 第 4 圈最终答案
- **「失败 Observe 后改参」卡片**：变体 G 关键观察。统计 failedCount（故意触发次数）+ 首末失败 round + 强调「handler throw vs 返回结构化错误」对 Loop 自纠的影响
- trajectory 区按圈展开：每圈显示 Reason（assistant 摘要 + tool_calls 或正文）/ Act+Observe（每个 tool_result 原文 + 成功/失败红绿徽标）/ 圈耗时
- 数据前后对照三栏（diff 应只列真正成功那条 todo 的改动）
- 类 A 错误：发空字符串 → 400 黄字（Zod 校验）
- 类 B 错误：点「演示后端 5xx」→ 502 红字（教学用端点）
- 缺 Key 时主按钮 disabled，页脚 `密钥 ❌`

## step-3 教学点

- **本条「Agent Loop / ReAct」变体 G 失败 Observe 后继续**：
  - handler **不 throw** → 返回 `{ok:false, error:"not_found"}` 结构化错误 → 当 tool_result 写进 messages
  - 下一圈模型**看见错误** → 改参（list 找真 id / 换正确 id / 改 query）
  - Loop **不死**，最终能完成
  - 这是 Act「副作用 + 失败」的双重防护：成功有 trajectory，失败也有 trajectory
- **对照「handler throw vs 返回结构化错误」**：
  - `throw new Error(...)` → loop 里 try/catch 兜底 → 错误进 messages（loop.ts 已有此分支）→ 但 messages 里是 Error 对象序列化，**模型看不见人话错误**
  - **返回 `{ok:false, error:"...", message:"..."}`** → messages 里是 JSON 字符串 → **模型能读懂** → 下一圈改参
- **不在 step-3**：
  - 变体 K MAX_ROUNDS 主教学点（仍兜底）
  - 变体 L 超时 / 变体 M 用户取消
  - 失败 handler 真的 throw 500（演示错误通道对比）—— 留 step-4（让两类错误通道都能演示）

## 对应学习沉淀

[docs/学习模块/07-手写Agent/01-Agent-Loop-ReAct.md](../../../docs/学习模块/07-手写Agent/01-Agent-Loop-ReAct.md)

## 下一步

- 学习者主动锁定 step-3 后 → 双方决定 step-4 加什么（按 §5.3.14）：
  - 变体 K MAX_ROUNDS 当主教学点：`MAX_ROUNDS=2` 跑「再查一次」型 query，看 round 打到 2 就停
  - 变体 L 超时：`Promise.race` + handler `await sleep(5000)`，看墙钟到点 Loop 中断
  - 变体 M 用户取消：前端「取消」按钮 + AbortSignal + 中断下一圈 Reason
  - 失败 handler **真的 throw** 看 500 通道 + 错误信息能不能进 messages 模型改参（对照 step-3 的「返回结构化错误」）
  - 锁前 §5.3.2 6 项里缺的按需补（健康检查已含 / env-info 已含 / 两类错误 / loading 状态 / 自解释）
