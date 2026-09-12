# 余弦相似度 · 第一步（step-1）

模块 08 · 第 3 条。本地二维教学向量，对照三把尺子。不调大模型。

## 怎么跑

```bash
cd apps
yarn app:08-03-cosine-similarity-step-1
```

端口 `50079` · 浏览器 `http://127.0.0.1:50079/`

## 数据流

```text
页面点「按余弦 / 点积 / 欧氏」
  → 各 POST 自己的 /api/score-*（body 空 = 用教学集）
  → readScoreBody 校验
  → scoreVectors 逐张打分、排序、写 shortVsLong
  → 本侧栏显示排名 + 判定
空卡片 → 400；/api/demo-error → 500
```

## 当前能做什么

- 看见问题 / 短同向 / 长同向 / 略偏 / 无关 五条二维向量
- 三侧分请求：余弦并列、点积长赢、欧氏长远
- 两类失败：空卡片 4xx、演示上游失败 5xx
- 页脚来自 `GET /health`（`callsModel: false`，缺密钥不禁用按钮）

## 对应学习沉淀

[docs/学习模块/08-RAG基础/03-余弦相似度.md](../../../docs/学习模块/08-RAG基础/03-余弦相似度.md)
