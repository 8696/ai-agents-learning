# 09-RAG进阶 · 01-BM25-混合检索 · step-4（已锁定 2026-09-12）

## 跑入口

```bash
cd apps && yarn app:09-01-bm25-hybrid-step-4
```

浏览器：`http://127.0.0.1:50090/`

## 端口

`50090`（apps/README.md 占用表、package.json yarn 脚本、`runtime-ctx.ts` `.default()`、本 README 四处一致；本步不复制到别处）。

## 数据流

```text
浏览器输入问句
   ├─ 沿用 step-1 / step-2 / step-3 所有按钮（向量 / BM25 / 加权 / RRF / 偏置）
   └─ #output 区切词对照卡 → POST /api/search-bm25-variant（step-4 新增）
         └─ routes/search-bm25-variant → lib/flow/bm25-variant.bm25Variant
             ├─ 同问句两次 BM25（mode="keep-dash" vs mode="split-chars"）
             ├─ keep-dash：SKU-8821 → ["SKU-8821","保","修","几","年"]
             ├─ split-chars：SKU-8821 → ["S","K","U","-","8","8","2","1","保","修","几","年"]
             └─ 返回两份 Top-K + tokens
```

## 当前能做什么（step-4 在 step-3 基础上加的）

- **切词对照（变体 8）**：同一问句用两种切词法 → 同一 BM25 算法 → 排名变差。
  - `keep-dash`（保留连字符）：`SKU-8821` 作为整体一个 token，IDF 高，能命中编号卡
  - `split-chars`（撕成单字）：连字符也拆成单字符，编号被撕碎，BM25 通道退化
- **#output 加「切词对照卡」**：跑一次 → 显示 tokens 列表 + 两张 Top-K 表并排。
- **失败可读**：4xx（mode 错 / JSON 错）+ 5xx。

## 对应学习沉淀

- 概念：[docs/学习模块/09-RAG进阶/01-BM25-混合检索.md](../../docs/学习模块/09-RAG进阶/01-BM25-混合检索.md)
- 进度表：模块 09 README「小节进度」第 1 条；本步覆盖需求 8（变体 8）。

## 局限（step-4 边界）

- **覆盖变体 8**：切词对照。本条 8 个变体全覆盖。
- **真实中文分词**：本 demo 教学版只演示「保留连字符 vs 撕单字」两种极端，未接 jieba 等中文分词库（生产里用 jieba / HanLP 等）。