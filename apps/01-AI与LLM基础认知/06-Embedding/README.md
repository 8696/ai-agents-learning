# 01 · 06 · Embedding Demo

不调嵌入 API、不消耗额度。玩具 2 维向量必须在浏览器里看见「id 相减无语义 / 余弦能排出谁近」。

## 跑入口

```bash
cd apps
yarn install
yarn app:01-06-embedding
```

端口 `50106` · 浏览器 `http://127.0.0.1:50106/`

## 数据流

```text
① 反例：POST /api/token-id { query }
     → 手写 Token ID 表相减 → 差值毫无语义

② 正例：POST /api/rank { query }
     → cosine(查询向量, 候选向量) → 按分数排序
     → 宠物 → 猫 / 狗 分高，→ 石头 分低
```

## 当前能做什么

- Token ID 页：四个词的 id 差值（石头可能更「近」，纯属巧合）
- 余弦页：同一批词换成向量，排序符合直觉
- 零向量 / 未知词 → HTTP 400；断网按钮 → fetch reject
- 页脚写「本地计算（不调 LLM）」；缺 Key 不禁用主按钮

## 为什么是 2 维玩具向量

真 Embedding 是 768 / 1536 维，人眼判断不了远近。2 维可以手写坐标。代价：坐标是编的，不代表任何真实模型。

## 文件结构

```
06-Embedding/
├── server.ts
├── lib/vec/               # 表 + 余弦 + 对照计算
├── lib/http/
├── routes/health.ts · token-id.ts · rank.ts
└── public/pages/token-id.html · cosine.html
```

## 概念 / 取舍 / 踩坑

[docs/学习模块/01-AI与LLM基础认知/06-Embedding.md](../../../docs/学习模块/01-AI与LLM基础认知/06-Embedding.md)
