# 05 · 01 · Function Calling 协议 · step-6 协议层数据形态 + 编造检测可观察

端口：`50022`

## 跑

```bash
cd apps
yarn app:05-01-fc-protocol-step-6
```

浏览器打开 <http://127.0.0.1:50022/>

**前置**：在 `apps/.env` 配 `LLM_PROVIDER` + 该家 `*_API_KEY`（参考 [apps/README.md](../../README.md) 顶层说明）。没配 Key → 服务能起，但主按钮 disabled。

## 数据流

```
用户输入
  ↓
POST /api/chat { input }
  ↓
Round 1: messages=[user] + tools=[3 项 Registry 派生] + tool_choice="auto"
  ↓
  openai.chat.completions.create(req1) → resp1 (含 tool_calls)
  ↓
Execute: toolCallsFromLLM → executeTool() → tool_results
  ↓
detectHallucination(finalReply, toolResults)
  → { isHallucinated, sourceNumbers, replyNumbers, fakeNumbers }
  ↓
Round 2: messages=[user, assistant(tool_calls), tool × N]
  ↓
  openai.chat.completions.create(req2) → resp2 (final_reply)
  ↓
ctx.body = { user_input, round_1, model_tool_calls, tool_results, round_2, final_reply, hallucination }
  ↓
浏览器：4 张数据卡 + 🔍 编造检测栏
```

## step-6 vs step-2

| step-2 | step-6 |
|--------|--------|
| 4 张数据卡（Round 1/2 Request/Response） | 4 张数据卡 + **🔍 编造检测栏** |
| 路由层把 round_1/round_2/final_reply 返前端 | 路由层额外跑 detectHallucination，把 reply 数字 vs tool_result 数字差异列出 |
| calc 标 dangerous（gateway 拦截教学锚点） | calc 标 safe（让数字引用演示可行；真实场景必须 dangerous） |

## 关键教学点

**协议层物理形态**（同 step-2）：
- Round 1 Request 里 `messages + tools + tool_choice`
- Round 1 Response 里 `choices[0].finish_reason === "tool_calls"`
- Round 2 Request 里 `messages` 多 `assistant(tool_calls) + tool × N`
- Round 2 Response 里 `choices[0].message.content` 就是 final_reply

**编造检测**（step-6 新增）：
- 源集 = flatten(tool_results) 里所有数字
- reply 数字 = regex 抓 `¥\s*\d+` + `\d+\s*°C`（避免量词误抓）
- fake = reply 数字 ∖ source 数字
- `isHallucinated = fake.length > 0`

## 当前能做什么

- 让 LLM 调用真的发生（不是 mock）
- 把每一轮 LLM 调用全量打回前端可视化
- 自动检测 reply 是否引用 tool_result
- 让"模型到底有没有编造数字"在页面上**自动可见**

## 对应学习沉淀

[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)
