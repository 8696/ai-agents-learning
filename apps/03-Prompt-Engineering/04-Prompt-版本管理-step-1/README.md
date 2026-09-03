# Demo · Prompt 一字之差：v1.0.0 vs v1.1.0（§5.3 React + koa 完整版）

对应小节：[docs/学习模块/03-Prompt-Engineering/04-Prompt-版本管理.md](../../../docs/学习模块/03-Prompt-Engineering/04-Prompt-版本管理.md)

**端口**：`50304` · 浏览器打开 `http://127.0.0.1:50304/`（可用环境变量 `PORT=` 单次覆盖）。

## 怎么跑

```bash
cd apps
yarn install
yarn app:03-04-prompt-versioning-diff-step-1
```

启动后打开 `http://127.0.0.1:50304/`。需要 `apps/.env` 里的 API Key（协议 A，由 `LLM_PROVIDER` 选用）。并排对比一次 = 两次短请求。

按 Ctrl+C 退出。

## 数据流

```text
人：总览 → 一字之差 → 编辑 v1.0.0 / v1.1.0（或保留默认）→ 选问题 → 点「并排对比」
  → POST /api/compare { text, modes, prompts: { v1, v2 } }
  → 同一 SYSTEM_PROMPT
     v1.0.0：User = body.prompts.v1 + "\n\n问题：" + body.text
     v1.1.0：User = body.prompts.v2 + "\n\n问题：" + body.text
  → 模型协议 A（temperature 0）
  → 服务端算字符长度 / 是否含推理标记 / 首段 preview
  → #output 左右两栏覆盖显示最新对比 + 顶部黄底提示输出字符数差
```

两版的 Prompt（User 末尾）**完全由你编辑**；服务端不在请求之外注入任何文本。

## 当前能做什么

- **Happy path**：同一条题目并排跑两版（一字之差），看输出长度、是否含推理、首段 preview 的差距。
- **错误处理**：空输入 → HTTP 400；Key 缺失 → 页脚 Key ❌ 且主按钮 disabled；上游 API 失败 → 5xx 文案进红字；fetch 发不出去 → `#status-pill` 红色。
- **Loading**：请求中 pill = 🔄请求中，按钮 `disabled`。
- **单会话输出区**：`#output` 覆盖最新对照，不另开会话。
- **环境元信息**：`GET /health` 填页脚 `#env-info`（provider / model / Key，不写死模型名）。

预置五条样本——都是「直答容易翻车，加一句 step by step 更稳」的题型。

## 对应学习沉淀

`docs/学习模块/03-Prompt-Engineering/04-Prompt-版本管理.md`（讲完后沉淀；本 README 只描述代码怎么跑）。
