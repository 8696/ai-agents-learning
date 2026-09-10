# Tool Gateway · step-1 · 协议 B + 三钩子 + 危险二次确认（已锁定 ✅）

对应学习沉淀：[04-Tool-Gateway-幂等.md](../../../docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md)

> **状态**：✅ 已锁定（2026-09-08 · 学习者主动锁定 · `node scripts/check-demo.cjs` 过 · §5.3.2 6 项齐）
> 锁定后冻结；要改 = 建 step-(N+1)。

## 怎么跑

```bash
cd apps && yarn app:05-04-tool-gateway-step-1
```

- **端口**：`50034`
- **浏览器**：http://127.0.0.1:50034/
- **真调 LLM**（`callsModel: true` · 协议 B · Anthropic Messages API）—— 模型发 tool_use → executeTool → Gateway 三钩子 → 拒绝/通过/二次确认

**前置**：在 `apps/.env` 配 `LLM_PROVIDER` + 该家 `*_API_KEY`（参考 [apps/README.md](../../README.md) 顶层说明）。没配 Key → 服务能起，但主按钮 disabled。

## 数据流

```text
用户填 query + actor(role/userId) + confirmToken
  → POST /api/chat { input, actor, confirmToken }
  → routes/chat.ts
    → Round 1: messages=[user] + tools=[delete_user · 协议 B input_schema] + max_tokens
      → callProtocolB(req1) → resp1（content blocks · stop_reason="tool_use" 时含 tool_use）
    → execute: model_tool_uses → executeTool(name, input, tool_use_id, {actor, confirmToken})
      → Registry 闸 + Zod 校验 + Tool handler
      → Tool handler 内部走 Gateway 三钩子（鉴权/配额/危险） → audit
    → Round 2: messages=[user, assistant(content blocks), user(content: tool_result blocks)]
      → callProtocolB(req2) → resp2（final_reply）
  → 返 { user_input, actor, confirm_token, round_1, model_tool_uses, tool_results, round_2, final_reply }
  → 浏览器 #output 渲染：Round 1/2 四张数据卡 + 钩子判定链 + tool_result 内容 + final_reply
```

## 当前能做什么

- **演示 Gateway「请求 ≠ 执行」**：模型发出的 tool_use 必须先过三钩子（鉴权 / 配额 / 危险）才允许真正执行
- **演示危险操作二次确认**：delete_user 永远要 confirm_token，不带就返 `NEEDS_CONFIRM`（前端看到提示后**重新点按钮**带 confirm_token="I-CONFIRM" 才能通过）
- **演示鉴权失败**：把 actor role 切到 user → Tool handler 内 auth 钩子直接拒，返 `FORBIDDEN`
- **演示配额**：同 actor 连续成功执行 delete_user 5 次 → 第 6 次起 quota 钩子返 `RATE_LIMITED`
- **演示协议 B 物理形态**：content blocks 数组、tool_use.input 是对象、必填 max_tokens、tool_result 用 `role:"user"` + blocks 塞回 messages
- **审计**：每次 Tool 调用（通过/拒绝）写一行 audit，含 actor / tool / args_hash / decision / reason_code（前端通过 `/api/chat` 返回值间接看到；日志文件 `logs/{YYYY-MM-DD}.log` 全量）

## 教学覆盖的需求清单条

- 需求 1 · 删用户 Tool：Gateway 三钩子 + 二次确认（**全过** · 变体 1）
- 需求 5 · 审计日志（**部分覆盖** · Tool handler 每次调 Gateway 都写 audit 行，但本 demo 未把审计作为独立教学点）

## §5.3.2 6 项全齐

- Happy path ✓ 真调协议 B（Anthropic Messages API）Round 1 → Round 2 → final_reply
- 错误处理 ≥2 类 ✓ HTTP 502 上游 LLM 失败 + Gateway 拒绝（FORBIDDEN / RATE_LIMITED / NEEDS_CONFIRM）→ 红字 + ❌ pill
- Loading ✓ runChat setStatus → pill 切 🔄 + 按钮 disabled
- 单会话输出 ✓ 4 张数据卡 + 钩子判定链 + final_reply 全在同一 `#output`
- 环境元信息 ✓ /health + 页脚 #env-info
- 页面自解释 ✓ #page-intro 3 步 + 每个按钮旁「点了会发生什么」

## 关键教学点（合上文件后还能自己讲出来也能讲清）

| 概念 | 在哪一页 | 一句话 |
| ---- | -------- | ------ |
| **模型发 tool_use ≠ 允许执行** | Tool handler 走 Gateway 三钩子 | 协议层模型的「想调」只是请求，**真正能不能调**由 Tool handler 内部的钩子说了算 |
| **协议 B 字段层形态** | Round 1/2 数据卡 | content 是 blocks 数组、tool_use.input 是对象、必填 max_tokens、塞回 messages用 role:"user" + tool_result blocks |
| **三钩子顺序** | 钩子判定链 | 鉴权（必须最先）→ 配额（每月上限）→ 危险（confirm_token）—— 任一不过立说完就停，不进入下一钩 |
| **失败也写 audit** | 后端日志 + audit 元信息 | actor / tool / args_hash / decision("blocked"/"allowed") / reason_code 全留痕；「为什么没执行」能查 |
| **Registry ≠ Gateway** | registry.ts + delete-user.ts | Registry 闸是防御性白名单（防御未注册工具）；Gateway 钩子是真正的「能不能调」决策 |

## 对应学习沉淀

[docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md](../../../docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md)

- 变体 1：delete_user Gateway 三钩子 + 二次确认（本步）
- 变体 2/3/4（create_order 幂等 / read_recent_emails 委托授权 / Tool 抛错结构化）→ step-2/3/4 后续