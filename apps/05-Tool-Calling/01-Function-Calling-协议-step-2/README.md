# 05 · 01 · Function Calling 协议 · step-2 已锁定 ✅

端口：`50018`

## 跑

```bash
cd apps
yarn app:05-01-fc-protocol-step-2
```

浏览器打开 <http://127.0.0.1:50018/>

**前置**：在 `apps/.env` 配 `LLM_PROVIDER` + 该家 `*_API_KEY`（参考 [apps/README.md](../../README.md) 顶层说明）。没配 Key → 服务能起，但主按钮 disabled。

## 数据流

```
用户输入
  ↓
POST /api/chat { input }
  ↓
Round 1: messages=[user] + tools=[3 项 Registry 派生] + tool_choice="auto"
  ↓
  openai.chat.completions.create(req1) → resp1
  ↓
  resp1.choices[0].message.tool_calls → model_tool_calls
  ↓
Round 2 (如果模型决定调工具):
  messages=[user, assistant(tool_calls), tool, tool, ...] + tools + tool_choice="auto"
  ↓
  openai.chat.completions.create(req2) → resp2
  ↓
  resp2.choices[0].message.content → final_reply
  ↓
ctx.body = { user_input, round_1, model_tool_calls, tool_results, round_2, final_reply }
  ↓
浏览器 #llm-protocol 把 4 张卡（Request/Response × 2 轮）摆出来
```

## 当前能做什么

step-2 是 step-1 的**真 LLM 升级版**（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)），已**锁定 ✅**：

| step-1（mock） | step-2（真 LLM） |
| --- | --- |
| `decideToolCalls(mode, input)` hardcode 返回 tool_calls | 真 `openai.chat.completions.create()` → 模型自己决定 |
| `buildFinalReply(results)` 拼字符串 | 真 LLM 第二轮：把 tool_result 回灌，模型生成自然语言 |
| execute 用 mock get_weather/search/calc | execute 不变（Registry 是 SDK 无关中间层） |
| 前端只显示业务 trace | 前端**多一节 #llm-protocol**：Round 1/2 的 Request/Response JSON 全量摆出来 |

**§5.3.2 6 项全齐**：
- Happy path ✓ 真 LLM Round 1 → Round 2 → final_reply
- 错误处理 ≥2 类 ✓ Class A（HTTP 400 空输入 + HTTP 502 上游错 → 红字 + ❌ pill）+ Class B（Gateway/Zod reject → kind="reject" 红卡）
- Loading ✓ runDemo setStatus → pill切 🔄 + 按钮 disabled
- 单会话输出区 ✓
- 环境元信息 ✓ /health + #env-info
- 页面自解释 ✓ #page-intro 6 步

**关键教学点**：在 `#llm-protocol` 你能看到协议层**物理形态**：
- Round 1 Request 里 `messages + tools + tool_choice`
- Round 1 Response 里 `choices[0].finish_reason === "tool_calls"`（决定调工具的关键判断）
- Round 2 Request 里 `messages` 多了 `assistant(tool_calls) + tool × N`
- Round 2 Response 里 `choices[0].message.content` 就是 final_reply

## 协议 B 镜像（§5.3.13 另起一份 → step-3）

要做协议 B → 复制本步（[§5.3.13](../../AGENTS.md#5313-协议-a--协议-b-分开落-demo-强制)）：`01-Function-Calling-协议-step-3/`；端口按占用表顺序分配；只引 `@anthropic-ai/sdk`。**Registry + Tool 定义 + execute 路径全部共享**——只换 `lib/llm/protocol-*.ts` + 路由层协议选择。

## 对应学习沉淀

[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)