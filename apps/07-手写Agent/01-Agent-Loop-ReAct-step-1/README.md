# 模块 07 · 01 · Agent Loop / ReAct · step-1 最小可观察

> step-1 状态：**🔄 打磨中**（2026-09-10）。§5.3.2 6 项基本齐；学习者主动锁定后冻结。N 动态，下一步双方决定加什么。

## 端口

`50049`

## 跑入口

```bash
cd apps && yarn app:07-01-agent-loop-react-step-1
```

浏览器：[http://127.0.0.1:50049/](http://127.0.0.1:50049/)

## 数据流

```text
浏览器输入框 → fetch POST /api/agent-run { query }
       │
       ▼
koa bodyParser → routes/agent.ts Zod 校验
       │
       ▼
取 llm 客户端 → runAgentLoop({ initialMessages: [system, user], openai, model })
       │
       │  while (round < MAX_ROUNDS=6)
       │    ├─ Reason：openai.chat.completions.create({ messages, tools })
       │    │   └─ assistant_message
       │    ├─ ① push assistant_message 进 messages
       │    ├─ tool_calls 为空 → 最终答案（变体 J） → break
       │    ├─ ② Act：每个 tool_call → registry.handlers.get(name)(args) → 返回 content
       │    ├─ ③ Observe：把 tool 消息按 role:'tool', tool_call_id 追加进 messages
       │    └─ 进下一圈
       │
       ▼
返回 { trajectory, finalAnswer, stoppedReason, rounds, finalMessages }
       │
       ▼
React 按圈渲染：每圈一张卡（assistant + tool_calls + tool_results + 耗时） + 最终答案绿卡
```

服务端日志（`logs/YYYY-MM-DD.log`）每圈写：调用循环开始/结束 + 调用模型开始/结束（入参完整 messages + 返回值完整 + `__code` + 耗时）+ 每个 tool_call 调函数开始/结束（入参完整 arguments + 返回值完整 content + 耗时）。

## 当前能做什么

- 输入框写一句任务 → 点「跑 Agent」→ 真调 LLM 跑一整轮 Agent Loop
- 期望看到 ≥ 2 圈：第 1 圈 `list_todos`（变体 D 串行依赖起点）→ 第 2~N 圈 `complete_todo` → 最后一圈无 tool_calls → 绿卡最终答案
- 轨迹区按圈展开：每圈显示 Reason（assistant 摘要 + tool_calls 或正文）/ Act+Observe（每个 tool_result 原文 + 是否成功）/ 圈耗时
- 跑完可展开「完整 messages」看到 Loop 把 assistant+tool 一圈一圈追加进了什么
- 类 A 错误：发空字符串 → 400 黄字（Zod 校验）
- 类 B 错误：点「演示上游失败」→ 502 红字（教学用端点）
- 缺 Key 时主按钮 disabled，页脚 `密钥 ❌`

## step-1 教学点

- **本条「Agent Loop / ReAct」最小可观察**：
  - Loop = `while` + 停止条件；本 step 唯一停止条件 = 变体 J 最终答案
  - trajectory 一圈一圈长，messages 在跑什么阶段肉眼可见
  - 变体 D 串行依赖：complete 必须等 list 给的 id；模型自动多圈
  - 变体 H 多圈：结构允许 N 跳，由停止条件收
  - 变体 C 零工具直答 + 变体 A/B 隐式 Reason：本 step 默认 query 必走多圈；可在输入框换 query 试「1+1」（期望 1 圈走最终答案）
- **不在 step-1**：
  - 变体 E 并行 Act（同一圈多个 tool_call）
  - 变体 G 失败 Observe 后继续（当前 handler throw 仍塞回 messages，但没专门演示业务失败）
  - 变体 K 最大轮次作主教学点（当前 MAX 仅兜底，不指望触发）
  - 变体 L 超时 / 变体 M 用户取消
  - 显式 Thought（变体 A · 当前用现代 FC 默认 = 隐式 B）

## 对应学习沉淀

[docs/学习模块/07-手写Agent/01-Agent-Loop-ReAct.md](../../../docs/学习模块/07-手写Agent/01-Agent-Loop-ReAct.md)

## 下一步

- 学习者主动锁定后 → 双方决定 step-2 加什么（按 §5.3.14）：
  - 变体 E 并行 Act：query 改成「给我今天的天气 + 我的未读待办」，让模型一次要两个独立 tool_call，`Promise.all` 并行 execute
  - 变体 G 失败 Observe：故意把城市打成错别字 / 让 list 给空数组 → 看模型下一圈是否改参
  - 变体 K/L/M 主教学点：MAX_ROUNDS 调到很小跑「一直搜」型 query；或加 AbortSignal；或加用户取消按钮
  - 锁前 §5.3.2 6 项里缺的按需补（健康检查已含 / env-info 已含 / 两类错误 / loading 状态 / 自解释）
