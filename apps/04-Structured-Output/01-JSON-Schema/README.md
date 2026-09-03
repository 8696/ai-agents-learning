# 04 · Structured Output · 01 JSON Schema

Zod 端的"返回值长什么样" — 验证 [04 · 01 JSON Schema](../../docs/学习模块/04-Structured-Output/01-JSON-Schema.md) 这一条的 Zod 行为（**不调 LLM API**）。

## 怎么跑

```bash
cd apps
yarn app:04-01-json-schema
```

无外部依赖、无 `.env` 要求、不开端口。

## 数据流

```
Intent schema (Zod, TS)
        │
        ├─→ JSON Schema literal (手写 → 生产用 zod-to-json-schema)
        │      ↓
        │   喂给 LLM SDK（OpenAI / Anthropic structured outputs）
        │
        ├─→ Intent.parse(input)         → typed 对象 / 抛 ZodError
        ├─→ Intent.safeParse(input)     → { success, data | error }
        │      └─ bad.error.issues      → 喂回模型做 repair
        └─→ Intent.transform(...)       → 加字段 / 改结构
```

## 当前能做什么

- 看 `parse` 成功返回值的真实形态 + TS 编译期 narrow
- 看 `safeParse` 失败返回值的 `success` / `data` / `error` 三个字段谁存在谁不存在
- 看 `ZodError.issues` 数组每条 `path | code | message` 怎么读、怎么拼成 repair prompt
- 看 `transform` 给 schema 加字段后类型怎么变
- 看同一份契约的 JSON Schema literal 长什么样（手写 vs 生产工具 `zod-to-json-schema`）

## 对应学习沉淀

- 文档：[`docs/学习模块/04-Structured-Output/01-JSON-Schema.md`](../../docs/学习模块/04-Structured-Output/01-JSON-Schema.md)
- 进度：[模块 04 · Structured Output · 小节进度](../../docs/学习模块/04-Structured-Output/README.md#小节进度)

## 没在这里做的事（留给 02）

- 不调 LLM API（无 .env、无 key）
- 不演示 JSON Mode vs Structured Output 的真实 API 行为
- 不演示 prompt 里把 schema 灌给模型的过程

以上全部在 02（JSON Mode vs Structured Output）那条落地。
