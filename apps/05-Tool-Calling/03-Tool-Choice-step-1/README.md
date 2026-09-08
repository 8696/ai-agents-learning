# Tool Choice · step-1 · auto / none / required

对应学习沉淀：[03-Tool-Choice.md](../../../docs/学习模块/05-Tool-Calling/03-Tool-Choice.md)

## 怎么跑

```bash
cd apps && yarn app:05-03-tool-choice-step-1
```

- **端口**：`50031`
- **浏览器**：http://127.0.0.1:50031/

## 数据流

```text
页面选 tool_choice（auto|none|required）+ 共用 query
  → POST /api/choice
  → 协议 A：chat.completions.create({ tools 固定, tool_choice 可变 })
  → 返回 finish_reason / content / tool_calls（本步不执行 Tool）
  → 前端写入该档位槽位；三档结果常驻对照
```

## 当前能做什么

- 前端切换三档 Choice，逐档跑、结果互不覆盖
- 三栏卡片 + 差异摘要表：对照 `hasToolCalls` / `finish_reason` / tool names / **协议判定**
- `required` 却无 tool_calls、或 `none` 仍有 tool_calls → 卡片与摘要表标红「Provider 违约」
- 错误：空 query → 400；缺 Key → 503（按钮禁用）；模型失败 → 502

## 日志

服务端：`logs/{YYYY-MM-DD}.log`（BJT 日切）
