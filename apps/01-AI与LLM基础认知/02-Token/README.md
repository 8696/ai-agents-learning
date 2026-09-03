# 01 · 02 · Token Demo

不调 LLM、不消耗额度。本地 `gpt-tokenizer` encode（cl100k），必须在浏览器里看见「字符数 vs Token 数」。

## 跑入口

```bash
cd apps
yarn install
yarn app:01-02-token
```

端口 `50102` · 浏览器 `http://127.0.0.1:50102/`

## 数据流

```text
浏览器
  → POST /api/compare（固定中英样本）
  或 POST /api/encode { text }
  → gpt-tokenizer encode()（cl100k）
  → { charCount, tokenCount, previewIds }
  → #output 绿卡并排
```

## 当前能做什么

- 对照页：同一句意思，英文 vs 中文的 Token 数差多少
- 自定义页：自己贴一段，看见 Token 是「一串 id」
- 空文本 → HTTP 400；断网按钮 → fetch reject（#status-pill 红色）
- 页脚写「本地计算（不调 LLM）」；缺 Key 不禁用主按钮

## 文件结构

```
02-Token/
├── server.ts
├── lib/tokenize/          # encode + 对照样本
├── lib/http/              # PORT / 入参闸门
├── routes/health.ts · encode.ts
└── public/pages/compare.html · encode.html
```

## 已知边界

cl100k 是 OpenAI 的词表，和 `apps/.env` 里配置的厂商未必相同。绝对值会变，「中文更碎」的方向一致。

## 概念 / 取舍 / 踩坑

[docs/学习模块/01-AI与LLM基础认知/02-Token.md](../../../docs/学习模块/01-AI与LLM基础认知/02-Token.md)
