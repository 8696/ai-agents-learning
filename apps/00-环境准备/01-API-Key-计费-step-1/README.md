# Demo · API Key / 计费（§5.3 React + koa）

对应：[模块 00 · API Key / 计费](../../../docs/学习模块/00-环境准备/01-API-Key-计费-step-1.md)

本条必须看见：一次请求里 `prompt_tokens` 和 `completion_tokens` 分开计价，**输出通常更贵**。订阅 Key ≠ 按量 Key 仍靠笔记和控制台。

## 端口

**50001**。可临时 `PORT=50999 yarn app:00-01-api-key-billing-step-1` 覆盖。

## 浏览器访问

```bash
cd apps
yarn app:00-01-api-key-billing-step-1
# → http://127.0.0.1:50001/                      总览（示例单价，不调模型）
# → http://127.0.0.1:50001/pages/usage.html      单次计费
# → http://127.0.0.1:50001/pages/compare.html    长输入短输出 vs 短输入长输出
```

## 数据流

```text
场景页
  → POST /api/billing | /api/billing-compare
  → routes/*（薄）
  → lib/flow/measure-one-call.ts（真调一次）
  → lib/billing/pricing.ts（示例单价折钱）
  → JSON { measurement | cases + verdict }
```

## 文件结构

```
01-API-Key-计费/
├── server.ts
├── routes/  lib/{http,billing,flow}/
└── public/{index.html, pages/, components/, utils/}
```

只 import `apps/llm.ts`。单价是示例，页面从 `GET /health` 读，禁止写死模型名。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | provider / model / hasKey / pricing |
| POST | `/api/billing` | 调 1 次，回分项账单 |
| POST | `/api/billing-compare` | 调 2 次固定 preset，回并排对照 |

## §5.3.2 六项

各场景页齐：happy path、错误 ≥2 类（空 prompt 400、网络错误）、loading、`#output`、页脚 `#env-info`、`#page-intro`。无 Key 时主按钮 disabled。

## 对应学习沉淀

[docs/学习模块/00-环境准备/01-API-Key-计费-step-1.md](../../../docs/学习模块/00-环境准备/01-API-Key-计费-step-1.md)
