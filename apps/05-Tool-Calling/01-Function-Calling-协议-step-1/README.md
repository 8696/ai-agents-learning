# 05 · 01 · Function Calling 协议 · step-1 已锁定 ✅

端口：`50017`

## 跑

```bash
cd apps
yarn app:05-01-fc-protocol-step-1
```

浏览器打开 <http://127.0.0.1:50017/>

## 数据流

```
用户输入
  ↓
POST /api/chat-mock { input, mode }
  ↓
模型决定（mock）→ model_tool_calls[]（按 mode 选 single / multi / danger）
  ↓
execute 通过 Registry.executeTool() —— gatewayCheck → Zod safeParse → handler
  ├─ safe → { ok:true, result }
  ├─ 未注册工具 → { ok:false, error: "unknown tool" }   （gateway 拦）
  ├─ dangerous 工具 → { ok:false, error: "manual approval" }（gateway 拦）
  └─ Zod 失败 → { ok:false, error: "Zod parse failed: ..." }
  ↓
tool_results[] → 回灌模型
  ↓
buildFinalReply()（mock；锁定后换真 LLM 第二轮）
```

## 当前能做什么

step-1 已**锁定 ✅**（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)）—— 不调 LLM，mock 返回固定数据；§5.3.2 6 项全齐：

- 输入框写用户问题 → 点按钮跑一圈
- **「演示单工具（get_weather）」** → 1 个 tool_call → 1 个 tool_result → 1 条 final_reply
- **「演示 Registry 多工具（并行 get_weather + search）」** → 2 个 tool_call → 2 个 tool_result → 1 条 final_reply（mock 同步执行；真实场景 `Promise.all` 并发）
- **「试危险工具 calc（gateway 必拦）」** → Gateway 拦下，回灌 `{ok:false, error}`，trace 显示 **kind="reject" 红边卡片**（pill 仍 ✅，因为 API 本身成功，是工具层失败）
- 输出区 5 块卡片把完整一圈摆开：① 用户输入 → ② model 决定 → ③ execute → ④ tool_result → ⑤ model 终态
- **错误处理 ≥2 类**（§5.3.2 #2）：
  - **Class A · HTTP 层**：清空输入框点「演示单工具」→ HTTP 400 → 红字 + ❌ 状态条
  - **Class B · 工具层**：点「试危险工具 calc」→ Gateway 拒绝 → kind="reject" 红卡
- **Loading 联动**（§5.3.2 #3）：请求中按钮 disabled + 状态条切 🔄，完成/失败切 ✅/❌
- **Tool Registry 面板**：`GET /api/tools` 列出当前 server 注册的 3 个 Tool + safe/dangerous 标签

step-1 文件夹已**冻结**（锁后 bug 修复除外）。任何新功能 → 建 step-2。

## 锁定后下一步可以加（学习者主动决定）

| 方向 | 加什么 |
| ---- | ------ |
| 接真 LLM（协议 A） | `step-2` 已建，复制本步 + 加 `lib/llm/protocol-a.ts`；mock 换 `openai.chat.completions({ tools, tool_choice })`；两轮（round-1 拿 tool_calls，round-2 拿 final_reply） |
| 协议 B 镜像 | `01-Function-Calling-协议-ProtoB-step-1/`，端口按占用表顺序分配；只引 `@anthropic-ai/sdk`（按 [§5.3.13](../../AGENTS.md#5313-协议-a--协议-b-分开落-demo-强制)） |
| Tool Registry 进阶 | 多 Tool 路由（按 tool_choice 决定调哪个）、动态注册 |
| Gateway 进阶 | 用户鉴权、配额限流、敏感字段过滤、人工审批 |
| 错误回传 | 真实 handler 失败（DB 超时 / 第三方 5xx）包成 `{ok:false, error}` 回灌模型（这是 step-1 已经覆盖的，加进 § 错误处理例子里） |

## 对应学习沉淀

[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)