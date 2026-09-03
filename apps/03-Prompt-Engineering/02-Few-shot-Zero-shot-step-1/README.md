# Demo · Few-shot / Zero-shot 对照（§5.3 React + koa 完整版）

对应小节：[docs/学习模块/03-Prompt-Engineering/02-Few-shot-Zero-shot-step-1.md](../../../docs/学习模块/03-Prompt-Engineering/02-Few-shot-Zero-shot-step-1.md)

**端口**：`50302` · 浏览器打开 `http://127.0.0.1:50302/`（可用环境变量 `PORT=` 单次覆盖）。

## 怎么跑

```bash
cd apps
yarn install
yarn app:03-02-few-shot-zero-shot-step-1
```

启动后打开 `http://127.0.0.1:50302/`。需要 `apps/.env` 里当前 `LLM_PROVIDER` 的 Key（协议 A）。并排对比一次 = 两次短请求。

按 Ctrl+C 退出。

## 数据流

```text
人：总览 → 并排对照 → 选一条评价 → 点「并排对比」
  → POST /api/classify { text, modes: ["zero","few"] }
  → 同一 SYSTEM_PROMPT
     Zero：messages = system + 当前 user
     Few ：messages = system + 4 对假 user/assistant + 当前 user
  → 模型协议 A（temperature 0）
  → 服务端先剥思考块，再 Zod 判 {label, reason}
  → #output 左右两栏覆盖显示最新一次；hadThinking 标明嘴边是否夹了思考
```

## 当前能做什么

- **Happy path**：同一句评价并排 Zero-shot / Few-shot；网关剥思考块后再判格式；灰区标签（包装差但豆子可用 → 中评）。Zero-shot 仍可能 `hadThinking: true`（壳能过，但嘴边不纯）。
- **错误处理**：空输入 → HTTP 400；Key 缺失 → 页脚 Key ❌ 且主按钮 disabled；上游 API 失败 → 5xx 文案进红字；fetch 发不出去 → `#status-pill` 红色。
- **Loading**：请求中 pill = 🔄请求中，按钮 `disabled`。
- **单会话输出区**：`#output` 覆盖最新对照，不另开会话。
- **环境元信息**：`GET /health` 填页脚 `#env-info`（provider / model / Key，不写死模型名）。

预置五条样本：好评 / 中评 / 差评主路径、灰区、捣乱句。

## 对应学习沉淀

`docs/学习模块/03-Prompt-Engineering/02-Few-shot-Zero-shot-step-1.md`（讲完后沉淀；本 README 只描述代码怎么跑）。
