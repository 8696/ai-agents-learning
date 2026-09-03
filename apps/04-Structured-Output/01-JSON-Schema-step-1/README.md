# 04 · 01 · JSON Schema Demo

Zod 端的返回值长什么样（**不调 LLM**）。parse / safeParse / issues→repair / transform 必须在浏览器里点按钮才能看见。

## 跑入口

```bash
cd apps
yarn install
yarn app:04-01-json-schema-step-1
```

端口 `50014` · 浏览器 `http://127.0.0.1:50014/`

## 数据流

```text
Intent (Zod)
  → GET /health 带回 JSON Schema literal（喂给 SDK 的样子）
  → POST /api/parse    { raw }  → typed 值 / safeParse 形状
  → POST /api/repair   { raw }  → issues + repair prompt
  → POST /api/transform { raw } → 加 repaired / when
```

## 当前能做什么

- 总览页看见同一份契约的 JSON Schema
- parse 页对照成功值 vs `success=false` 时没有 data
- repair 页把 path / code / message 拼成可回灌文本（本条不真的调模型）
- transform 页看见 default 补 action、再加字段
- 空 raw / 非法 JSON / 缺 query → HTTP 400；断网按钮 → fetch reject
- 页脚写「本地计算（不调 LLM）」；缺 Key 不禁用主按钮

## 没在这里做的事（留给 02）

- 不调 LLM API
- 不演示 JSON Mode vs Structured Output 的真实 API 行为

## 文件结构

```
01-JSON-Schema/
├── server.ts
├── lib/schema/intent.ts   # Zod + JSON Schema + 三个 run*
├── lib/http/
├── routes/health.ts · parse.ts · repair.ts · transform.ts
└── public/pages/parse.html · repair.html · transform.html
```

## 对应学习沉淀

[docs/学习模块/04-Structured-Output/01-JSON-Schema-step-1.md](../../../docs/学习模块/04-Structured-Output/01-JSON-Schema-step-1.md)
