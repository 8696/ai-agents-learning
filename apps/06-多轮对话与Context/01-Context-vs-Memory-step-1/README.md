# 模块 06 · 01 · Context vs Memory · step-1 最小可观察

> step-1 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50038`

## 跑入口

```bash
cd apps && yarn app:06-01-context-vs-memory-step-1
```

浏览器：[http://127.0.0.1:50038/](http://127.0.0.1:50038/)

## 数据流

```text
浏览器输入框 → React state (messages)
       │
       │  POST /api/chat  { messages: [...] }   ← 这就是 Context
       ▼
koa bodyParser → routes/chat.ts Zod 闸门
       │
       │  messages 原样发给 llm.openai.chat.completions.create
       ▼
真模型（协议 A）→ 返回 assistant message
       │
       │  fullMessages = messages + 新 assistant
       ▼
返回 { reply, messages, totalTokens, promptTokens, completionTokens }
       │
       ▼
React setMessages(data.messages) → 下一次发送把这份整个发给模型
```

服务端日志（`logs/YYYY-MM-DD.log`）每次请求打完整 messages + token 估算 + 模型返回值 + 耗时。

## 当前能做什么

- 输入框写一句 user → 点「发送」→ 调真模型
- 助手回复合进 messages → 页面 #output 列出当前 messages 数组 + 粗估 token 总数
- 再发一条 → Context 在累积（messages 越来越长）
- 点「清空对话」→ messages 归零 → 下次发送模型看不到历史（演示 Context 没了）
- 服务端 logs/ 每天一个文件，每次请求都能翻完整 messages 看「Context 长什么样」

## step-1 教学点

- **本条「Context vs Memory」的 Context 这一半**：
  - 客户端 messages 数组 = 本轮 Context
  - 服务端 logs/ 是把 Context「外化」出来给人看
  - 「清空对话」演示 Context 跟一次会话绑定的生命周期
- **不在 step-1**：Memory（持久化跨会话的偏好/事实/技能）。等 step-2 起才加。

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/01-Context-vs-Memory.md](../../../docs/学习模块/06-多轮对话与Context/01-Context-vs-Memory.md)

## 下一步

- 学习者主动锁定后 → 双方决定 step-2 加什么（按 §5.3.14）：
  - M2 偏好跨会话持久化（写入 / 注入 / 覆盖 / 删除）—— 演示 Memory 的 4 个操作变体
  - 持久化用什么：先 SQLite（与模块 07 / 模块 10 接口对齐）
  - 何时写：用户消息里命中"我叫 / 我偏好"等显式触发
- 锁定前 §5.3.2 6 项里缺的（健康检查已含 / env-info 已含 / 两类错误 / loading 状态）按需补