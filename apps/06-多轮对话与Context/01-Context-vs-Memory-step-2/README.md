# 模块 06 · 01 · Context vs Memory · step-2 Memory 持久化

> step-2 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过 + 闸门 3 独立 subagent 验证 49/49 已实现（0 未实现）。冻结；要改 bug 走 §5.3.14 锁后修。

## 端口

`50039`

## 跑入口

```bash
cd apps && yarn app:06-01-context-vs-memory-step-2
```

浏览器：[http://127.0.0.1:50039/](http://127.0.0.1:50039/)

## 数据流

```text
浏览器输入框 → React state (messages)
       │
       │  POST /api/chat  { messages: [...] }
       ▼
koa bodyParser → routes/chat.ts Zod 闸门
       │
       │  routes/chat.ts: kvList("default") → userPrefs
       │  baseSystem = "..." + JSON.stringify(userPrefs)   ← Memory 注入段（前端 React state 看不到）
       │  finalMessages = [{system: baseSystem}, ...messages.filter(m=>m.role!=="system")]
       │
       ▼
llm.openai.chat.completions.create(finalMessages)   ← 模型看到完整 Context（含注入段）
       │
       ▼
返回 { reply, messages: fullMessages, totalTokens, promptTokens, completionTokens }
       │
       ▼
React setMessages(data.messages) → 下一次发送把这份整个发给模型

       === 同时 ===
浏览器偏好输入框 → React state (prefKey, prefValue)
       │
       │  POST /api/memory  { key, value }
       ▼
routes/memory.ts: kvSet("default", key, value) → preferences.db (SQLite)
       │
       │  GET /api/memory  → kvList("default") → { preferences }
       ▼
React setPreferences → 页面 #memory-list 刷新
```

服务端日志（`logs/YYYY-MM-DD.log`）：
- `chat.handler` 每次请求打 `data.入参.fromMemory` + `data.入参.request.messages[0]`（注入段完整内容）+ token 估算 + 模型返回值 + 耗时
- `memory.set / list / del` 每次操作打开始 / 入参 / `__code` / 返回值 / 耗时

## 当前能做什么

- 输入框写一句 user → 点「发送」→ 服务端从 db 读偏好 → 拼到 system → 调真模型
- 助手回复合进 messages；页面 #output 列出当前 messages + 底部紫色卡片展示「本轮已注入的 Memory 段」（前端从 GET /api/memory 拉的快照，不是 system 真副本）
- 在「记住偏好」区填 key（如 `language`）+ value（如 `zh`），点「记住偏好」→ 写入 preferences.db → 「已记住的偏好」列表实时刷新
- 点偏好列表右边的「删」→ DELETE /api/memory → 偏好从 db 移除
- **跨会话验证**：写入偏好 → 关浏览器标签页 → 重开 → 发消息 → 模型仍按偏好回答（≠ step-1 的"全靠前端 messages 累积"）
- 「清空对话」只清前端 messages，Memory 不动（preferences.db 还在）
- 服务端 logs/ 每天一个文件，每次请求都能翻完整 messages + fromMemory + 注入段

## step-2 教学点（单变体 · M2 偏好 + O1 写入 + O2 注入）

- **M2 偏好跨会话持久化**：服务端从 `data/preferences.db` 读偏好 → 拼到 system 末尾 → 模型据此回答
- **O1 写入（POST /api/memory）**：手动触发（避免误抓）；UI 上一键写
- **O2 注入（kvList → system）**：前端 React state 看不到这段；服务端日志 `data.fromMemory` + `request.messages[0]` 完整可见
- **§5.3.17 KV 抽象**：`lib/db.ts` 是唯一触点；`kvGet/kvSet/kvDel/kvList` 4 函数签名稳定；`data/preferences.db` 文件名按业务命名；接口层不绑业务语义
- **对比 step-1 的关键变化**：
  - step-1：messages 数组 = Context；刷新页面 = 没了
  - step-2：messages 数组 = Context（不变）+ Memory 注入段（新增，跨会话还在）
- **不在 step-2**：
  - O3 覆盖（同名 key 整体覆盖）— 端点已支持（POST 同 key 会 UPSERT），UI 留给 step-3 显式演示
  - O4 删除 UI — 端点已支持（DELETE），UI 上已有「删」按钮但只演示基础链路，step-3 上「忘掉所有」批量清
  - 自动触发写入（消息里命中"我叫"）— 01 MD 取舍节写「新手先手动」，先验证链路
  - 多用户隔离 — 单用户 demo（`USER_ID = "default"`）；接口第一个参数 userId 已留好，多用户 demo 改 USER_ID 来源（cookie / JWT）

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/01-Context-vs-Memory.md](../../../docs/学习模块/06-多轮对话与Context/01-Context-vs-Memory.md)

## 下一步

- 学习者主动锁定后 → 双方决定 step-3 加什么（按 §5.3.14）：
  - 候选 1：O3 覆盖 + O4 「忘掉所有」批量清 UI（step-2 链路已通，加 UI 演示完 4 个 O 变体）
  - 候选 2：M1 事实变体（写入「我叫 Tina」→ 跨会话还知道）+ 自动触发（消息里命中"我叫 / 我偏好"）
  - 候选 3：长对话测试（50+ 轮 → 看 preferences.db 没爆 → 为下一条「压缩 / 摘要 vs 滑动窗口」铺垫）
- 锁定前 §5.3.2 6 项里缺的按需补（健康检查 / env-info / 两类错误 / loading 状态 已有）
