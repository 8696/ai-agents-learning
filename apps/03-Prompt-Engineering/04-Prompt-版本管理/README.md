# Demo · Prompt 一字之差：v1.0.0 vs v1.1.0（§5.3 React + koa 完整版）

对应小节：[docs/学习模块/03-Prompt-Engineering/04-Prompt-版本管理.md](../../../docs/学习模块/03-Prompt-Engineering/04-Prompt-版本管理.md)

**端口**：`50304` · 浏览器打开 `http://127.0.0.1:50304/`（可用环境变量 `PORT=` 单次覆盖）。

## 怎么跑

```bash
cd apps
yarn install
yarn app:03-04-prompt-versioning-diff
```

启动后打开 `http://127.0.0.1:50304/`。需要 `apps/.env` 里的 API Key（协议 A，由 `LLM_PROVIDER` 选用）。并排对比一次 = 两次短请求。

按 Ctrl+C 退出。

## 数据流

```text
人：编辑 v1.0.0 / v1.1.0 两个文本框（或保留默认）→ 选问题 → 点「并排对比」
  → POST /api/compare { text, modes, prompts: { v1, v2 } }
  → 同一 SYSTEM_PROMPT
     v1.0.0：User = body.prompts.v1 + "\n\n问题：" + body.text
     v1.1.0：User = body.prompts.v2 + "\n\n问题：" + body.text
  → MiniMax 协议 A（temperature 0）
  → 服务端算字符长度 / 是否含推理标记 / 首段 preview
  → #output 左右两栏覆盖显示最新对比 + 顶部黄底提示输出字符数差
```

两版的 Prompt（User 末尾）**完全由你编辑**；服务端不在请求之外注入任何文本。这条路径本身就是「Prompt 也是代码，要 diff、要回归」的最小可编辑单元——你随手改一行，下次「并排对比」就能看 148 字符差变成 0 或者再放大。

## 当前能做什么

- **Happy path**：同一条题目并排跑两版（一字之差），看输出长度、是否含推理、首段 preview 的差距。
- **错误处理**：空输入 → HTTP 400；Key 缺失 / 上游 API 失败 → 5xx 文案进红字；浏览器 30s abort → `#status-pill` 红色（网络/超时）。
- **Loading**：请求中 pill = 🔄请求中，按钮 `disabled`。
- **单会话输出区**：`#output` 覆盖最新对照，不另开会话。

预置五条样本——都是"直答容易翻车，加一句 step by step 更稳"的题型：

| # | 题型 | 直答为何会翻车 |
| - | ---- | -------------- |
| 1 | 追击问题 | 多步算术易在第二辆车的"已经先走了 2 小时"这一步漏条件 |
| 2 | 含混分类 | 正/负词都有，直答倾向一边；CoT 让模型先列正负再下结论 |
| 3 | 质数拆分 | 直答常常给不出 3 个素数；CoT 拆解后才找得到 5+7+13 之类的组合 |
| 4 | 数字排序 | 直答凭印象排错；CoT 显式比较精度 |
| 5 | 反讽判断 | 字面夸、情绪骂；CoT 显式拆"字面 vs 情绪"两轴 |

## 对应学习沉淀

`docs/学习模块/03-Prompt-Engineering/04-Prompt-版本管理.md`（讲完后沉淀；本 README 只描述代码怎么跑）。
